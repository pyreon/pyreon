#!/usr/bin/env bash
# Run `gradle <args…>`, retrying ONLY a failed dependency download, and saying so.
#
#   bash scripts/native-gradle.sh assembleDebug --stacktrace
#
# The Android device lane resolves its plugins and libraries from Maven Central
# and Google on most runs: the `gradle-deps-*` Actions cache is written on main
# only, and it was gone 9.5 hours after the 2026-11-11 nightly saved it (the
# repo's cache budget evicts by last use). Run 43158195101 then failed in 12 s
# with "Could not resolve org.jetbrains.kotlin:kotlin-gradle-plugin:2.4.21" and
# reddened a required check on a network blip.
#
# A retry happens only when Gradle's own output names a resolution or download
# failure. A compile error, a failed task or a failed test exits at once with
# Gradle's exit code. Each retry prints a `::warning::` with the attempt number
# and the line that caused it, so a retried run is visibly a retried run.
set -uo pipefail

max_attempts=3
backoff="${PYREON_GRADLE_RETRY_SLEEP:-20}"
download_failure='Could not resolve all (artifacts|files|dependencies|task dependencies)|Could not (GET|HEAD|download) |Could not resolve [A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+:'

log="$(mktemp)"
trap 'rm -f "$log"' EXIT
attempt=1
while :; do
  gradle "$@" 2>&1 | tee "$log"
  rc=${PIPESTATUS[0]}
  [ "$rc" -eq 0 ] && exit 0
  if [ "$attempt" -lt "$max_attempts" ] && grep -Eq "$download_failure" "$log"; then
    cause="$(grep -Em1 "$download_failure" "$log" | sed 's/^[[:space:]>*]*//')"
    wait_s=$((attempt * backoff))
    echo "::warning::gradle $*: dependency download failed on attempt ${attempt} of ${max_attempts} (${cause}); retrying in ${wait_s}s"
    sleep "$wait_s"
    attempt=$((attempt + 1))
    continue
  fi
  if [ "$attempt" -gt 1 ]; then
    echo "::error::gradle $*: still failing after ${attempt} attempt(s)"
  fi
  exit "$rc"
done
