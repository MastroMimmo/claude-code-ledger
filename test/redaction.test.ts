import { describe, it, expect } from 'vitest';
import { redact, redactDeep, totalRedactions, compileDetectors } from '../src/redaction';

/** A realistic-but-fake high-entropy secret (mixed case + digits, 40 chars). */
const HIGH_ENTROPY = 'Zk8sLp2QwErTyUiOpAsDfGhJkL9mN3bV5cX7zQ1w';

const POSITIVES: Array<{ name: string; kind: string; input: string; secret: string }> = [
  {
    name: 'AWS access key id',
    kind: 'aws_access_key_id',
    input: 'export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
    secret: 'AKIAIOSFODNN7EXAMPLE',
  },
  {
    name: 'GitHub token',
    kind: 'github_token',
    input: `clone with ghp_${'x'.repeat(36)} now`,
    secret: `ghp_${'x'.repeat(36)}`,
  },
  {
    name: 'Slack token',
    kind: 'slack_token',
    input: 'token=xoxb-123456789012-abcdefghijklmnop',
    secret: 'xoxb-123456789012-abcdefghijklmnop',
  },
  {
    name: 'Google API key',
    kind: 'google_api_key',
    input: `key AIza${'b'.repeat(35)} used`,
    secret: `AIza${'b'.repeat(35)}`,
  },
  {
    name: 'Stripe secret key',
    kind: 'stripe_secret_key',
    input: `charge with sk_live_${'4'.repeat(24)} ok`,
    secret: `sk_live_${'4'.repeat(24)}`,
  },
  {
    name: 'Anthropic API key',
    kind: 'anthropic_api_key',
    input: `ANTHROPIC_API_KEY sk-ant-${'a'.repeat(30)}`,
    secret: `sk-ant-${'a'.repeat(30)}`,
  },
  {
    name: 'OpenAI API key',
    kind: 'openai_api_key',
    input: `OPENAI sk-${'b'.repeat(40)} end`,
    secret: `sk-${'b'.repeat(40)}`,
  },
  {
    name: 'JWT',
    kind: 'jwt',
    input:
      'auth eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c done',
    secret:
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  },
  {
    name: 'PEM private key',
    kind: 'pem_private_key',
    input: '-----BEGIN RSA PRIVATE KEY-----\nMIIByQIBAAKBgQDk\n-----END RSA PRIVATE KEY-----',
    secret: 'MIIByQIBAAKBgQDk',
  },
  {
    name: 'Bearer token',
    kind: 'bearer_token',
    input: 'Authorization: Bearer abcdef0123456789ABCDEFghij',
    secret: 'abcdef0123456789ABCDEFghij',
  },
  {
    name: 'password assignment',
    kind: 'secret_assignment',
    input: 'password=hunter2longpass',
    secret: 'hunter2longpass',
  },
  {
    name: 'quoted api key assignment',
    kind: 'secret_assignment',
    input: '"API_KEY": "abcdef123456"',
    secret: 'abcdef123456',
  },
  {
    name: 'cookie header',
    kind: 'cookie',
    input: 'Cookie: session=abc123def456; theme=dark',
    secret: 'session=abc123def456; theme=dark',
  },
  {
    name: 'email (PII)',
    kind: 'email',
    input: 'contact john.doe@example.com please',
    secret: 'john.doe@example.com',
  },
  {
    name: 'credit card (PII)',
    kind: 'credit_card',
    input: 'card 4242 4242 4242 4242 exp',
    secret: '4242 4242 4242 4242',
  },
  {
    name: 'IPv4 (PII)',
    kind: 'ipv4',
    input: 'server at 203.0.113.45 responded',
    secret: '203.0.113.45',
  },
  {
    name: 'high-entropy secret',
    kind: 'high_entropy_secret',
    input: `token ${HIGH_ENTROPY} here`,
    secret: HIGH_ENTROPY,
  },
];

const NEGATIVES: Array<{ name: string; input: string }> = [
  { name: 'plain prose with the word secret', input: 'Please keep this information secret and safe.' },
  { name: 'short numbers', input: 'The build finished in 12.5 seconds.' },
  { name: 'git sha (40 hex)', input: 'commit 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b landed' },
  { name: 'uuid', input: 'id 550e8400-e29b-41d4-a716-446655440000 created' },
  { name: 'version string', input: 'running node v22.22.0 on linux' },
  { name: 'three-octet number', input: 'see section 1.2.3 of the manual' },
];

describe('redaction - adversarial corpus (positives)', () => {
  for (const c of POSITIVES) {
    it(`redacts ${c.name}`, () => {
      const result = redact(c.input);
      expect(result.text).not.toContain(c.secret);
      expect(result.redactions[c.kind] ?? 0).toBeGreaterThanOrEqual(1);
    });
  }
});

describe('redaction - adversarial corpus (negatives, no false positives)', () => {
  for (const c of NEGATIVES) {
    it(`leaves ${c.name} untouched`, () => {
      const result = redact(c.input);
      expect(result.text).toBe(c.input);
      expect(totalRedactions(result.redactions)).toBe(0);
    });
  }
});

describe('redaction - behavior', () => {
  it('counts multiple secrets in one string', () => {
    const input = 'k1 AKIAIOSFODNN7EXAMPLE and email a@b.co and password=supersecret';
    const r = redact(input);
    expect(r.redactions.aws_access_key_id).toBe(1);
    expect(r.redactions.email).toBe(1);
    expect(r.redactions.secret_assignment).toBe(1);
    expect(totalRedactions(r.redactions)).toBe(3);
  });

  it('is stable when applied twice (no re-redaction of placeholders)', () => {
    const input = 'password=hunter2longpass and AKIAIOSFODNN7EXAMPLE';
    const once = redact(input).text;
    const twice = redact(once).text;
    expect(twice).toBe(once);
  });

  it('does not double-redact overlapping detectors (token=ghp_…)', () => {
    const r = redact(`token=ghp_${'x'.repeat(36)}`);
    expect(r.redactions.github_token).toBe(1);
    expect(r.redactions.secret_assignment ?? 0).toBe(0);
    expect(r.text).toContain('«REDACTED:github_token»');
  });

  it('returns an empty report for clean input', () => {
    const r = redact('nothing sensitive here at all');
    expect(r.redactions).toEqual({});
  });
});

describe('redaction - custom patterns and disabling', () => {
  it('redacts a custom org pattern', () => {
    const detectors = compileDetectors([{ kind: 'acme_token', pattern: 'ACME-[0-9]{6}' }]);
    const r = redact('id ACME-123456 done', detectors);
    expect(r.text).not.toContain('ACME-123456');
    expect(r.redactions.acme_token).toBe(1);
  });

  it('can disable a built-in detector kind', () => {
    const detectors = compileDetectors([], ['email']);
    const r = redact('write to a@b.com', detectors);
    expect(r.text).toContain('a@b.com');
    expect(r.redactions.email ?? 0).toBe(0);
  });

  it('skips an invalid custom regex without throwing', () => {
    const detectors = compileDetectors([{ kind: 'bad', pattern: '(' }]);
    expect(() => redact('anything', detectors)).not.toThrow();
  });
});

describe('redactDeep - payloads', () => {
  it('redacts strings recursively and sensitive keys by name', () => {
    const { value, redactions } = redactDeep({
      password: 'short',
      note: 'leaked AKIAIOSFODNN7EXAMPLE in logs',
      nested: { authToken: 'whatever', list: ['email me at x@y.com'] },
    });
    const v = value as Record<string, unknown>;
    expect(v.password).toBe('«REDACTED:sensitive_field»');
    expect(String(v.note)).not.toContain('AKIAIOSFODNN7EXAMPLE');
    const nested = v.nested as Record<string, unknown>;
    expect(nested.authToken).toBe('«REDACTED:sensitive_field»');
    expect(JSON.stringify(nested.list)).not.toContain('x@y.com');
    expect(redactions.sensitive_field).toBeGreaterThanOrEqual(2);
    expect(redactions.aws_access_key_id).toBe(1);
    expect(redactions.email).toBe(1);
  });

  it('preserves non-string values', () => {
    const { value } = redactDeep({ count: 3, ok: true, nothing: null });
    expect(value).toEqual({ count: 3, ok: true, nothing: null });
  });
});
