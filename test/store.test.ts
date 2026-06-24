import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Store } from '../src/store/store';

describe('Store', () => {
  let dir: string;
  let store: Store;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-test-'));
    store = new Store(path.join(dir, 'ledger.db'));
  });

  afterEach(() => {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates schema and reports empty stats', () => {
    expect(store.stats()).toEqual({ sessions: 0, events: 0, lastActivity: null });
  });

  it('upserts a session and lists it', () => {
    store.upsertSession({
      id: 's1',
      cwd: '/tmp/x',
      startedAt: '2026-01-01T00:00:00Z',
      gitBranch: 'main',
    });
    const list = store.listSessions();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe('s1');
    expect(list[0]!.gitBranch).toBe('main');
    expect(list[0]!.endedAt).toBeNull();
  });

  it('adds events with monotonic seq and returns them in order', () => {
    store.upsertSession({ id: 's1', cwd: '/x', startedAt: '2026-01-01T00:00:00Z' });
    const e1 = store.addEvent({
      sessionId: 's1',
      ts: '2026-01-01T00:00:01Z',
      type: 'prompt',
      summary: 'hi',
    });
    const e2 = store.addEvent({
      sessionId: 's1',
      ts: '2026-01-01T00:00:02Z',
      type: 'bash',
      tool: 'Bash',
      payload: { cmd: 'ls' },
      redactions: { aws_key: 0 },
    });
    expect(e1.seq).toBe(1);
    expect(e2.seq).toBe(2);

    const events = store.getEvents('s1');
    expect(events.map((e) => e.seq)).toEqual([1, 2]);
    expect(events[1]!.payload).toEqual({ cmd: 'ls' });
    expect(events[1]!.tool).toBe('Bash');
    expect(events[1]!.redactions).toEqual({ aws_key: 0 });
  });

  it('tracks event_count and last activity in stats', () => {
    store.upsertSession({ id: 's1', cwd: '/x', startedAt: '2026-01-01T00:00:00Z' });
    store.addEvent({ sessionId: 's1', ts: '2026-01-02T00:00:00Z', type: 'note' });
    const stats = store.stats();
    expect(stats.sessions).toBe(1);
    expect(stats.events).toBe(1);
    expect(stats.lastActivity).toBe('2026-01-02T00:00:00Z');
    expect(store.getSession('s1')!.eventCount).toBe(1);
  });

  it('ends a session', () => {
    store.upsertSession({ id: 's1', cwd: '/x', startedAt: '2026-01-01T00:00:00Z' });
    store.endSession('s1', '2026-01-01T01:00:00Z');
    expect(store.getSession('s1')!.endedAt).toBe('2026-01-01T01:00:00Z');
  });

  it('upsert preserves started_at but updates git info', () => {
    store.upsertSession({ id: 's1', cwd: '/x', startedAt: '2026-01-01T00:00:00Z' });
    store.upsertSession({
      id: 's1',
      cwd: '/x',
      startedAt: '2026-09-09T00:00:00Z',
      gitCommit: 'abc123',
    });
    const s = store.getSession('s1')!;
    expect(s.startedAt).toBe('2026-01-01T00:00:00Z');
    expect(s.gitCommit).toBe('abc123');
  });

  it('returns null for missing sessions', () => {
    expect(store.getSession('nope')).toBeNull();
    expect(store.latestSession()).toBeNull();
  });
});
