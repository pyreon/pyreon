#!/bin/bash
# SessionStart hook.
#
# Injects the working state a Pyreon session almost always needs in its first
# turn: which tree we are in (primary vs worktree), the branch, whether the tree
# is dirty, and whether a changeset is present for staged package work.
#
# Rationale: the repo's #1 recurring workflow trap is editing in the PRIMARY tree
# on `main` when the work should live in a worktree off origin/main. Surfacing
# that at turn zero costs one line and prevents a whole class of rework.
#
# Fails OPEN — a broken context hook must never block a session.

set -uo pipefail

cwd=$(pwd)
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")

# A linked worktree has a .git FILE; the primary checkout has a .git DIRECTORY.
if [ -f .git ]; then
  tree="linked worktree"
elif [ -d .git ]; then
  tree="PRIMARY tree"
else
  tree="not a git repo"
fi

dirty_count=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
changesets=$(ls .changeset/*.md 2>/dev/null | grep -v README | wc -l | tr -d ' ')

lines="Working tree: $tree at $cwd
Branch: $branch
Uncommitted files: $dirty_count
Pending changesets: $changesets"

# The load-bearing warning.
if [ "$tree" = "PRIMARY tree" ] && { [ "$branch" = "main" ] || [ "$branch" = "master" ]; }; then
  lines="$lines

NOTE: you are in the PRIMARY tree on $branch. Per this repo's workflow, code work
belongs in a worktree branched off origin/main:
  git worktree add /tmp/wt-<name> origin/main -b <prefix>/<name>
Edits must then use the worktree-prefixed absolute path. Local .claude/ config
changes are the normal exception."
fi

jq -n --arg ctx "$lines" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $ctx
  }
}'
