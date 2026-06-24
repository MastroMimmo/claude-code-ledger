import type { Command } from 'commander';
import { isInitialized } from '../config';
import { openSyncedStore } from '../capture/pending';
import { replaySession, type ReplayResult } from '../replay/replay';

function printResult(result: ReplayResult): void {
  const fp = result.fingerprint;
  console.log(`Replay of session ${result.sessionId}`);
  console.log(
    `Fingerprint: node ${fp.node} ${fp.platform}/${fp.arch}  branch=${fp.gitBranch ?? '-'}  commit=${fp.gitCommit ?? '-'}  deps=${fp.depsHash ?? '-'}`,
  );
  if (result.commands.length === 0) {
    console.log('No bash/test commands captured in this session.');
    return;
  }
  console.log(`Commands (${result.commands.length}):`);
  for (const c of result.commands) {
    if (c.skipped) {
      console.log(`  #${c.seq} [${c.type}] ${c.command}  → (dry-run)`);
    } else {
      const verdict = c.ok ? 'ok' : 'FAIL';
      console.log(`  #${c.seq} [${c.type}] ${c.command}  → exit ${c.exitCode} (${c.durationMs}ms) ${verdict}`);
    }
  }
  if (!result.dryRun) {
    console.log(`Result: ${result.ok ? 'PASS' : 'FAIL'}`);
  }
  if (result.keptWorkdir) {
    console.log(`Workdir kept at: ${result.workdir}`);
  }
}

export function registerReplay(program: Command): void {
  program
    .command('replay')
    .description('Re-run the commands/tests captured in a session in an ephemeral dir')
    .argument('[session]', 'session id (defaults to the latest)')
    .option('--dry-run', 'show what would run without executing')
    .option('--keep', 'keep the ephemeral workdir after replay')
    .option('--clean', 'start from an empty workdir instead of copying the repo')
    .option('--timeout <ms>', 'per-command timeout in ms', '120000')
    .action(
      (
        session: string | undefined,
        opts: { dryRun?: boolean; keep?: boolean; clean?: boolean; timeout?: string },
      ) => {
        if (!isInitialized()) {
          console.error("No Ledger store found. Run 'ledger init' first.");
          process.exitCode = 1;
          return;
        }
        const store = openSyncedStore();
        const target = session ? store.getSession(session) : store.latestSession();
        if (!target) {
          store.close();
          console.error(session ? `Session not found: ${session}` : 'No sessions to replay.');
          process.exitCode = 1;
          return;
        }
        let result: ReplayResult;
        try {
          result = replaySession(store, target.id, {
            dryRun: opts.dryRun,
            keep: opts.keep,
            clean: opts.clean,
            timeoutMs: Number.parseInt(opts.timeout ?? '120000', 10) || 120000,
          });
        } finally {
          store.close();
        }
        printResult(result);
        if (!result.dryRun && !result.ok) process.exitCode = 1;
      },
    );
}
