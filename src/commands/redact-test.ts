import type { Command } from 'commander';
import { redact, totalRedactions } from '../redaction';

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

export function registerRedactTest(program: Command): void {
  program
    .command('redact-test')
    .description('Run a string (or stdin) through the redaction engine and print the result')
    .argument('[text]', 'text to redact (reads stdin if omitted)')
    .option('--json', 'output the redaction report as JSON')
    .action(async (text: string | undefined, opts: { json?: boolean }) => {
      const input = text ?? (await readStdin());
      const result = redact(input);
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(result.text);
      const total = totalRedactions(result.redactions);
      if (total > 0) {
        const breakdown = Object.entries(result.redactions)
          .map(([k, n]) => `${k}=${n}`)
          .join(', ');
        console.error(`\n${total} redaction(s): ${breakdown}`);
      } else {
        console.error('\nNo secrets detected.');
      }
    });
}
