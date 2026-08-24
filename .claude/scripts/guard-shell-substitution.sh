#!/bin/bash
# Block command substitution that lands inside a message/body argument by
# accident. Used as a Claude Code PreToolUse hook on Bash.
#
# The failure this exists for: writing prose with markdown code spans into a
# DOUBLE-quoted shell argument.
#
#   gh pr comment --body "the `foo` helper is wrong"
#
# zsh/bash execute everything between the backticks and splice the (empty)
# output in, so the posted comment silently loses `foo` — and the tool reports
# success, because from git's or gh's point of view nothing failed. The same
# shape eats parts of `git commit -m` messages.
#
# It is already documented in this repo's rules and in the agent's own notes,
# and it still recurred. A note that has to be remembered at the moment of
# writing is not a control; this is.
#
# Precision matters more than breadth here, so the check is narrow in three
# ways:
#
#   • Only fires when a backtick is genuinely inside a DOUBLE-quoted region.
#     Single quotes suppress substitution, so `--body 'a `b` c'` is safe and
#     must not be flagged.
#   • Only fires when the command carries a message-ish flag. A deliberate
#     `X="`date`"` elsewhere is archaic but not this mistake.
#   • Says nothing about `$(...)`, which is nearly always intentional — passing
#     `--body-file` content via `-f body="$(cat notes.md)"` is the RECOMMENDED
#     fix, and flagging it would train people to ignore the guard.

cmd=$(jq -r '.tool_input.command // ""')

# Fast bail: no backtick anywhere.
case "$cmd" in
  *'`'*) ;;
  *) echo '{}'; exit 0 ;;
esac

# Only guard commands that carry prose in an argument.
if ! printf '%s' "$cmd" | grep -qE '(^|[[:space:]])(-m|--body|--title|--notes|--message|--description)([[:space:]]|=)'; then
  echo '{}'
  exit 0
fi

# Walk the command tracking quote state; report a backtick seen while inside
# double quotes. Backslash escapes are honoured inside double quotes, so an
# explicitly escaped \` is correctly NOT flagged.
danger=$(printf '%s' "$cmd" | awk '
{
  n = length($0)
  for (i = 1; i <= n; i++) {
    c = substr($0, i, 1)
    if (in_double && c == "\\") { i++; continue }
    if (c == "'"'"'" && !in_double) { in_single = !in_single; continue }
    if (c == "\"" && !in_single) { in_double = !in_double; continue }
    if (c == "`" && in_double && !in_single) { print "yes"; exit }
  }
}')

if [ "$danger" = "yes" ]; then
  cat <<'JSON'
{"decision":"block","reason":"[Pyreon] A backtick inside a double-quoted message/body argument is COMMAND SUBSTITUTION — the shell will execute it and silently drop the text, and the command will still report success.\n\nWrite the body to a file and pass it by reference instead:\n  cat > /tmp/body.md <<'EOF'\n  ... your markdown, backticks and all ...\n  EOF\n  gh pr comment <N> --body-file /tmp/body.md\n  git commit -F /tmp/body.md\n\n(Single quotes also suppress substitution, if the text contains none of its own.)"}
JSON
  exit 0
fi

echo '{}'
