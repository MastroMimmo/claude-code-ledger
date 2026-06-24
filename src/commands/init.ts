import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { LEDGER_DIR_NAME, findLedgerDir } from '../config';

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Initialize a Ledger store in the current repository (.ledger/)')
    .option('-f, --force', 'reinitialize even if a store already exists')
    .action((opts: { force?: boolean }) => {
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
    });
}
