import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Store } from '../store/store';
import type { LedgerEvent, Session } from '../store/types';

export interface ReplayCommand {
  seq: number;
  type: 'bash' | 'test';
  command: string;
}

export interface ReplayCommandResult extends ReplayCommand {
  exitCode: number | null;
  ok: boolean;
  durationMs: number;
  skipped?: boolean;
}

export interface Fingerprint {
  node: string;
  platform: string;
  arch: string;
  gitBranch: string | null;
  gitCommit: string | null;
  depsHash: string | null;
  commandCount: number;
}

export interface ReplayResult {
  sessionId: string;
  workdir: string;
  fingerprint: Fingerprint;
  commands: ReplayCommandResult[];
  ok: boolean;
  dryRun: boolean;
  keptWorkdir: boolean;
}

export interface ReplayOptions {
  dryRun?: boolean;
  keep?: boolean;
  /** Start from an empty workdir instead of copying the repo tree. */
  clean?: boolean;
  timeoutMs?: number;
}

const COPY_EXCLUDES = new Set(['node_modules', '.git', '.ledger', 'dist', 'coverage']);
const LOCKFILES = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'requirements.txt',
  'go.sum',
  'Cargo.lock',
];

function commandOf(e: LedgerEvent): string {
  const payload = e.payload as { input?: { command?: unknown } } | undefined;
  const fromPayload = payload?.input?.command;
  if (typeof fromPayload === 'string' && fromPayload.length > 0) return fromPayload;
  return e.summary ?? '';
}

export function extractCommands(events: LedgerEvent[]): ReplayCommand[] {
  const commands: ReplayCommand[] = [];
  for (const e of events) {
    if (e.type === 'bash' || e.type === 'test') {
      const command = commandOf(e);
      if (command) commands.push({ seq: e.seq, type: e.type, command });
    }
  }
  return commands;
}

function hashLockfile(dir: string): string | null {
  for (const name of LOCKFILES) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) {
      const h = createHash('sha256').update(fs.readFileSync(p)).digest('hex');
      return `${name}:${h.slice(0, 12)}`;
    }
  }
  return null;
}

export function buildFingerprint(
  session: Session,
  commands: ReplayCommand[],
  srcDir: string | null,
): Fingerprint {
  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    gitBranch: session.gitBranch,
    gitCommit: session.gitCommit,
    depsHash: srcDir && fs.existsSync(srcDir) ? hashLockfile(srcDir) : null,
    commandCount: commands.length,
  };
}

function copyTree(src: string, dest: string): void {
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (s) => !COPY_EXCLUDES.has(path.basename(s)),
  });
}

/** Re-run a session's captured commands in an ephemeral fingerprinted workdir. */
export function replaySession(
  store: Store,
  sessionId: string,
  opts: ReplayOptions = {},
): ReplayResult {
  const session = store.getSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  const events = store.getEvents(sessionId);
  const commands = extractCommands(events);
  const fingerprint = buildFingerprint(session, commands, session.cwd);

  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-replay-'));
  const results: ReplayCommandResult[] = [];
  const timeoutMs = opts.timeoutMs ?? 120_000;
  let kept = false;

  try {
    if (opts.dryRun) {
      for (const c of commands) {
        results.push({ ...c, exitCode: null, ok: false, durationMs: 0, skipped: true });
      }
    } else {
      if (!opts.clean && fs.existsSync(session.cwd)) {
        copyTree(session.cwd, workdir);
      }
      for (const c of commands) {
        const start = Date.now();
        const r = spawnSync(c.command, {
          cwd: workdir,
          shell: true,
          encoding: 'utf8',
          timeout: timeoutMs,
        });
        results.push({
          ...c,
          exitCode: r.status,
          ok: r.status === 0,
          durationMs: Date.now() - start,
        });
      }
    }
  } finally {
    if (opts.keep) {
      kept = true;
    } else {
      fs.rmSync(workdir, { recursive: true, force: true });
    }
  }

  const ok = !opts.dryRun && results.length > 0 && results.every((r) => r.ok);
  return {
    sessionId,
    workdir,
    fingerprint,
    commands: results,
    ok,
    dryRun: Boolean(opts.dryRun),
    keptWorkdir: kept,
  };
}
