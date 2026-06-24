import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Store } from '../src/store/store';
import { buildPack, renderMarkdown, writePack, importPack } from '../src/pack/pack';

function seed(store: Store): void {
  store.upsertSession({
    id: 's1',
    cwd: '/repo',
    startedAt: '2026-01-01T00:00:00Z',
    gitBranch: 'main',
    gitCommit: 'abc1234',
  });
  store.addEvent({ sessionId: 's1', ts: '2026-01-01T00:00:01Z', type: 'prompt', summary: 'add auth; TODO write tests' });
  store.addEvent({ sessionId: 's1', ts: '2026-01-01T00:00:02Z', type: 'file_read', summary: '/repo/a.ts' });
  store.addEvent({ sessionId: 's1', ts: '2026-01-01T00:00:03Z', type: 'file_edit', summary: '/repo/b.ts' });
  store.addEvent({ sessionId: 's1', ts: '2026-01-01T00:00:04Z', type: 'bash', tool: 'Bash', summary: 'npm run build' });
  store.addEvent({ sessionId: 's1', ts: '2026-01-01T00:00:05Z', type: 'test', tool: 'Bash', summary: 'npm test' });
  store.addEvent({ sessionId: 's1', ts: '2026-01-01T00:00:06Z', type: 'note', summary: 'decided to use JWT' });
  store.endSession('s1', '2026-01-01T00:00:07Z');
}

describe('context pack', () => {
  let dir: string;
  let store: Store;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-pack-'));
    store = new Store(path.join(dir, 'ledger.db'));
    seed(store);
  });

  afterEach(() => {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('aggregates events into a structured pack', () => {
    const pack = buildPack(store, ['s1'], { title: 'My Pack' }, '2026-02-02T00:00:00Z');
    expect(pack.title).toBe('My Pack');
    expect(pack.createdAt).toBe('2026-02-02T00:00:00Z');
    expect(pack.summary.events).toBe(6);
    expect(pack.prompts).toContain('add auth; TODO write tests');
    expect(pack.filesTouched.reads).toEqual(['/repo/a.ts']);
    expect(pack.filesTouched.edits).toEqual(['/repo/b.ts']);
    expect(pack.commands).toEqual(['npm run build']);
    expect(pack.tests).toEqual(['npm test']);
    expect(pack.notes).toContain('decided to use JWT');
    expect(pack.openThreads.length).toBeGreaterThanOrEqual(1);
    expect(pack.environment.gitBranch).toBe('main');
    expect(pack.environment.gitCommit).toBe('abc1234');
  });

  it('renders markdown with the expected sections', () => {
    const pack = buildPack(store, ['s1']);
    const md = renderMarkdown(pack);
    expect(md).toContain('# Context pack');
    expect(md).toContain('## Files touched');
    expect(md).toContain('npm test');
    expect(md).toContain('## Open threads');
    expect(md).toContain('## Redactions');
  });

  it('writes md + json and re-imports losslessly into a fresh store', () => {
    const pack = buildPack(store, ['s1']);
    const outDir = path.join(dir, 'packs');
    const { jsonPath, mdPath } = writePack(pack, outDir);
    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(mdPath)).toBe(true);

    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-imp-'));
    const store2 = new Store(path.join(dir2, 'ledger.db'));
    try {
      const res = importPack(store2, jsonPath);
      expect(res.sessions).toBe(1);
      expect(res.events).toBe(6);
      const s = store2.getSession('s1')!;
      expect(s.eventCount).toBe(6);
      expect(s.endedAt).toBe('2026-01-01T00:00:07Z');
      expect(s.gitBranch).toBe('main');
    } finally {
      store2.close();
      fs.rmSync(dir2, { recursive: true, force: true });
    }
  });
});
