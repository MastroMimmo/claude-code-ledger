import type { Command } from 'commander';
import { isInitialized } from '../config';
import { openStore } from '../store/store';

export function registerStatus(program: Command): void {
  program
    .command('status')
    .description('Show store status: sessions, events and last activity')
    .option('--json', 'output as JSON')
    .action((opts: { json?: boolean }) => {
      if (!isInitialized()) {
        console.error("No Ledger store found. Run 'ledger init' first.");
        process.exitCode = 1;
        return;
      }
      const store = openStore();
      const s = store.stats();
      store.close();
      if (opts.json) {
        console.log(JSON.stringify(s, null, 2));
        return;
      }
      console.log(`Sessions:      ${s.sessions}`);
      console.log(`Events:        ${s.events}`);
      console.log(`Last activity: ${s.lastActivity ?? '-'}`);
    });
}
