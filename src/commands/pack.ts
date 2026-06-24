import type { Command } from 'commander';
import { isInitialized, packsDir } from '../config';
import { openStore } from '../store/store';
import { buildPack, writePack } from '../pack/pack';

export function registerPack(program: Command): void {
  program
    .command('pack')
    .description('Generate a transferable context pack from one or more sessions')
    .argument('[sessions...]', 'session ids (defaults to the latest)')
    .option('-o, --out <dir>', 'output directory (defaults to .ledger/packs)')
    .option('--title <title>', 'title for the context pack')
    .action((sessions: string[], opts: { out?: string; title?: string }) => {
      if (!isInitialized()) {
        console.error("No Ledger store found. Run 'ledger init' first.");
        process.exitCode = 1;
        return;
      }
      const store = openStore();
      let ids = sessions;
      if (ids.length === 0) {
        const latest = store.latestSession();
        if (!latest) {
          store.close();
          console.error('No sessions to pack.');
          process.exitCode = 1;
          return;
        }
        ids = [latest.id];
      }
      const pack = buildPack(store, ids, { title: opts.title });
      store.close();

      if (pack.sessions.length === 0) {
        console.error('No matching sessions found.');
        process.exitCode = 1;
        return;
      }

      const { jsonPath, mdPath } = writePack(pack, opts.out ?? packsDir());
      console.log('Wrote context pack:');
      console.log(`  ${mdPath}`);
      console.log(`  ${jsonPath}`);
    });
}
