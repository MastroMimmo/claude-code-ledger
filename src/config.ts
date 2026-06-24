import * as fs from 'node:fs';
import * as path from 'node:path';

export const LEDGER_DIR_NAME = '.ledger';

/**
 * Find the nearest `.ledger/` directory walking up from `start`.
 * `LEDGER_HOME` env var overrides discovery entirely.
 * Returns null if none is found.
 */
export function findLedgerDir(start: string = process.cwd()): string | null {
  if (process.env.LEDGER_HOME) {
    const home = path.resolve(process.env.LEDGER_HOME);
    return fs.existsSync(home) ? home : null;
  }
  let dir = path.resolve(start);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = path.join(dir, LEDGER_DIR_NAME);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** The `.ledger/` dir for `start`, defaulting to `<start>/.ledger` when none exists yet. */
export function ledgerDir(start: string = process.cwd()): string {
  return findLedgerDir(start) ?? path.join(path.resolve(start), LEDGER_DIR_NAME);
}

export function dbPath(start?: string): string {
  return path.join(ledgerDir(start), 'ledger.db');
}

export function packsDir(start?: string): string {
  return path.join(ledgerDir(start), 'packs');
}

export function isInitialized(start: string = process.cwd()): boolean {
  return findLedgerDir(start) !== null;
}
