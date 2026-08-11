#!/usr/bin/env bash
# Artifact-purity smoke: install the UNTOUCHED release APK (built WITHOUT
# -PpyreonReleaseTests, so it carries none of the release-test keeps),
# launch it, and assert the UI actually rendered — read through the
# accessibility tree via `uiautomator dump`, which needs no test APK and no
# instrumentation relationship with the target. This is the EXACT-BYTES
# claim the instrumented release lane cannot make (its tested build keeps
# androidx.tracing + the kotlin stdlib for the runner's sake).
set -euo pipefail
cd "$(dirname "$0")/.."

APK=app/build/outputs/apk/release/app-release.apk
if [ ! -f "$APK" ]; then
  echo "[release-smoke] FAIL: $APK missing — run 'gradle assembleRelease' (WITHOUT -PpyreonReleaseTests) first"
  exit 1
fi

# A debug-signed leftover blocks a release-signed install
# (INSTALL_FAILED_UPDATE_INCOMPATIBLE) — clear it first.
adb uninstall com.pyreon.PyreonTodoMVC >/dev/null 2>&1 || true
adb install "$APK" >/dev/null
adb shell am force-stop com.pyreon.PyreonTodoMVC || true
adb shell am start -W -n com.pyreon.PyreonTodoMVC/com.pyreon.MainActivity >/dev/null

# "N remaining" is a REACTIVE Compose Text driven by the todos signal — its
# presence in the accessibility tree proves composition ran, not just that
# a window appeared.
for _ in $(seq 1 30); do
  adb shell uiautomator dump /sdcard/pyreon-smoke.xml >/dev/null 2>&1 || true
  if adb shell cat /sdcard/pyreon-smoke.xml 2>/dev/null | grep -q "remaining"; then
    echo "[release-smoke] ok: untouched release APK launched and rendered ('remaining' in the accessibility tree)."
    adb shell am force-stop com.pyreon.PyreonTodoMVC || true
    exit 0
  fi
  sleep 1
done

echo "[release-smoke] FAIL: UI never rendered 'remaining'. Last dump head:"
adb shell cat /sdcard/pyreon-smoke.xml 2>/dev/null | head -c 2000 || true
exit 1
