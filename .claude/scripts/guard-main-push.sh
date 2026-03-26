#!/bin/bash
# Guard against direct pushes to main/master
# Used as a Claude Code PreToolUse hook on Bash

cmd=$(jq -r '.tool_input.command // ""')
if echo "$cmd" | grep -qE '^git push'; then
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
  if [ "$branch" = "main" ] || [ "$branch" = "master" ]; then
    echo '{"decision":"block","reason":"[Pyreon] Direct push to main is not allowed. Use a feature branch + PR."}'
    exit 0
  fi
fi
echo '{}'
