---
description: Show the plan of commands Ledger would replay for a session (dry run)
argument-hint: "[session-id]"
allowed-tools: Bash(node *)
---

Replay plan for the session (dry run - nothing is executed):

!`node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" replay $ARGUMENTS --dry-run`

Explain what would be re-run. If I want to actually execute it, I can run `ledger replay` in a terminal.
