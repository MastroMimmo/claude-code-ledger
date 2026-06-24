import type { Command } from 'commander';
import { handleHook, type HookPayload } from '../capture/capture';
import { totalRedactions } from '../redaction';

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
  });
}

export function registerHook(program: Command): void {
  program
    .command('hook')
    .description('Internal: ingest a Claude Code hook event (reads JSON payload from stdin)')
    .argument('<event>', 'hook event name (SessionStart, PostToolUse, Stop, ...)')
    .option('--echo', 'print a one-line capture summary to stderr')
    .action(async (event: string, opts: { echo?: boolean }) => {
      // A capture hook must NEVER break the Claude Code session: swallow all
      // errors and always exit 0.
      try {
        const raw = await readStdin();
        const payload = (raw.trim() ? JSON.parse(raw) : {}) as HookPayload;
        const res = handleHook(event, payload);
        if (opts.echo && res.captured) {
          const n = totalRedactions(res.redactions ?? {});
          console.error(`ledger: captured ${res.type} (${n} redacted)`);
        }
      } catch (err) {
        console.error(`ledger hook: ${err instanceof Error ? err.message : String(err)}`);
      }
      process.exit(0);
    });
}
