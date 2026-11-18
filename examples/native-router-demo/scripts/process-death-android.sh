#!/usr/bin/env bash
# process-death-android.sh — kv, secure storage and the database survive a REAL
# Android process death.
#
# Run from examples/native-router-demo/android with one emulator or device
# attached (CI runs it in the router-demo emulator step, after connectedCheck):
#
#   bash ../scripts/process-death-android.sh
#
# An instrumented test lives inside the app's process, so it cannot observe its
# own death. This script is the host side that can:
#
#   1. install the debug app + test APKs and clear the app's data
#   2. run ProcessDeathInstrumentedTest#writePhase (writes all three stores)
#   3. `am force-stop` the package and assert no process is left
#   4. run ProcessDeathInstrumentedTest#verifyPhase in a NEW process, which
#      asserts the values came back off disk and that its pid differs
#
# Each phase's result is read from the instrumentation's own status lines: a
# phase that skipped or ran zero tests fails here, so the proof cannot pass
# vacuously.
set -euo pipefail

PKG="com.pyreon.PyreonRouterDemo"
RUNNER="${PKG}.test/androidx.test.runner.AndroidJUnitRunner"
CLASS="com.pyreon.ProcessDeathInstrumentedTest"
ADB="${ADB:-adb}"
GRADLE="${GRADLE:-gradle}"

"$GRADLE" installDebug installDebugAndroidTest --stacktrace
"$ADB" shell pm clear "$PKG" > /dev/null

run_phase() {
  local phase="$1" out
  out="$("$ADB" shell am instrument -w -r -e pyreonProcessDeath "$phase" -e class "${CLASS}#${phase}Phase" "$RUNNER" 2>&1)"
  echo "$out" | grep -E 'INSTRUMENTATION_STATUS: (stack|stream)=|^OK|FAILURES|Tests run' || true
  # -r prints `INSTRUMENTATION_STATUS_CODE: -3` for an assumption skip, -2 for
  # a failure and 0 for a pass; the summary ends in `OK (1 test)` only when the
  # one test ran and passed.
  if ! echo "$out" | grep -q '^OK (1 test)'; then
    echo "[process-death] ${phase} phase did not pass:"
    echo "$out"
    exit 1
  fi
  if echo "$out" | grep -q 'INSTRUMENTATION_STATUS_CODE: -3'; then
    echo "[process-death] ${phase} phase SKIPPED (assumption), which proves nothing"
    exit 1
  fi
}

run_phase write
"$ADB" shell am force-stop "$PKG"
# force-stop is synchronous, but say so with evidence rather than trust it.
if "$ADB" shell pidof "$PKG" > /dev/null 2>&1; then
  echo "[process-death] ${PKG} is still running after am force-stop"
  exit 1
fi
echo "[process-death] ${PKG} force-stopped; no process left"
run_phase verify
"$ADB" shell am force-stop "$PKG"
echo "[process-death] kv, secure storage and database survived process death"
