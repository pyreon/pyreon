#!/bin/bash
# Enforce branch naming convention: feat/, fix/, docs/, release/, chore/, refactor/, test/, perf/
# Used as a Claude Code PreToolUse hook on Bash for git checkout -b / git switch -c

cmd=$(jq -r '.tool_input.command // ""')

# Only check branch creation commands
if ! echo "$cmd" | grep -qE 'git (checkout -b|switch -c)'; then
  echo '{}'
  exit 0
fi

# Extract branch name (last argument after -b or -c)
branch=$(echo "$cmd" | grep -oE '(checkout -b|switch -c) [^ ]+' | awk '{print $NF}')

if [ -z "$branch" ]; then
  echo '{}'
  exit 0
fi

# Allow worktree branches (internal)
if echo "$branch" | grep -qE '^worktree-'; then
  echo '{}'
  exit 0
fi

# Check prefix
if echo "$branch" | grep -qE '^(feat|fix|docs|release|chore|refactor|test|perf)/'; then
  echo '{}'
  exit 0
fi

echo "{\"decision\":\"block\",\"reason\":\"[Pyreon] Branch name '${branch}' must start with feat/, fix/, docs/, release/, chore/, refactor/, test/, or perf/\"}"
