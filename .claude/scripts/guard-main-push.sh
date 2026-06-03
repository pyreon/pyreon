#!/bin/bash
# Guard against direct pushes to main/master.
# Used as a Claude Code PreToolUse hook on Bash.
#
# Worktree-aware: the hook runs with cwd = the project root (the MAIN repo,
# usually on `main`), but the command it inspects may target a different repo
# via `git -C <dir>` or a leading `cd <dir>` (e.g. a git worktree on a feature
# branch). Checking the hook's cwd branch produced false positives — it blocked
# legitimate feature-branch pushes made from a worktree. This guard resolves the
# repo the command ACTUALLY targets and checks THAT branch.

cmd=$(jq -r '.tool_input.command // ""')

# Only act on commands that run `git push` — anywhere in the command (after a
# shell separator), and including the `git -C <dir> push` form. The old
# `^git push` anchor missed `cd … && git push` and `git -C … push` entirely.
if ! printf '%s' "$cmd" | grep -qE '(^|[;&| ])git( +-C +[^ ]+)? +push'; then
  echo '{}'
  exit 0
fi

# Resolve the target repo dir: an explicit `git -C <dir>` wins; else a leading
# `cd <dir>`; else the hook's cwd (".").
dir=$(printf '%s' "$cmd" | grep -oE 'git +-C +[^ ]+' | head -1 | sed -E 's/git +-C +//')
[ -z "$dir" ] && dir=$(printf '%s' "$cmd" | grep -oE '(^|&&|;)[[:space:]]*cd +[^ &;|]+' | head -1 | sed -E 's/.*cd +//')
[ -z "$dir" ] && dir="."

branch=$(git -C "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ "$branch" = "main" ] || [ "$branch" = "master" ]; then
  echo '{"decision":"block","reason":"[Pyreon] Direct push to main is not allowed. Use a feature branch + PR."}'
  exit 0
fi
echo '{}'
