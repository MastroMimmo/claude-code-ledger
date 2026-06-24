import * as fs from 'node:fs';
import * as path from 'node:path';
import { ledgerDir } from '../config';
import { Store, openStore } from '../store/store';
import type { EventType } from '../store/types';

/**
 * Append-only operations recorded on the hot path. Each hook writes one line to
 * `.ledger/pending.jsonl`; reads drain it into SQLite lazily. Secrets are already
 * redacted before an op is written.
 */
export type PendingOp =
  | {
      op: 'event';
      sessionId: string;
      cwd: string;
      ts: string;
      gitBranch?: string | null;
      gitCommit?: string | null;
      type: EventType;
      tool?: string | null;
      summary?: string | null;
      payload?: unknown;
      redactions?: Record<string, number>;
    }
  | {
      op: 'end';
      sessionId: string;
      cwd: string;
      ts: string;
    };

export function pendingPath(cwd?: string): string {
  return path.join(ledgerDir(cwd), 'pending.jsonl');
}

/** Cheap hot-path write: append one JSON line. No DB, no git. */
export function appendPending(cwd: string, op: PendingOp): void {
  const p = pendingPath(cwd);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify(op) + '\n');
}

/**
 * Drain `pending.jsonl` into the store. Uses an atomic rename so concurrent
 * appends are never lost. Returns the number of ops applied.
 */
export function ingestPending(store: Store, cwd?: string): number {
  const p = pendingPath(cwd);
  const tmp = `${p}.ingesting`;
  try {
    fs.renameSync(p, tmp);
  } catch {
    return 0; // nothing pending
  }

  let count = 0;
  try {
    const lines = fs.readFileSync(tmp, 'utf8').split('\n').filter((l) => l.length > 0);
    for (const line of lines) {
      let op: PendingOp;
      try {
        op = JSON.parse(line) as PendingOp;
      } catch {
        continue;
      }
      try {
        // Ensure the session row exists (FK) before adding events.
        store.upsertSession({
          id: op.sessionId,
          cwd: op.cwd,
          startedAt: op.ts,
          gitBranch: op.op === 'event' ? op.gitBranch ?? null : null,
          gitCommit: op.op === 'event' ? op.gitCommit ?? null : null,
        });
        if (op.op === 'event') {
          store.addEvent({
            sessionId: op.sessionId,
            ts: op.ts,
            type: op.type,
            tool: op.tool ?? null,
            summary: op.summary ?? null,
            payload: op.payload,
            redactions: op.redactions,
          });
        } else {
          store.endSession(op.sessionId, op.ts);
        }
        count++;
      } catch {
        // skip a bad op rather than abort the whole drain
      }
    }
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  return count;
}

/** Open the store and drain any pending hot-path ops first. */
export function openSyncedStore(cwd?: string): Store {
  const store = openStore(cwd);
  try {
    ingestPending(store, cwd);
  } catch {
    // a failed drain must not break reads
  }
  return store;
}
