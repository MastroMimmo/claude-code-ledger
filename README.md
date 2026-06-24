<p align="center">
  <img src="assets/banner.png" alt="Claude Code Ledger" width="100%">
</p>

<h1 align="center">Claude Code Ledger</h1>

<p align="center">
  <b>Local-first capture · secret/PII redaction · transferable context packs · deterministic replay</b><br>
  A companion that makes your <a href="https://docs.claude.com/en/docs/claude-code">Claude Code</a> sessions reproducible, transferable and safe - without forking the agent.
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue">
  <img alt="Node" src="https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
  <img alt="Tests" src="https://img.shields.io/badge/tests-52%20passing-brightgreen">
  <img alt="Dependencies" src="https://img.shields.io/badge/runtime%20deps-1-success">
  <img alt="Status" src="https://img.shields.io/badge/status-alpha-orange">
</p>

---

## Why

Claude Code is a powerful agentic coding environment - but the work it does is hard to make **reproducible, transferable and safe** across sessions, machines and people, and it keeps session transcripts on disk **in plaintext by default**. Ledger sits *on top of* Claude Code (it does not fork or replace it) and adds the three things the agent loop doesn't:

- 🎥 **Capture** - a flight recorder for prompts, tools, files, commands and tests.
- 📦 **Transfer** - a *context pack*: a structured, re-importable handoff of decisions, files and open threads.
- ♻️ **Reproduce** - a deterministic local replay of captured commands in an ephemeral, fingerprinted workdir.

Everything is **redacted before it touches disk** - API keys, tokens, JWTs, PEM keys, cookies and PII are scrubbed *before* persistence.

> **Status:** alpha. This repository is the **open-source core**. The hosted control plane (multi-tenant SaaS, hosted runners, policy engine, PR evidence gate, dashboards) is intentionally out of scope and documented in [`docs/architecture/control-plane.md`](docs/architecture/control-plane.md).

## How it works

```mermaid
flowchart LR
    A[Claude Code<br/>CLI · VS Code · CI] -->|hooks| B[ledger hook]
    B --> C[Capture<br/>map event]
    C --> D[Redaction<br/>secrets & PII]
    D --> E[(SQLite store<br/>.ledger/)]
    E --> F[ledger pack<br/>md + json]
    E --> G[ledger replay<br/>ephemeral runner]
    F --> H[handoff · PR · CI]
```

Native hooks (`SessionStart`, `UserPromptSubmit`, `PostToolUse`, `Stop`, `SessionEnd`) feed `ledger hook <event>`. Each event is mapped, **redacted**, and written to a per-repo SQLite store at `.ledger/`. Storage uses Node's built-in `node:sqlite` - **zero native dependencies**.

## Redaction - the core promise

<p align="center">
  <img src="assets/redaction.png" alt="Secrets are redacted before they touch disk" width="82%">
</p>

Detected and redacted *before persistence*: AWS access keys, GitHub tokens/PATs, Slack tokens, Google API keys, Stripe/OpenAI/Anthropic keys, JWTs, PEM private keys, bearer tokens, `key=value` secret assignments, cookies - plus PII (emails, IPv4, Luhn-valid credit cards) and a high-entropy backstop. Structured payloads are scrubbed recursively, and sensitive object keys (`password`, `token`, `authorization`, …) are redacted by name.

Because redaction *is* the product, it carries the heaviest test coverage - an adversarial corpus in [`test/redaction.test.ts`](test/redaction.test.ts).

## Quick start

> Requires **Node.js ≥ 22**.

```bash
git clone <this-repo> claude-code-ledger
cd claude-code-ledger
npm install && npm run build
npm link                # exposes the `ledger` CLI on your PATH (optional)
```

```bash
cd your-project
ledger init             # create the .ledger/ store
# ... use Claude Code normally; the plugin captures sessions ...
ledger status           # sessions / events / last activity
ledger show             # latest session events (redactions flagged)
ledger pack --title X   # write a transferable context pack (md + json)
ledger replay           # re-run captured commands in an ephemeral dir
```

Try the redaction engine directly:

```console
$ echo 'login password=hunter2longpass key AKIAIOSFODNN7EXAMPLE user a@b.com' | ledger redact-test
login password=«REDACTED:secret_assignment» key «REDACTED:aws_access_key_id» user «REDACTED:email»

3 redaction(s): aws_access_key_id=1, secret_assignment=1, email=1
```

### Use it as a plugin (automatic capture)

This repo is itself a plugin. After `npm run build`:

```
/plugin marketplace add /absolute/path/to/claude-code-ledger
/plugin install claude-code-ledger
```

Then run `ledger init` in any repo where you want capture. Hooks call `node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" hook <event>`, which is why the build step is required.

## Commands

| Command | What it does |
|---|---|
| `ledger init [-f]` | Create a `.ledger/` store in the current repo |
| `ledger status [--json]` | Sessions, events, last activity |
| `ledger list [-n N] [--json]` | List captured sessions |
| `ledger show [session] [--json]` | Show a session's events (defaults to latest) |
| `ledger pack [sessions...] [-o dir] [--title t]` | Generate a context pack (md + json) |
| `ledger import <file.json>` | Re-import a context pack into the store |
| `ledger replay [session] [--dry-run] [--keep] [--clean]` | Re-run captured commands in an ephemeral dir |
| `ledger redact-test [text] [--json]` | Run text/stdin through the redaction engine |
| `ledger hook <event>` | Internal: ingest a Claude Code hook (reads JSON from stdin) |

## Configuration

- **Store location:** `.ledger/` in the nearest ancestor directory; override with `LEDGER_HOME`.
- **Capture opt-in:** capture is skipped unless the repo has a `.ledger/` store. Set `LEDGER_CAPTURE_AUTOINIT=1` to auto-create on first hook.
- Keep `.ledger/` git-ignored - it holds local capture data.

## Architecture

| Doc | Contents |
|---|---|
| [`docs/architecture/overview.md`](docs/architecture/overview.md) | The open-source core - modules, data flow, data model |
| [`docs/architecture/control-plane.md`](docs/architecture/control-plane.md) | The hosted control plane (future work) |
| [`docs/specs/2026-06-24-ledger-design.md`](docs/specs/2026-06-24-ledger-design.md) | The approved design |

## Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest - store, redaction, capture, pack, replay, plugin
npm run build       # compile to dist/
npm run verify      # typecheck + build + test + end-to-end (scripts/e2e.sh)
npm run dev -- <command>   # run the CLI from source via tsx
```

## Privacy & security

Ledger is built around data minimization: redact before persistence, keep data local and per-repo, never harvest credentials. It does not require or store any LLM API keys.

## Contributing

PRs welcome - see [CONTRIBUTING.md](CONTRIBUTING.md). The golden rule: **never let a secret reach the store**, and keep the adversarial redaction corpus green.

## License

[Apache-2.0](LICENSE) © Alan Ferraioli
