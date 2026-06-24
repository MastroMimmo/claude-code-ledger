import type { Command } from 'commander';
import { isInitialized } from '../config';
import { openSyncedStore } from '../capture/pending';

export function registerList(program: Command): void {
  program
    .command('list')
    .alias('ls')
    .description('List captured sessions')
    .option('-n, --limit <n>', 'maximum number of sessions to show', '20')
    .option('--json', 'output as JSON')
    .action((opts: { limit?: string; json?: boolean }) => {
      if (!isInitialized()) {
        console.error("No Ledger store found. Run 'ledger init' first.");
        process.exitCode = 1;
        return;
      }
      const limit = Number.parseInt(opts.limit ?? '20', 10) || 20;
      const store = openSyncedStore();
      const sessions = store.listSessions(limit);
      store.close();
      if (opts.json) {
        console.log(JSON.stringify(sessions, null, 2));
        return;
      }
      if (sessions.length === 0) {
        console.log('No sessions captured yet.');
        return;
      }
      for (const s of sessions) {
        const state = s.endedAt ? 'ended' : 'open';
        const branch = s.gitBranch ? `  ${s.gitBranch}` : '';
        console.log(`${s.id}  ${s.startedAt}  [${state}]  events=${s.eventCount}${branch}`);
      }
    });
}
