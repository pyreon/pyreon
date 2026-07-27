#!/bin/bash
# Stop hook.
#
# The `Changeset` CI gate is the single most frequent cause of a freshly-pushed
# Pyreon PR bouncing. This catches it at the moment the turn ends, while the work
# is still in context, instead of five minutes later in CI.
#
# LOOP SAFETY (important): a Stop hook that exits 2 prevents Claude from stopping
# and continues the conversation. If the condition can't be satisfied, that loops
# forever. So this fires AT MOST ONCE per session, guarded by a marker file keyed
# on session_id. After one nudge it goes permanently quiet for that session.
#
# It intentionally does NOT re-implement the gate's classifier. It runs the real
# script (`check-changeset-required`) when available and trusts its verdict.
#
# Fails OPEN in every ambiguous case.

set -uo pipefail

input=$(cat)
session=$(printf '%s' "$input" | jq -r '.session_id // "unknown"')
marker="${TMPDIR:-/tmp}/pyreon-changeset-nudge-$session"

# Already nudged this session — stay quiet forever after.
[ -f "$marker" ] && { echo '{}'; exit 0; }

# Only meaningful inside the repo.
git rev-parse --git-dir >/dev/null 2>&1 || { echo '{}'; exit 0; }

# Nothing changed under packages/ → nothing to gate.
if ! git status --porcelain 2>/dev/null | grep -qE '^\s*[AMR?]{1,2}\s+packages/'; then
  echo '{}'
  exit 0
fi

# A changeset already present → satisfied.
if ls .changeset/*.md >/dev/null 2>&1 \
   && ls .changeset/*.md | grep -qv 'README'; then
  echo '{}'
  exit 0
fi

# Defer to the real gate when it exists; if it passes or is missing, stay quiet.
if [ -f scripts/check-changeset-required.ts ]; then
  if bun scripts/check-changeset-required.ts >/dev/null 2>&1; then
    echo '{}'
    exit 0
  fi
fi

touch "$marker"

cat >&2 <<'EOF'
[Pyreon] Changes under packages/ with no changeset present.

If any PUBLISHED package's source changed, the `Changeset` CI gate will fail.
Run `bun changeset` now, or confirm this is exempt (test/spec/story files, a
private package, or a comment-only edit) and say so explicitly.

This reminder fires once per session and will not fire again.
EOF
exit 2
