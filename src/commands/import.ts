import type { Command } from 'commander';
import { isInitialized } from '../config';
import { openStore } from '../store/store';
import { importPack } from '../pack/pack';

export function registerImport(program: Command): void {
  program
    .command('import')
    .description('Import a context pack (json) into the local store')
    .argument('<file>', 'path to a context pack .json file')
    .action((file: string) => {
      if (!isInitialized()) {
        console.error("No Ledger store found. Run 'ledger init' first.");
        process.exitCode = 1;
        return;
      }
      const store = openStore();
      try {
        const res = importPack(store, file);
        console.log(`Imported ${res.sessions} session(s) and ${res.events} event(s) from ${file}`);
      } finally {
        store.close();
      }
    });
}
