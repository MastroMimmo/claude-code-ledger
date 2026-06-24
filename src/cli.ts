#!/usr/bin/env node
import { Command } from 'commander';
import { VERSION } from './version';
import { registerCommands } from './commands';

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('ledger')
    .description(
      'Claude Code Ledger - local-first capture, redaction, context packs and replay for Claude Code sessions.',
    )
    .version(VERSION, '-v, --version', 'print the ledger version')
    .showHelpAfterError();

  registerCommands(program);
  return program;
}

async function main(): Promise<void> {
  const program = buildProgram();
  if (process.argv.slice(2).length === 0) {
    program.outputHelp();
    return;
  }
  await program.parseAsync(process.argv);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`ledger: error: ${msg}`);
  process.exit(1);
});
