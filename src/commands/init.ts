import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { LEDGER_DIR_NAME, findLedgerDir } from '../config';

/**
 * Ensure `.ledger/` is git-ignored in `cwd`. Returns true if the .gitignore
 * was created or updated, false if it already covered it.
 */
export function ensureLedgerIgnored(cwd: string): boolean {
  const gitignore = path.join(cwd, '.gitignore');
  const existing = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, 'utf8') : '';
  const alreadyIgnored = existing
    .split(/\r?\n/)
    .some((line) => line.trim() === '.ledger' || line.trim() === '.ledger/');
  if (alreadyIgnored) return false;

  const prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(gitignore, `${prefix}# Claude Code Ledger local capture data\n.ledger/\n`);
  return true;
}

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Initialize a Ledger store in the current repository (.ledger/)')
    .option('-f, --force', 'reinitialize even if a store already exists')
    .option('--no-gitignore', 'do not add .ledger/ to .gitignore')
    .action((opts: { force?: boolean; gitignore?: boolean }) => {
      const existing = findLedgerDir();
      if (existing && !opts.force) {
        console.log(`Ledger already initialized at ${existing}`);
        return;
      }
      const dir = path.join(process.cwd(), LEDGER_DIR_NAME);
      fs.mkdirSync(path.join(dir, 'packs'), { recursive: true });
      const metaPath = path.join(dir, 'meta.json');
      if (!fs.existsSync(metaPath) || opts.force) {
        fs.writeFileSync(
          metaPath,
          JSON.stringify({ schema: 1, createdAt: new Date().toISOString() }, null, 2) + '\n',
        );
      }

      console.log(`Initialized Ledger store at ${dir}`);

      if (opts.gitignore !== false) {
        const updated = ensureLedgerIgnored(process.cwd());
        if (updated) console.log('Added .ledger/ to .gitignore');
      }

      console.log('');
      console.log('Next steps:');
      console.log('  - Use Claude Code as usual; the plugin will capture this repo.');
      console.log('  - ledger status     show what has been captured');
      console.log('  - ledger pack       create a transferable handoff');
      console.log('  - ledger replay     re-run captured commands');
    });
}
