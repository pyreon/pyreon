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
# crash). Fix: settle before the first dump, space polls generously, and back
# OFF an extra beat whenever a dump fails so the service fully deregisters.
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
for _ in $(seq 1 20); do
  # A failed/empty dump is the `already registered` race, not a verdict —
  # back off an extra beat so the UiAutomation service deregisters, then retry.
  if ! adb shell uiautomator dump "$DUMP" >/dev/null 2>&1; then
    sleep 2
    continue
  fi
  xml=$(adb shell cat "$DUMP" 2>/dev/null || true)
  if [ -z "$xml" ]; then sleep 2; continue; fi
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
echo "[release-smoke] FAIL: '$PKG' never rendered 'remaining' after 20 polls."
echo "--- topResumedActivity (is OUR app actually foreground?) ---"
adb shell dumpsys activity activities 2>/dev/null | grep -iE "topResumedActivity|ResumedActivity" | head -2 || true
echo "--- FATAL from our package (a REAL R8/runtime crash would name $PKG) ---"
adb logcat -d 2>/dev/null | grep -iE "FATAL EXCEPTION|$PKG|E AndroidRuntime" | tail -20 || true
echo "--- last accessibility dump (head) ---"
adb shell cat "$DUMP" 2>/dev/null | head -c 1500 || true
exit 1
