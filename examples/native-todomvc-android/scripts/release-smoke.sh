#!/usr/bin/env bash
# Artifact-purity smoke: install the UNTOUCHED release APK (built WITHOUT
# -PpyreonReleaseTests, so it carries none of the release-test keeps),
# launch it, and assert the UI actually rendered — read through the
# accessibility tree via `uiautomator dump`, which needs no test APK and no
# instrumentation relationship with the target. This is the EXACT-BYTES
# claim the instrumented release lane cannot make (its tested build keeps
# the kotlin stdlib etc. for the runner's sake).
#
# `uiautomator dump` is NOT idempotent under a tight loop: each call opens a
# UiAutomation service connection, and if a previous call's connection has
# not finished tearing down, the next throws
# `UiAutomationService ... already registered!` and returns stale/empty XML.
# A once-per-second poll wins that race on a fast local emulator and LOSES it
# on a contended CI one (the shipped-red finding on #2762: every dump in the
# window failed, 'remaining' never appeared, and the crash dialog for the
# uiautomator command itself showed up in the captured tree — read as an app
# crash). Settle before the first dump, space polls generously, and back OFF
# an extra beat whenever a dump fails so the service fully deregisters.
#
# THAT WAS NOT ENOUGH, and the reason is the shape of the failure, not its
# frequency (it re-fired on a contended runner, 2026-08-18). The race does not
# reliably report itself through the EXIT CODE: `uiautomator dump` prints its
# error and still exits 0. So an exit-code guard falls through to `cat` and
# reads whatever is at $DUMP — which, after any earlier successful poll, is a
# STALE tree. That breaks the check in BOTH directions: a stale tree that
# happens to contain the marker is a false PASS for an app that never
# rendered, and a stale pre-launch tree is the false FAIL we observed. A gate
# that cannot tell those apart is not a gate.
#
# So judge the dump by its CONTENT, never by its exit status:
#   1. delete $DUMP before every attempt, so a stale file can never be read;
#   2. treat the known race strings in the command's own output as a failure;
#   3. require a plausible `<hierarchy>` document before believing the tree;
#   4. remember whether ANY valid tree was ever obtained, so the failure
#      message says which of the two things went wrong (the "message IS the
#      artifact" rule) instead of leaving the next reader to guess.
# Fail-closed throughout: no valid tree means FAIL, never a silent pass.
set -euo pipefail
cd "$(dirname "$0")/.."

PKG=com.pyreon.PyreonTodoMVC
APK=app/build/outputs/apk/release/app-release.apk
if [ ! -f "$APK" ]; then
  echo "[release-smoke] FAIL: $APK missing — run 'gradle assembleRelease' (WITHOUT -PpyreonReleaseTests) first"
  exit 1
fi

# A debug-signed leftover blocks a release-signed install
# (INSTALL_FAILED_UPDATE_INCOMPATIBLE) — clear it first.
adb uninstall "$PKG" >/dev/null 2>&1 || true
adb install "$APK" >/dev/null
adb logcat -c || true
adb shell am force-stop "$PKG" || true
adb shell am start -W -n "$PKG/com.pyreon.MainActivity" >/dev/null

# Let Compose settle before the first dump (composition + first frame).
sleep 3

# "N remaining" is a REACTIVE Compose Text driven by the todos signal — its
# presence in the accessibility tree proves composition ran, not just that a
# window appeared.
DUMP=/sdcard/pyreon-smoke.xml
# Distinguishes "the harness never produced a tree" (environment) from "the
# app rendered a tree without the marker" (a real regression).
GOT_TREE=0
# The loop deletes $DUMP each pass, so the on-device file is gone by the time
# the diagnostics run — keep the last VALID tree in hand for the report.
LAST_TREE=""

for _ in $(seq 1 20); do
  # A stale file is indistinguishable from a fresh one once `cat` has it, so
  # remove it FIRST — after this, reading anything at all proves the dump in
  # THIS iteration wrote it.
  adb shell rm -f "$DUMP" >/dev/null 2>&1 || true

  # Capture the command's own output: the race announces itself here while
  # still exiting 0, so this is the signal an exit-code check cannot see.
  dump_out=$(adb shell uiautomator dump "$DUMP" 2>&1 || true)
  if printf '%s' "$dump_out" | grep -qiE "already registered|could not get idle state|ERROR|Exception"; then
    sleep 3
    continue
  fi

  xml=$(adb shell cat "$DUMP" 2>/dev/null || true)
  # A real accessibility dump is a `<hierarchy>` document with nodes in it.
  # Anything shorter is a truncated/failed write, not an empty screen.
  case "$xml" in
    *"<hierarchy"*) ;;
    *) sleep 3; continue ;;
  esac
  if [ "${#xml}" -lt 200 ]; then sleep 3; continue; fi

  GOT_TREE=1
  LAST_TREE=$xml
  if printf '%s' "$xml" | grep -q "remaining"; then
    echo "[release-smoke] ok: untouched release APK launched and rendered ('remaining' in the accessibility tree)."
    adb shell am force-stop "$PKG" || true
    exit 0
  fi
  sleep 2
done

# Turn a CI-only failure into a diagnosable artifact (the "message IS the
# artifact" rule): the app's own crash + which activity is actually on top +
# the last tree — so a real regression is told apart from this harness race
# without another CI round trip.
if [ "$GOT_TREE" -eq 1 ]; then
  echo "[release-smoke] FAIL: '$PKG' rendered, but 'remaining' was absent from a VALID accessibility tree after 20 polls."
  echo "[release-smoke] A valid tree was read, so this is an APP-SIDE verdict — suspect a real R8/runtime regression, not the harness."
else
  echo "[release-smoke] FAIL: never obtained a valid accessibility tree in 20 polls — every dump lost the UiAutomation race."
  echo "[release-smoke] No tree was ever read, so this says NOTHING about the app: it is an emulator/harness failure. Re-run."
fi
echo "--- topResumedActivity (is OUR app actually foreground?) ---"
adb shell dumpsys activity activities 2>/dev/null | grep -iE "topResumedActivity|ResumedActivity" | head -2 || true
echo "--- FATAL from our package (a REAL R8/runtime crash would name $PKG) ---"
adb logcat -d 2>/dev/null | grep -iE "FATAL EXCEPTION|$PKG|E AndroidRuntime" | tail -20 || true
echo "--- last VALID accessibility dump (head) ---"
if [ -n "$LAST_TREE" ]; then
  printf '%s' "$LAST_TREE" | head -c 1500
  echo
else
  echo "(none — no poll ever produced a valid <hierarchy> document)"
fi
exit 1
