import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ensureLedgerIgnored } from '../src/commands/init';

describe('ensureLedgerIgnored', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-init-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates .gitignore with .ledger/ when none exists', () => {
    expect(ensureLedgerIgnored(dir)).toBe(true);
    const gi = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');
    expect(gi).toContain('.ledger/');
  });

  it('appends to an existing .gitignore without clobbering it', () => {
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/');
    expect(ensureLedgerIgnored(dir)).toBe(true);
    const gi = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');
    expect(gi).toContain('node_modules/');
    expect(gi).toContain('.ledger/');
  });

  it('is idempotent when .ledger/ is already ignored', () => {
    fs.writeFileSync(path.join(dir, '.gitignore'), '.ledger/\n');
    expect(ensureLedgerIgnored(dir)).toBe(false);
  });
});
