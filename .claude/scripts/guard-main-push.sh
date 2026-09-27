#!/bin/bash
# Guard against pushes to main/master.
# Used as a Claude Code PreToolUse hook on Bash.
#
# A push is judged by WHERE IT WRITES, not by what is checked out:
#   - an explicit refspec whose destination is main/master blocks
#     (`git push origin main`, `HEAD:main`, `x:refs/heads/main`, `+main`,
#     `--delete main`), whatever branch the repo is on;
#   - `--all` / `--mirror` block, since they can write main;
#   - with no refspec, git pushes the current branch, so the current branch of
#     the repo the command targets decides.
# Checking only the current branch blocked feature-branch pushes made from a
# checkout that sits on main (including the bare primary tree) and let
# `git push origin HEAD:main` from a feature branch through.

set -f  # tokens like `*` must not glob-expand
cmd=$(jq -r '.tool_input.command // ""')

if ! printf '%s' "$cmd" | grep -qE '(^|[;&| ])git( +-C +[^ ]+)? +push'; then
  echo '{}'
  exit 0
fi

block() {
  echo '{"decision":"block","reason":"[Pyreon] Direct push to main is not allowed. Use a feature branch + PR."}'
  exit 0
}

# Target repo: an explicit `git -C <dir>` wins; else a leading `cd <dir>`; else ".".
dir=$(printf '%s' "$cmd" | grep -oE 'git +-C +[^ ]+' | head -1 | sed -E 's/git +-C +//')
[ -z "$dir" ] && dir=$(printf '%s' "$cmd" | grep -oE '(^|&&|;)[[:space:]]*cd +[^ &;|]+' | head -1 | sed -E 's/.*cd +//')
[ -z "$dir" ] && dir="."

# The arguments after `push`, up to the next shell separator.
args=$(printf '%s' "$cmd" | sed -E 's/.*git( +-C +[^ ]+)? +push//' | sed -E 's/(&&|\|\||;|\|).*//')

remote=""
refspecs=()
for tok in $args; do
  case "$tok" in
    --all|--mirror) block ;;
    -*) continue ;;
  esac
  if [ -z "$remote" ]; then remote=$tok; else refspecs+=("$tok"); fi
done

if [ ${#refspecs[@]} -eq 0 ]; then
  # Clear GIT_*: inside a git hook, git exports GIT_DIR (and friends) for the
  # OUTER repo, and it overrides `-C` — the lookup then reads the wrong
  # checkout's branch. See anti-patterns "GIT_* env-var leak inside git hooks".
  branch=$(unset $(compgen -e | grep '^GIT_'); git -C "$dir" symbolic-ref --short -q HEAD 2>/dev/null)
  if [ "$branch" = "main" ] || [ "$branch" = "master" ]; then block; fi
  echo '{}'
  exit 0
fi

for spec in "${refspecs[@]}"; do
  spec=${spec#+}
  dst=${spec##*:}
  dst=${dst#refs/heads/}
  if [ "$dst" = "main" ] || [ "$dst" = "master" ]; then block; fi
done
echo '{}'
