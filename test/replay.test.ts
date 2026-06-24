import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Store } from '../src/store/store';
import { extractCommands, replaySession } from '../src/replay/replay';

describe('replay', () => {
  let dir: string;
  let store: Store;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-replay-test-'));
    store = new Store(path.join(dir, 'ledger.db'));
    store.upsertSession({ id: 's1', cwd: dir, startedAt: '2026-01-01T00:00:00Z' });
  });

  afterEach(() => {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('extracts only bash/test commands', () => {
    store.addEvent({ sessionId: 's1', ts: '2026-01-01T00:00:01Z', type: 'prompt', summary: 'do it' });
    store.addEvent({ sessionId: 's1', ts: '2026-01-01T00:00:02Z', type: 'bash', summary: 'echo hi' });
    store.addEvent({ sessionId: 's1', ts: '2026-01-01T00:00:03Z', type: 'test', summary: 'true' });
    store.addEvent({ sessionId: 's1', ts: '2026-01-01T00:00:04Z', type: 'file_read', summary: '/x' });
    const cmds = extractCommands(store.getEvents('s1'));
    expect(cmds.map((c) => c.command)).toEqual(['echo hi', 'true']);
  });

  it('re-runs commands and reports PASS when all succeed', () => {
    store.addEvent({ sessionId: 's1', ts: '2026-01-01T00:00:02Z', type: 'bash', summary: 'echo hi' });
    store.addEvent({ sessionId: 's1', ts: '2026-01-01T00:00:03Z', type: 'test', summary: 'true' });
    const result = replaySession(store, 's1', { clean: true });
    expect(result.ok).toBe(true);
    expect(result.commands.every((c) => c.exitCode === 0)).toBe(true);
    expect(result.fingerprint.node).toBe(process.version);
    expect(result.fingerprint.commandCount).toBe(2);
    // workdir cleaned up by default
    expect(fs.existsSync(result.workdir)).toBe(false);
  });

  it('reports FAIL with the failing exit code', () => {
    store.addEvent({ sessionId: 's1', ts: '2026-01-01T00:00:02Z', type: 'bash', summary: 'echo ok' });
    store.addEvent({ sessionId: 's1', ts: '2026-01-01T00:00:03Z', type: 'bash', summary: 'exit 3' });
    const result = replaySession(store, 's1', { clean: true });
    expect(result.ok).toBe(false);
    expect(result.commands[1]!.exitCode).toBe(3);
  });

  it('dry-run plans without executing and keeps no workdir', () => {
    store.addEvent({ sessionId: 's1', ts: '2026-01-01T00:00:02Z', type: 'bash', summary: 'echo hi' });
    const result = replaySession(store, 's1', { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.commands[0]!.skipped).toBe(true);
    expect(result.commands[0]!.exitCode).toBeNull();
    expect(fs.existsSync(result.workdir)).toBe(false);
  });

  it('throws for a missing session', () => {
    expect(() => replaySession(store, 'nope', {})).toThrow(/Session not found/);
  });
});
