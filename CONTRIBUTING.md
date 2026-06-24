# Contributing to Claude Code Ledger

Thanks for your interest! This is the open-source core of Ledger.

## Development setup

```bash
npm install
npm run build
npm test
```

- **Language:** TypeScript (strict), CommonJS, Node ≥ 22.
- **Storage:** Node built-in `node:sqlite` - do not add native DB dependencies.
- **Tests:** Vitest. Every module has tests under `test/`.

## Ground rules

- **Redaction is sacred.** Any change touching `src/redaction/` or `src/capture/` must keep the adversarial corpus in `test/redaction.test.ts` green, and add cases for new secret formats. Never let a secret reach the store.
- **Capture must never break a Claude Code session.** The `hook` command swallows errors and exits 0.
- **Keep modules small and single-purpose.** Prefer command-per-file under `src/commands/`.
- **No scope creep into the control plane.** Server/SaaS features belong in a separate project - see `docs/architecture/control-plane.md`.

## Before opening a PR

```bash
npm run typecheck && npm test
```

Add or update tests for your change, and update the README/docs if behavior changes.

## Adding a new redaction detector

1. Add a `Detector` to `src/redaction/detectors.ts` (specific patterns before the high-entropy backstop).
2. Add positive **and** negative cases to `test/redaction.test.ts`.
3. Run the suite and confirm no new false positives.
