import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { handleHook } from '../src/capture/capture';
import { openSyncedStore } from '../src/capture/pending';

describe('capture', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-cap-'));
    fs.mkdirSync(path.join(dir, '.ledger'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function hook(event: string, payload: Record<string, unknown>) {
    return handleHook(event, { session_id: 's1', cwd: dir, hook_event_name: event, ...payload });
  }

  it('captures a full session lifecycle with redaction', () => {
    hook('SessionStart', { source: 'startup' });
    hook('UserPromptSubmit', { prompt: 'deploy with password=supersecretvalue please' });
    hook('PostToolUse', {
      tool_name: 'Bash',
      tool_input: { command: 'echo AKIAIOSFODNN7EXAMPLE' },
      tool_response: 'done',
    });
    hook('PostToolUse', { tool_name: 'Read', tool_input: { file_path: '/x/y.ts' } });
    hook('PostToolUse', { tool_name: 'Bash', tool_input: { command: 'npm test' } });
    hook('Stop', {});

    // The hot-path log itself must already be redacted (before any DB sync).
    const pendingRaw = fs.readFileSync(path.join(dir, '.ledger', 'pending.jsonl'), 'utf8');
    expect(pendingRaw).not.toContain('supersecretvalue');
    expect(pendingRaw).not.toContain('AKIAIOSFODNN7EXAMPLE');

    const store = openSyncedStore(dir);
    const session = store.latestSession()!;
    const events = store.getEvents('s1');
    store.close();

    expect(session.id).toBe('s1');
    expect(session.endedAt).not.toBeNull();

    const types = events.map((e) => e.type);
    expect(types).toContain('session_start');
    expect(types).toContain('prompt');
    expect(types).toContain('bash');
    expect(types).toContain('file_read');
    expect(types).toContain('test');

    const dump = JSON.stringify(events);
    expect(dump).not.toContain('supersecretvalue');
    expect(dump).not.toContain('AKIAIOSFODNN7EXAMPLE');

    const prompt = events.find((e) => e.type === 'prompt')!;
    expect(prompt.redactions?.secret_assignment).toBe(1);

    const bash = events.find((e) => e.type === 'bash')!;
    expect(bash.redactions?.aws_access_key_id).toBe(1);
  });

  it('skips capture and creates nothing when not initialized', () => {
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-noinit-'));
    try {
      const res = handleHook('SessionStart', {
        session_id: 's',
        cwd: dir2,
        hook_event_name: 'SessionStart',
      });
      expect(res.captured).toBe(false);
      expect(res.skipped).toBe(true);
      expect(fs.existsSync(path.join(dir2, '.ledger'))).toBe(false);
    } finally {
      fs.rmSync(dir2, { recursive: true, force: true });
    }
  });

  it('classifies test runner commands as test events', () => {
    hook('PostToolUse', { tool_name: 'Bash', tool_input: { command: 'pytest -q' } });
    const store = openSyncedStore(dir);
    const events = store.getEvents('s1');
    store.close();
    expect(events[0]!.type).toBe('test');
  });

  it('auto-generates a context pack on SessionEnd when enabled', () => {
    fs.writeFileSync(path.join(dir, '.ledger', 'config.json'), JSON.stringify({ autoPack: true }));
    hook('PostToolUse', { tool_name: 'Bash', tool_input: { command: 'echo hi' } });
    hook('SessionEnd', {});
    const packs = fs.readdirSync(path.join(dir, '.ledger', 'packs'));
    expect(packs.some((f) => f.endsWith('.json'))).toBe(true);
  });

  it('does not auto-pack when disabled (default)', () => {
    hook('PostToolUse', { tool_name: 'Bash', tool_input: { command: 'echo hi' } });
    hook('SessionEnd', {});
    const packsDir = path.join(dir, '.ledger', 'packs');
    const packs = fs.existsSync(packsDir) ? fs.readdirSync(packsDir) : [];
    expect(packs.length).toBe(0);
  });

  it('classifies Edit/Write as file_edit', () => {
    hook('PostToolUse', { tool_name: 'Write', tool_input: { file_path: '/a/b.ts', content: 'x' } });
    const store = openSyncedStore(dir);
    const events = store.getEvents('s1');
    store.close();
    expect(events[0]!.type).toBe('file_edit');
    expect(events[0]!.summary).toBe('/a/b.ts');
  });
});
