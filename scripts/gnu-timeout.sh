#!/usr/bin/env bash
# Run a command under GNU `timeout`, whatever the runner image calls it.
#
#   bash scripts/gnu-timeout.sh [timeout options] DURATION COMMAND [ARG]...
#
# GNU `timeout` signals the command's WHOLE process group when the deadline
# passes. Two things in CI depend on that:
#   - a hung grandchild (an `apt` under `playwright install-deps`, a build a
#     postinstall started) must die so the step can fail;
#   - a step that pipes into `tee` only ends when EVERY process holding the
#     pipe has exited, so a surviving grandchild keeps the step running until
#     the job's own timeout kills it — and a killed job uploads no logs.
#
# Ubuntu 26.04 ships the uutils rewrite as `timeout`, which signals only its
# direct child, and keeps GNU as `gnutimeout`. Measured in containers: 24.04's
# GNU 9.4 kills the grandchild, 26.04's uutils 0.10.0 does not. On the first
# 26.04 runners the docs build's `timeout 10m bun install | tee …` ran to the
# job's 30-minute kill instead of failing at 10 minutes, with no log.
#
# `scripts/check-gnu-timeout.ts` (validate-fast) rejects a bare `timeout` in
# workflows, actions and scripts, so every bounded command goes through here.
set -euo pipefail

case "$(timeout --version 2>/dev/null || true)" in
  *'GNU coreutils'*) exec timeout "$@" ;;
esac
if command -v gnutimeout >/dev/null 2>&1; then
  exec gnutimeout "$@"
fi
echo '::warning::GNU timeout not found; a hung grandchild could outlive this deadline' >&2
exec timeout "$@"
