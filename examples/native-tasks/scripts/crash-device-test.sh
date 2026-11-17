#!/usr/bin/env bash
# crash-device-test.sh — the Android half of the crash-capture proof (CRA-3).
#
# The instrumentation runs inside the app process, so the crash that is being
# captured also ends the run that causes it. Two `am instrument` runs against
# ONE install (gradle's connectedCheck would uninstall the app, and the
# persisted report with it):
#   1. arm   — must END IN A CRASH carrying `PyreonCrashProof` (anything else,
#              including a pass, means the exception never escaped uncaught);
#   2. verify — a fresh process must report it: `Had crash: true`, `Proof: yes`.
# See CrashCaptureInstrumentedTest.kt. Run from examples/native-tasks/android
# with an emulator attached.
set -uo pipefail

APP=com.pyreon.PyreonTasks
RUNNER="$APP.test/androidx.test.runner.AndroidJUnitRunner"
CLASS=com.pyreon.CrashCaptureInstrumentedTest

gradle installDebug installDebugAndroidTest --console=plain -q || exit 1

arm=$(adb shell am instrument -w -e pyreonCrashPhase arm -e class "$CLASS#armThenCrash" "$RUNNER" 2>&1)
echo "$arm"
if ! grep -q "PyreonCrashProof" <<<"$arm" || ! grep -Eq "Process crashed|INSTRUMENTATION_RESULT: shortMsg=Process crashed|FAILURES" <<<"$arm"; then
  echo "[crash-device-test] FAIL: the arm phase did not end in the PyreonCrashProof crash"
  exit 1
fi

verify=$(adb shell am instrument -w -e pyreonCrashPhase verify -e class "$CLASS#verifyTheNextLaunchReportsIt" "$RUNNER" 2>&1)
echo "$verify"
if ! grep -q "^OK (1 test)" <<<"$verify"; then
  echo "[crash-device-test] FAIL: the next launch did not report the crash"
  exit 1
fi
echo "[crash-device-test] ok: an uncaught exception was captured and reported on the next launch"
