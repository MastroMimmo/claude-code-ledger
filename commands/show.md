---
description: Show the events captured in the latest Ledger session
argument-hint: "[session-id]"
allowed-tools: Bash(node *)
---

Events captured in the latest session (or the session id passed as arguments):

!`node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" show $ARGUMENTS`

Give me a short, readable summary of what happened in this session, and call out anything that was redacted.
