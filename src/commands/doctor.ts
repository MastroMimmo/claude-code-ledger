import type { Command } from 'commander';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findLedgerDir } from '../config';
import { redact } from '../redaction';
import { loadConfig } from '../settings';
import { Store, openStore } from '../store/store';

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
}

function ledgerIgnored(cwd: string): boolean {
  const gi = path.join(cwd, '.gitignore');
  if (!fs.existsSync(gi)) return false;
  return fs
    .readFileSync(gi, 'utf8')
    .split(/\r?\n/)
    .some((l) => l.trim() === '.ledger' || l.trim() === '.ledger/');
}

function findPluginRoot(): string | null {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, '.claude-plugin', 'plugin.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Run all setup diagnostics for `cwd`. Pure: returns results, prints nothing. */
export function runChecks(cwd: string): Check[] {
  const checks: Check[] = [];

  // Node version
  const major = Number(process.versions.node.split('.')[0]);
  checks.push(
    major >= 22
      ? { name: 'Node.js', status: 'ok', detail: `v${process.versions.node}` }
      : {
          name: 'Node.js',
          status: 'fail',
          detail: `v${process.versions.node} (need >= 22)`,
          fix: 'Upgrade Node.js to v22 or newer',
        },
  );

  // SQLite (node:sqlite end-to-end)
  try {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-doctor-'));
    const s = new Store(path.join(tmp, 'probe.db'));
    s.upsertSession({ id: 'probe', cwd: tmp, startedAt: new Date().toISOString() });
    s.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    checks.push({ name: 'SQLite', status: 'ok', detail: 'node:sqlite is working' });
  } catch {
    checks.push({
      name: 'SQLite',
      status: 'fail',
      detail: 'node:sqlite not available',
      fix: 'Ensure you are on Node.js v22+',
    });
  }

  // Redaction self-test
  const r = redact('AKIAIOSFODNN7EXAMPLE');
  checks.push(
    !r.text.includes('AKIA') && (r.redactions.aws_access_key_id ?? 0) >= 1
      ? { name: 'Redaction engine', status: 'ok', detail: 'secrets are scrubbed' }
      : {
          name: 'Redaction engine',
          status: 'fail',
          detail: 'self-test did not redact a known secret',
          fix: 'Reinstall / rebuild the CLI',
        },
  );

  // Store initialized for this repo
  const dir = findLedgerDir(cwd);
  if (dir) {
    checks.push({ name: 'Store', status: 'ok', detail: `initialized at ${dir}` });
    try {
      const store = openStore(cwd);
      const st = store.stats();
      store.close();
      checks.push({
        name: 'Store data',
        status: 'ok',
        detail: `${st.sessions} session(s), ${st.events} event(s)`,
      });
    } catch {
      checks.push({
        name: 'Store data',
        status: 'fail',
        detail: 'store exists but could not be opened',
        fix: 'Check permissions on .ledger/, or re-run ledger init -f',
      });
    }
    const cfg = loadConfig(cwd);
    checks.push({
      name: 'Config',
      status: 'ok',
      detail: `auto-pack ${cfg.autoPack ? 'on' : 'off'}, ${cfg.redaction.customPatterns.length} custom pattern(s), ${cfg.redaction.disabledKinds.length} disabled`,
    });
  } else {
    checks.push({
      name: 'Store',
      status: 'warn',
      detail: 'no .ledger/ store in this repo',
      fix: 'Run: ledger init',
    });
  }

  // .gitignore hygiene (only meaningful inside a git repo)
  if (fs.existsSync(path.join(cwd, '.git'))) {
    checks.push(
      ledgerIgnored(cwd)
        ? { name: '.gitignore', status: 'ok', detail: '.ledger/ is ignored' }
        : {
            name: '.gitignore',
            status: 'warn',
            detail: '.ledger/ is not git-ignored',
            fix: 'Run: ledger init (it adds .ledger/ to .gitignore)',
          },
    );
  }

  // git availability (fingerprint/branch capture)
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    checks.push({ name: 'git', status: 'ok', detail: 'available' });
  } catch {
    checks.push({
      name: 'git',
      status: 'warn',
      detail: 'git not found',
      fix: 'Install git to capture branch/commit in fingerprints',
    });
  }

  // Plugin packaging present (so Claude Code hooks can run)
  const root = findPluginRoot();
  if (root) {
    const hasBundle = fs.existsSync(path.join(root, 'dist', 'cli.js'));
    const hasHooks = fs.existsSync(path.join(root, 'hooks', 'hooks.json'));
    checks.push(
      hasBundle && hasHooks
        ? { name: 'Plugin', status: 'ok', detail: 'bundle + hooks present' }
        : {
            name: 'Plugin',
            status: 'warn',
            detail: `missing ${!hasBundle ? 'dist/cli.js' : 'hooks/hooks.json'}`,
            fix: 'Run: npm run build',
          },
    );
  }

  return checks;
}

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Diagnose your Ledger setup and report what to fix')
    .action(() => {
      const checks = runChecks(process.cwd());
      const icon: Record<CheckStatus, string> = { ok: '✓', warn: '⚠', fail: '✗' };
      for (const c of checks) {
        console.log(`${icon[c.status]} ${c.name}: ${c.detail}`);
        if (c.status !== 'ok' && c.fix) console.log(`    fix: ${c.fix}`);
      }
      const fails = checks.filter((c) => c.status === 'fail').length;
      const warns = checks.filter((c) => c.status === 'warn').length;
      console.log('');
      if (fails > 0) {
        console.log(`${fails} problem(s) to fix${warns > 0 ? `, ${warns} warning(s)` : ''}.`);
        process.exitCode = 1;
      } else if (warns > 0) {
        console.log(`All good, with ${warns} warning(s).`);
      } else {
        console.log('All good. Ledger is ready.');
      }
    });
}
