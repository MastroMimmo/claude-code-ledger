# Claude Code Ledger - Design (open-source core)

> Status: approved 2026-06-24. Derives from `deep-research-report.md`.

## Goal

A **local-first** companion for Claude Code that makes agentic work *reproducible, transferable, and safe* - without forking Claude Code. The open-source core delivers the three capabilities the research report identifies as the real white space: **capture → transfer → reproduce**, with secret/PII redaction applied *before* anything is persisted.

The commercial control plane (multi-tenant SaaS, ClickHouse analytics, hosted runners, GitHub evidence gate, OPA policy engine, web dashboards) is **out of scope** for the OSS core and lives as documented architecture + scaffold only - it needs cloud infra that cannot be shipped as a runnable local artifact.

## Shape

Two things ship together:

1. **`ledger` CLI** (TypeScript/Node) - the engine: store, redaction, context packs, replay.
2. **Claude Code plugin** - wires native hooks (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`) to `ledger hook <event>`, so capture happens automatically.

Why TS/Node instead of the report's Rust/Go: it is the native ecosystem for Claude Code plugins/hooks/MCP, reaches a working tool fastest, and is the most contributor-friendly. Storage uses Node's built-in `node:sqlite` (`DatabaseSync`) - **zero native dependencies**.

## Architecture (modules)

| Module | Responsibility | Depends on |
|---|---|---|
| `config` | Resolve `.ledger/` dir (per-repo), paths | fs |
| `store` | `node:sqlite` schema + typed DAO for sessions/events | config |
| `redaction` | Detect & redact secrets/PII *before* persistence | - (pure) |
| `capture` | Map Claude Code hook payloads → redacted events → store | store, redaction |
| `pack` | Synthesize a transferable context pack (md + json) from sessions | store |
| `replay` | Re-run captured commands/tests in an ephemeral fingerprinted dir | store |
| `cli` | `commander` wiring of all commands | all |

Data flow: `Claude Code hook → ledger hook → capture (map) → redaction (scrub) → store (persist)`. Read side: `store → pack/replay/show`.

### Data model
- **session**: `id`, `cwd`, `started_at`, `ended_at`, `git_branch`, `git_commit`, `meta`.
- **event**: `id`, `session_id`, `seq`, `ts`, `type` (`prompt|tool_use|tool_result|file_read|file_edit|bash|test|note`), `tool`, `summary`, `payload` (redacted JSON), `redactions` (count by kind).

### Redaction (the differentiator)
Detectors: cloud keys (AWS/GCP/Azure), generic API keys, JWTs, PEM private keys, OAuth/bearer tokens, cookies, high-entropy strings, and PII (emails, IPs). Redaction replaces matches with `«REDACTED:KIND»` and records counts. Validated by an **adversarial test corpus** - if redaction misses, the product fails its core promise, so this is the most heavily tested module.

### Context pack
`ledger pack [session...]` → a structured artifact: title, summary, decisions, files touched, commands/tests run, open threads/TODOs, environment fingerprint. Emitted as Markdown (human handoff) + JSON (re-import). Stored under `.ledger/packs/`.

### Replay
`ledger replay <session>` → copies the repo state (or a clean checkout) into a temp dir, records a fingerprint (branch, commit, node/tooling versions, deps hash), re-runs the captured bash/test commands, and reports whether outcomes match. Local & lightweight; the enterprise container/k8s orchestration is future work.

## Out of scope (documented scaffold only)
SaaS control plane · multi-tenant backend · ClickHouse · hosted ephemeral runners · GitHub/GitLab App with blocking evidence gate · OPA/Rego central policy engine · web dashboards · SSO/billing. See `docs/architecture/control-plane.md`.

## Success criteria
- `ledger --help` lists all commands; `npm run build` and `npm test` are green.
- Capturing a real Claude Code session produces redacted events with **no secrets** in the store.
- `ledger pack` yields a re-importable artifact; `ledger replay` reproduces a captured command.
- Adversarial redaction corpus passes 100%.
