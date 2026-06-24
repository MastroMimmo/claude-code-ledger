import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadConfig, configPath, serializeDefaultConfig } from '../src/settings';

describe('settings', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-settings-'));
    fs.mkdirSync(path.join(dir, '.ledger'), { recursive: true });
    delete process.env.LEDGER_AUTO_PACK;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.LEDGER_AUTO_PACK;
  });

  it('returns defaults when no config file exists', () => {
    const c = loadConfig(dir);
    expect(c.autoPack).toBe(false);
    expect(c.redaction.customPatterns).toEqual([]);
    expect(c.redaction.disabledKinds).toEqual([]);
  });

  it('reads autoPack and redaction config from file', () => {
    fs.writeFileSync(
      configPath(dir),
      JSON.stringify({
        autoPack: true,
        redaction: { customPatterns: [{ kind: 'acme', pattern: 'ACME-\\d+' }], disabledKinds: ['ipv4'] },
      }),
    );
    const c = loadConfig(dir);
    expect(c.autoPack).toBe(true);
    expect(c.redaction.customPatterns).toHaveLength(1);
    expect(c.redaction.disabledKinds).toEqual(['ipv4']);
  });

  it('falls back to defaults on malformed JSON', () => {
    fs.writeFileSync(configPath(dir), '{ not valid json');
    expect(loadConfig(dir).autoPack).toBe(false);
  });

  it('honors the LEDGER_AUTO_PACK env override', () => {
    process.env.LEDGER_AUTO_PACK = '1';
    expect(loadConfig(dir).autoPack).toBe(true);
  });

  it('serializes a valid default config', () => {
    expect(() => JSON.parse(serializeDefaultConfig())).not.toThrow();
  });
});
