#!/usr/bin/env bash
# End-to-end verification of the Ledger core: init → capture (with secrets) →
# status/pack → import into a fresh repo → replay. Asserts no secret ever
# reaches the store or the context pack.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$ROOT/dist/cli.js"
[ -f "$CLI" ] || { echo "E2E FAIL: dist/cli.js missing - run 'npm run build' first"; exit 1; }

fail() { echo "E2E FAIL: $1"; exit 1; }

WORK="$(mktemp -d)"
DEST="$(mktemp -d)"
cleanup() { rm -rf "$WORK" "$DEST"; }
trap cleanup EXIT

SECRET_AWS="AKIAIOSFODNN7EXAMPLE"
SECRET_PW="hunter2supersecret"

cd "$WORK"
node "$CLI" init >/dev/null

emit() { printf '%s' "$1" | node "$CLI" hook "$2" ; }

emit "{\"session_id\":\"v1\",\"cwd\":\"$WORK\",\"hook_event_name\":\"SessionStart\",\"source\":\"startup\"}" SessionStart
emit "{\"session_id\":\"v1\",\"cwd\":\"$WORK\",\"hook_event_name\":\"UserPromptSubmit\",\"prompt\":\"deploy; TODO rotate keys; password=$SECRET_PW\"}" UserPromptSubmit
emit "{\"session_id\":\"v1\",\"cwd\":\"$WORK\",\"hook_event_name\":\"PostToolUse\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"echo $SECRET_AWS\"},\"tool_response\":\"ok\"}" PostToolUse
emit "{\"session_id\":\"v1\",\"cwd\":\"$WORK\",\"hook_event_name\":\"PostToolUse\",\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"src/x.ts\"}}" PostToolUse
emit "{\"session_id\":\"v1\",\"cwd\":\"$WORK\",\"hook_event_name\":\"PostToolUse\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"true\"}}" PostToolUse
emit "{\"session_id\":\"v1\",\"cwd\":\"$WORK\",\"hook_event_name\":\"Stop\"}" Stop

# --- assert no raw secret in the store ---
if grep -aqs "$SECRET_AWS" "$WORK/.ledger/ledger.db"; then fail "AWS secret leaked into store"; fi
if grep -aqs "$SECRET_PW"  "$WORK/.ledger/ledger.db"; then fail "password leaked into store"; fi

# --- status / pack ---
node "$CLI" status | grep -q "Events:" || fail "status output missing"
node "$CLI" pack v1 --title "Verify" >/dev/null
PACK="$(ls "$WORK"/.ledger/packs/*.json 2>/dev/null | head -1)"
[ -f "$PACK" ] || fail "context pack json not created"
if grep -aqs "$SECRET_AWS" "$PACK"; then fail "AWS secret leaked into pack"; fi
if grep -aqs "$SECRET_PW"  "$PACK"; then fail "password leaked into pack"; fi

# --- import into a fresh repo ---
cd "$DEST"
node "$CLI" init >/dev/null
node "$CLI" import "$PACK" | grep -q "Imported 1 session" || fail "import failed"
node "$CLI" show v1 | grep -q "src/x.ts" || fail "imported session missing the file edit"

# --- replay in the original repo ---
cd "$WORK"
node "$CLI" replay v1 --clean | grep -q "Result: PASS" || fail "replay did not PASS"

echo "E2E PASS"
