import type { Command } from 'commander';
import { findLedgerDir } from '../config';
import { openSyncedStore } from '../capture/pending';

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

interface StatusLineInput {
  cwd?: string;
  session_id?: string;
  workspace?: { current_dir?: string };
}

export function registerStatusline(program: Command): void {
  program
    .command('statusline')
    .description('Internal: print a one-line summary for the Claude Code status line (reads JSON from stdin)')
    .action(async () => {
      let cwd = process.cwd();
      let sessionId: string | undefined;
      try {
        const raw = await readStdin();
        if (raw.trim()) {
          const j = JSON.parse(raw) as StatusLineInput;
          cwd = j.workspace?.current_dir ?? j.cwd ?? cwd;
          sessionId = j.session_id;
        }
      } catch {
        // ignore malformed input; fall back to cwd
      }

      // A status line must never crash; always print a single line.
      try {
        if (!findLedgerDir(cwd)) {
          console.log('◌ Ledger: ledger init');
          return;
        }
        const store = openSyncedStore(cwd);
        try {
          const session = sessionId ? store.getSession(sessionId) : store.latestSession();
          if (session) {
            const events = store.getEvents(session.id);
            let redacted = 0;
            for (const e of events) {
              if (e.redactions) for (const n of Object.values(e.redactions)) redacted += n;
            }
            console.log(`⟐ Ledger ${events.length}e · ${redacted} redacted`);
          } else {
            console.log(`⟐ Ledger ${store.stats().events}e`);
          }
        } finally {
          store.close();
        }
      } catch {
        console.log('⟐ Ledger');
      }
    });
}
