import './warnings';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DatabaseSync as SqliteDatabase } from 'node:sqlite';
import { dbPath } from '../config';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema';
import type {
  EventInput,
  LedgerEvent,
  Session,
  SessionInput,
  StoreStats,
} from './types';

// `node:sqlite` is an experimental builtin that some bundlers (Vite/Vitest)
// fail to externalize from a static import. Load it at runtime so only the
// type information is referenced statically.
const nodeRequire = createRequire(
  typeof __filename !== 'undefined' ? __filename : path.join(process.cwd(), 'index.js'),
);
const { DatabaseSync } = nodeRequire('node:sqlite') as {
  DatabaseSync: typeof SqliteDatabase;
};

type Row = Record<string, unknown>;

export class Store {
  private readonly db: SqliteDatabase;

  constructor(file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(SCHEMA_SQL);
    const row = this.db.prepare('SELECT version FROM schema_version LIMIT 1').get() as
      | { version: number }
      | undefined;
    if (!row) {
      this.db.prepare('INSERT INTO schema_version(version) VALUES (?)').run(SCHEMA_VERSION);
    }
  }

  close(): void {
    this.db.close();
  }

  upsertSession(s: SessionInput): void {
    this.db
      .prepare(
        `INSERT INTO sessions (id, cwd, started_at, ended_at, git_branch, git_commit, meta)
         VALUES (?, ?, ?, NULL, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           cwd        = excluded.cwd,
           started_at = COALESCE(sessions.started_at, excluded.started_at),
           git_branch = COALESCE(excluded.git_branch, sessions.git_branch),
           git_commit = COALESCE(excluded.git_commit, sessions.git_commit),
           meta       = COALESCE(excluded.meta, sessions.meta)`,
      )
      .run(
        s.id,
        s.cwd,
        s.startedAt,
        s.gitBranch ?? null,
        s.gitCommit ?? null,
        s.meta ? JSON.stringify(s.meta) : null,
      );
  }

  endSession(id: string, endedAt: string): void {
    this.db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(endedAt, id);
  }

  addEvent(e: EventInput): LedgerEvent {
    const seqRow = this.db
      .prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM events WHERE session_id = ?')
      .get(e.sessionId) as { m: number };
    const seq = (seqRow?.m ?? 0) + 1;
    const info = this.db
      .prepare(
        `INSERT INTO events (session_id, seq, ts, type, tool, summary, payload, redactions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        e.sessionId,
        seq,
        e.ts,
        e.type,
        e.tool ?? null,
        e.summary ?? null,
        e.payload !== undefined ? JSON.stringify(e.payload) : null,
        e.redactions ? JSON.stringify(e.redactions) : null,
      );
    return { ...e, id: Number(info.lastInsertRowid), seq };
  }

  getSession(id: string): Session | null {
    const row = this.db
      .prepare(
        `SELECT s.*, (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id) AS event_count
         FROM sessions s WHERE s.id = ?`,
      )
      .get(id) as Row | undefined;
    return row ? rowToSession(row) : null;
  }

  latestSession(): Session | null {
    const row = this.db
      .prepare(
        `SELECT s.*, (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id) AS event_count
         FROM sessions s ORDER BY s.started_at DESC LIMIT 1`,
      )
      .get() as Row | undefined;
    return row ? rowToSession(row) : null;
  }

  listSessions(limit = 20): Session[] {
    const rows = this.db
      .prepare(
        `SELECT s.*, (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id) AS event_count
         FROM sessions s ORDER BY s.started_at DESC LIMIT ?`,
      )
      .all(limit) as Row[];
    return rows.map(rowToSession);
  }

  getEvents(sessionId: string): LedgerEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM events WHERE session_id = ? ORDER BY seq ASC')
      .all(sessionId) as Row[];
    return rows.map(rowToEvent);
  }

  stats(): StoreStats {
    const s = this.db.prepare('SELECT COUNT(*) AS c FROM sessions').get() as { c: number };
    const e = this.db.prepare('SELECT COUNT(*) AS c FROM events').get() as { c: number };
    const last = this.db.prepare('SELECT MAX(ts) AS m FROM events').get() as { m: string | null };
    return { sessions: Number(s.c), events: Number(e.c), lastActivity: last.m ?? null };
  }
}

function rowToSession(r: Row): Session {
  return {
    id: String(r.id),
    cwd: String(r.cwd),
    startedAt: String(r.started_at),
    endedAt: (r.ended_at as string | null) ?? null,
    gitBranch: (r.git_branch as string | null) ?? null,
    gitCommit: (r.git_commit as string | null) ?? null,
    meta: r.meta ? (JSON.parse(String(r.meta)) as Record<string, unknown>) : undefined,
    eventCount: Number(r.event_count ?? 0),
  };
}

function rowToEvent(r: Row): LedgerEvent {
  return {
    id: Number(r.id),
    sessionId: String(r.session_id),
    seq: Number(r.seq),
    ts: String(r.ts),
    type: r.type as LedgerEvent['type'],
    tool: (r.tool as string | null) ?? null,
    summary: (r.summary as string | null) ?? null,
    payload: r.payload ? JSON.parse(String(r.payload)) : undefined,
    redactions: r.redactions
      ? (JSON.parse(String(r.redactions)) as Record<string, number>)
      : undefined,
  };
}

/** Open the store for the repo containing `start` (defaults to cwd). */
export function openStore(start?: string): Store {
  return new Store(dbPath(start));
}
