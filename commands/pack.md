---
description: Generate a transferable context pack from the latest Ledger session
argument-hint: "[--title \"...\"] [session...]"
allowed-tools: Bash(node *)
---

Generating a transferable context pack:

!`node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" pack $ARGUMENTS`

Tell me where the pack was written and summarize what it captures (decisions, files, commands, open threads).
