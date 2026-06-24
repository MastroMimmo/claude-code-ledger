import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runChecks, type Check } from '../src/commands/doctor';

function find(checks: Check[], name: string): Check {
  const c = checks.find((x) => x.name === name);
  if (!c) throw new Error(`check not found: ${name}`);
  return c;
}

describe('ledger doctor', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-doctor-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reports core checks healthy', () => {
    const checks = runChecks(dir);
    expect(find(checks, 'Node.js').status).toBe('ok');
    expect(find(checks, 'SQLite').status).toBe('ok');
    expect(find(checks, 'Redaction engine').status).toBe('ok');
  });

  it('warns when the repo has no store', () => {
    const checks = runChecks(dir);
    expect(find(checks, 'Store').status).toBe('warn');
  });

  it('reports the store ok once initialized', () => {
    fs.mkdirSync(path.join(dir, '.ledger'), { recursive: true });
    const checks = runChecks(dir);
    expect(find(checks, 'Store').status).toBe('ok');
    expect(find(checks, 'Store data').status).toBe('ok');
  });
});
