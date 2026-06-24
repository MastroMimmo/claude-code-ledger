import * as fs from 'node:fs';
import * as path from 'node:path';
import { ledgerDir } from './config';
import type { CustomPattern } from './redaction';

export interface RedactionConfig {
  customPatterns: CustomPattern[];
  disabledKinds: string[];
}

export interface LedgerConfig {
  /** Generate a context pack automatically when a session ends. */
  autoPack: boolean;
  redaction: RedactionConfig;
}

export const DEFAULT_CONFIG: LedgerConfig = {
  autoPack: false,
  redaction: { customPatterns: [], disabledKinds: [] },
};

export function configPath(cwd?: string): string {
  return path.join(ledgerDir(cwd), 'config.json');
}

/** Load `.ledger/config.json` merged over defaults; tolerant of malformed files. */
export function loadConfig(cwd?: string): LedgerConfig {
  const config: LedgerConfig = {
    autoPack: DEFAULT_CONFIG.autoPack,
    redaction: { customPatterns: [], disabledKinds: [] },
  };

  try {
    const p = configPath(cwd);
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<LedgerConfig>;
      if (typeof raw.autoPack === 'boolean') config.autoPack = raw.autoPack;
      const r = raw.redaction;
      if (r && typeof r === 'object') {
        if (Array.isArray(r.customPatterns)) config.redaction.customPatterns = r.customPatterns;
        if (Array.isArray(r.disabledKinds)) config.redaction.disabledKinds = r.disabledKinds;
      }
    }
  } catch {
    // fall back to defaults on any parse/read error
  }

  // Environment overrides (handy for quick toggling)
  if (process.env.LEDGER_AUTO_PACK === '1') config.autoPack = true;
  if (process.env.LEDGER_AUTO_PACK === '0') config.autoPack = false;

  return config;
}

export function serializeDefaultConfig(): string {
  return JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n';
}
