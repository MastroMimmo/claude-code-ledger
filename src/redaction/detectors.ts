export interface Detector {
  kind: string;
  /** Global regex. If `captureGroup` is set, only that group is redacted. */
  pattern: RegExp;
  /** Optional check on the matched value; return false to skip redaction. */
  validate?: (value: string) => boolean;
  /** 1-based capture group to redact instead of the whole match. */
  captureGroup?: number;
}

/** Shannon entropy in bits/char. */
export function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/** Count distinct character classes present (lower, upper, digit, symbol). */
export function charClasses(s: string): number {
  let c = 0;
  if (/[a-z]/.test(s)) c++;
  if (/[A-Z]/.test(s)) c++;
  if (/[0-9]/.test(s)) c++;
  if (/[^A-Za-z0-9]/.test(s)) c++;
  return c;
}

/** Luhn checksum - used to avoid false-positive credit-card matches. */
export function luhnValid(input: string): boolean {
  const digits = input.replace(/[^0-9]/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** A long token is a likely secret if it is high-entropy and class-mixed. */
export function isHighEntropySecret(value: string): boolean {
  return shannonEntropy(value) >= 4.2 && charClasses(value) >= 3;
}

/**
 * Detectors are applied in order; earlier (more specific) matches are redacted
 * first so a structured secret is never double-counted by the generic
 * high-entropy backstop.
 */
export const DETECTORS: Detector[] = [
  {
    kind: 'pem_private_key',
    pattern:
      /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/g,
  },
  {
    kind: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  },
  {
    kind: 'aws_access_key_id',
    pattern: /\b(?:AKIA|ASIA|AROA|AIDA|AGPA|ANPA|ANVA|ABIA|ACCA)[0-9A-Z]{16}\b/g,
  },
  {
    kind: 'github_token',
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/g,
  },
  {
    kind: 'github_pat',
    pattern: /\bgithub_pat_[A-Za-z0-9_]{82}\b/g,
  },
  {
    kind: 'slack_token',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    kind: 'google_api_key',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    kind: 'stripe_secret_key',
    pattern: /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}\b/g,
  },
  {
    kind: 'anthropic_api_key',
    pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    kind: 'openai_api_key',
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    kind: 'bearer_token',
    pattern: /\bBearer\s+([A-Za-z0-9._~+/-]{10,}=*)/g,
    captureGroup: 1,
  },
  {
    kind: 'secret_assignment',
    pattern:
      /\b(password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|client[_-]?secret|auth[_-]?token|token|private[_-]?key)\b\s*["']?\s*[:=]\s*["']?([^\s"',;]{6,})/gi,
    captureGroup: 2,
  },
  {
    kind: 'cookie',
    pattern: /\b(?:Set-)?Cookie:\s*([^\r\n]+)/gi,
    captureGroup: 1,
  },
  {
    kind: 'high_entropy_secret',
    pattern: /(?<![A-Za-z0-9+/=_-])[A-Za-z0-9+/=_-]{32,}(?![A-Za-z0-9+/=_-])/g,
    validate: isHighEntropySecret,
  },
  {
    kind: 'email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    kind: 'credit_card',
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
    validate: luhnValid,
  },
  {
    kind: 'ipv4',
    pattern:
      /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
  },
];

/** A user-supplied detector, loaded from .ledger/config.json. */
export interface CustomPattern {
  kind: string;
  pattern: string;
  flags?: string;
  captureGroup?: number;
}

/**
 * Build the effective detector list: user custom patterns first (so org-specific
 * secrets win), then the built-ins minus any disabled kinds. Invalid custom
 * patterns are skipped rather than throwing.
 */
export function compileDetectors(
  custom: CustomPattern[] = [],
  disabledKinds: string[] = [],
): Detector[] {
  const disabled = new Set(disabledKinds);
  const extra: Detector[] = [];
  for (const c of custom) {
    if (!c || typeof c.pattern !== 'string' || typeof c.kind !== 'string') continue;
    try {
      const flags = (c.flags ?? '').includes('g') ? (c.flags as string) : `${c.flags ?? ''}g`;
      extra.push({ kind: c.kind, pattern: new RegExp(c.pattern, flags), captureGroup: c.captureGroup });
    } catch {
      // skip invalid regex
    }
  }
  return [...extra, ...DETECTORS.filter((d) => !disabled.has(d.kind))];
}
