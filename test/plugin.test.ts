import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { registerCommands } from '../src/commands';

const ROOT = path.join(__dirname, '..');

function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

describe('CLI wiring', () => {
  it('registers all expected commands', () => {
    const program = new Command();
    registerCommands(program);
    const names = program.commands.map((c) => c.name());
    expect(names).toEqual(
      expect.arrayContaining([
        'init',
        'status',
        'list',
        'show',
        'pack',
        'import',
        'replay',
        'redact-test',
        'hook',
      ]),
    );
  });
});

describe('Claude Code plugin packaging', () => {
  it('plugin.json matches the package version and references hooks', () => {
    const pkg = readJson('package.json');
    const plugin = readJson('.claude-plugin/plugin.json');
    expect(plugin.name).toBe('claude-code-ledger');
    expect(plugin.version).toBe(pkg.version);
    expect(plugin.description).toBeTruthy();
    expect(plugin.hooks).toBe('./hooks/hooks.json');
  });

  it('hooks.json registers the capture events pointing at the CLI', () => {
    const hooks = readJson('hooks/hooks.json') as { hooks: Record<string, unknown> };
    const events = Object.keys(hooks.hooks);
    for (const e of ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Stop', 'SessionEnd']) {
      expect(events).toContain(e);
    }
    const json = JSON.stringify(hooks);
    expect(json).toContain('${CLAUDE_PLUGIN_ROOT}/dist/cli.js');
    expect(json).toContain('hook PostToolUse');
  });

  it('marketplace.json lists the plugin', () => {
    const mkt = readJson('.claude-plugin/marketplace.json') as {
      plugins: Array<{ name: string }>;
    };
    expect(mkt.plugins.some((p) => p.name === 'claude-code-ledger')).toBe(true);
  });
});
