#!/bin/bash
# PostToolUse hook on Edit|Write.
#
# Runs oxlint on the single file that was just written and feeds any findings
# straight back to Claude via `additionalContext`, so a lint error is corrected
# in the same turn instead of surfacing minutes later in `validate-fast`.
#
# Design notes:
#  - PostToolUse cannot block (the write already happened); it can only inform.
#    That is exactly what we want — this is a fast feedback loop, not a gate.
#  - Scoped to first-party TS/TSX under packages/, examples/, docs/ and scripts/.
#    Generated files, lib/ output and node_modules are skipped.
#  - Fails OPEN: any error here must never interfere with the edit.
#  - oxlint is Rust-fast on a single file; keep the timeout small.

set -uo pipefail

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""')

# Nothing to do without a path.
[ -z "$file" ] && { echo '{}'; exit 0; }

# Only first-party TypeScript sources.
case "$file" in
  *.ts|*.tsx) ;;
  *) echo '{}'; exit 0 ;;
esac
case "$file" in
  */node_modules/*|*/lib/*|*/dist/*|*.d.ts) echo '{}'; exit 0 ;;
esac
case "$file" in
  */packages/*|*/examples/*|*/docs/*|*/scripts/*) ;;
  *) echo '{}'; exit 0 ;;
esac

[ -f "$file" ] || { echo '{}'; exit 0; }

# `|| true` so a non-zero oxlint exit (findings present) does not abort the hook.
out=$(bunx oxlint --format=default "$file" 2>&1 || true)

# oxlint prints "Found 0 warnings and 0 errors" on a clean file.
if printf '%s' "$out" | grep -qE 'Found 0 warnings and 0 errors'; then
  echo '{}'
  exit 0
fi

# Keep the injected context bounded — a wall of output is worse than none.
trimmed=$(printf '%s' "$out" | head -c 4000)

jq -n --arg ctx "oxlint findings for $file (fix these now, before moving on):

$trimmed" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: $ctx
  }
}'
