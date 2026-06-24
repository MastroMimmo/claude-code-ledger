import type { Command } from 'commander';
import { isInitialized } from '../config';
import { openStore } from '../store/store';

export function registerShow(program: Command): void {
  program
    .command('show')
    .description('Show the events of a captured session')
    .argument('[session]', 'session id (defaults to the latest)')
    .option('--json', 'output as JSON')
    .action((session: string | undefined, opts: { json?: boolean }) => {
      if (!isInitialized()) {
        console.error("No Ledger store found. Run 'ledger init' first.");
        process.exitCode = 1;
        return;
      }
      const store = openStore();
      const target = session ? store.getSession(session) : store.latestSession();
      if (!target) {
        store.close();
        console.error(session ? `Session not found: ${session}` : 'No sessions captured yet.');
        process.exitCode = 1;
        return;
      }
      const events = store.getEvents(target.id);
      store.close();

      if (opts.json) {
        console.log(JSON.stringify({ session: target, events }, null, 2));
        return;
      }

      const range = target.endedAt ? `${target.startedAt} → ${target.endedAt}` : target.startedAt;
      console.log(`Session ${target.id} (${range})`);
      console.log(
        `cwd=${target.cwd}  branch=${target.gitBranch ?? '-'}  commit=${target.gitCommit ?? '-'}`,
      );
      console.log('');
      for (const e of events) {
        const redacted = e.redactions
          ? Object.values(e.redactions).reduce((a, b) => a + b, 0)
          : 0;
        const redTag = redacted > 0 ? `  ⟨${redacted} redacted⟩` : '';
        const tool = e.tool ? ` (${e.tool})` : '';
        console.log(`#${e.seq}  ${e.ts}  ${e.type}${tool}${redTag}`);
        if (e.summary) console.log(`     ${e.summary}`);
      }
    });
}
