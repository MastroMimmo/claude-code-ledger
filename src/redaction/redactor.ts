import { DETECTORS } from './detectors';

export interface RedactionResult {
  text: string;
  redactions: Record<string, number>;
}

export interface DeepRedactionResult {
  value: unknown;
  redactions: Record<string, number>;
}

/** Object keys whose string values are always redacted regardless of content. */
const SENSITIVE_KEY =
  /^(?:password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|auth[_-]?token|client[_-]?secret|authorization|auth|cookie|set-cookie|private[_-]?key|session[_-]?id|token)$/i;

export function placeholder(kind: string): string {
  return `«REDACTED:${kind}»`;
}

function bump(counts: Record<string, number>, kind: string, n = 1): void {
  counts[kind] = (counts[kind] ?? 0) + n;
}

/** Redact secrets and PII from a string. */
export function redact(input: string): RedactionResult {
  let text = input;
  const redactions: Record<string, number> = {};

  for (const d of DETECTORS) {
    const flags = d.pattern.flags.includes('g') ? d.pattern.flags : d.pattern.flags + 'g';
    const re = new RegExp(d.pattern.source, flags);
    text = text.replace(re, (match: string, ...args: unknown[]): string => {
      // args = [...captureGroups, offset, fullString, (namedGroups?)]
      const trailing = typeof args[args.length - 1] === 'object' ? 3 : 2;
      const groups = args.slice(0, args.length - trailing) as (string | undefined)[];

      let captured = match;
      if (d.captureGroup != null) {
        const g = groups[d.captureGroup - 1];
        if (typeof g !== 'string') return match;
        captured = g;
      }
      // Never re-redact a value that is already a placeholder.
      if (captured.includes('«REDACTED:')) return match;
      if (d.validate && !d.validate(captured)) return match;

      bump(redactions, d.kind);
      if (d.captureGroup != null) {
        const idx = match.lastIndexOf(captured);
        return match.slice(0, idx) + placeholder(d.kind) + match.slice(idx + captured.length);
      }
      return placeholder(d.kind);
    });
  }

  return { text, redactions };
}

/** Recursively redact all strings within a JSON-serializable value. */
export function redactDeep(value: unknown): DeepRedactionResult {
  const redactions: Record<string, number> = {};

  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const r = redact(v);
      for (const [k, n] of Object.entries(r.redactions)) bump(redactions, k, n);
      return r.text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (typeof val === 'string' && SENSITIVE_KEY.test(k)) {
          bump(redactions, 'sensitive_field');
          out[k] = placeholder('sensitive_field');
        } else {
          out[k] = walk(val);
        }
      }
      return out;
    }
    return v;
  };

  return { value: walk(value), redactions };
}

/** Total number of redactions across all kinds. */
export function totalRedactions(redactions: Record<string, number>): number {
  return Object.values(redactions).reduce((a, b) => a + b, 0);
}
