import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Store } from '../src/store/store';
import { appendPending, ingestPending, pendingPath, openSyncedStore } from '../src/capture/pending';

describe('pending fast-path', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-pending-'));
    fs.mkdirSync(path.join(dir, '.ledger'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips events through the JSONL log into the store', () => {
    appendPending(dir, {
      op: 'event',
      sessionId: 's1',
      cwd: dir,
      ts: '2026-01-01T00:00:01Z',
      gitBranch: 'main',
      type: 'prompt',
      summary: 'hello',
    });
    appendPending(dir, {
      op: 'event',
      sessionId: 's1',
      cwd: dir,
      ts: '2026-01-01T00:00:02Z',
      type: 'bash',
      tool: 'Bash',
      summary: 'echo hi',
    });
    appendPending(dir, { op: 'end', sessionId: 's1', cwd: dir, ts: '2026-01-01T00:00:03Z' });

    const store = new Store(path.join(dir, '.ledger', 'ledger.db'));
    const applied = ingestPending(store, dir);
    expect(applied).toBe(3);

    const session = store.getSession('s1')!;
    expect(session.gitBranch).toBe('main');
    expect(session.endedAt).toBe('2026-01-01T00:00:03Z');
    expect(store.getEvents('s1').map((e) => e.type)).toEqual(['prompt', 'bash']);
    store.close();
  });

  it('is idempotent: a second ingest finds nothing', () => {
    appendPending(dir, { op: 'event', sessionId: 's1', cwd: dir, ts: 't', type: 'note' });
    const store = new Store(path.join(dir, '.ledger', 'ledger.db'));
    expect(ingestPending(store, dir)).toBe(1);
    expect(ingestPending(store, dir)).toBe(0);
    expect(fs.existsSync(pendingPath(dir))).toBe(false);
    store.close();
  });

  it('skips malformed lines without aborting the drain', () => {
    fs.appendFileSync(pendingPath(dir), 'not json\n');
    appendPending(dir, { op: 'event', sessionId: 's1', cwd: dir, ts: 't', type: 'note' });
    const store = new Store(path.join(dir, '.ledger', 'ledger.db'));
    expect(ingestPending(store, dir)).toBe(1);
    store.close();
  });

  it('openSyncedStore drains pending automatically', () => {
    appendPending(dir, { op: 'event', sessionId: 's1', cwd: dir, ts: 't', type: 'note' });
    const store = openSyncedStore(dir);
    expect(store.stats().events).toBe(1);
    store.close();
  });
});
