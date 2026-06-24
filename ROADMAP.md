# Roadmap to 1.0

This roadmap covers the **open-source core** (the local `ledger` CLI + Claude Code plugin). The hosted control plane (SaaS, PR evidence gate, policy engine, dashboards, analytics) is a separate track and does **not** gate 1.0 - see [`docs/architecture/control-plane.md`](docs/architecture/control-plane.md).

> 1.0 means: install in one command, capture safely by default, never leak a secret, and reliable packs/replay across platforms - with stable formats you can build on.

## Guiding principles

- **Redact before persist.** No secret ever reaches disk, ever.
- **Local-first.** Per-repo data, nothing leaves the machine by default.
- **Never break the session.** Capture is best-effort and always exits cleanly.
- **Zero native dependencies.** Stay on Node's built-in `node:sqlite`.
- **Stable, documented formats.** Context pack and store schema are contracts.

## Status: 0.1.0 (shipped)

- [x] Capture via hooks, redaction engine (adversarial corpus), context packs, local replay
- [x] Single-file bundled CLI, `ledger init` with auto-gitignore
- [x] In-chat slash commands (`/ledger:*`), optional status line, `ledger doctor`
- [x] Per-repo config: auto-handoff on session end, custom/disabled redaction
- [x] JSONL hot-path with lazy ingest into SQLite

## 0.2 - Distribution & trust

- [ ] Publish to npm (`npm i -g claude-code-ledger`)
- [ ] CI: typecheck + test + e2e on every PR; release automation from tags
- [ ] CHANGELOG and semantic-versioning policy
- [ ] Redaction hardening: GCP service-account JSON, Azure keys, npm/PyPI tokens, private SSH keys; expand the corpus
- [ ] Redaction allowlist to tame false positives (`redaction.allowlist`)
- [ ] Config validation with helpful errors; `ledger doctor` flags bad config

## 0.3 - Performance & robustness

- [ ] Optional capture daemon to remove the per-hook Node startup cost (with a benchmark)
- [ ] Retention/pruning: `ledger prune` + config-driven expiry; store size reporting
- [ ] Versioned schema migrations framework (safe future changes)
- [ ] Concurrency and crash-safety hardening for parallel hooks / subagents

## 0.4 - UX & insight

- [ ] Richer context packs: per-file change stats, commit links, diff summaries
- [ ] `ledger search` across sessions and events
- [ ] HTML pack viewer; status line cost/time signals
- [ ] Cross-platform replay (Windows/PowerShell) tested on macOS + Windows in CI

## 0.5 (beta) - Handoff & interop

- [ ] One-shot `ledger handoff` (shareable bundle) and smoother import
- [ ] Optional OTel export of **redacted metadata only** (bridges to any backend without hosting one)
- [ ] Multi-session / worktree awareness (link related sessions)

## 1.0 - Stable & guaranteed

- [ ] Frozen, documented formats: context pack v1, CLI flags, store schema (with migrations)
- [ ] External security review / fuzzing of the redaction engine; published threat model
- [ ] Docs site with recipes and examples; meaningful test coverage target
- [ ] Backward-compatibility guarantee within the 1.x line

## Out of scope for 1.0 (separate, commercial track)

Multi-tenant SaaS, hosted ephemeral runners, blocking PR evidence gate, OPA/Rego central policy engine, cost/risk dashboards, SSO, EU self-host. These build on the same redacted-export boundary the core already provides.
