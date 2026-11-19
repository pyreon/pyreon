#!/usr/bin/env bash
# biometric-device-test.sh — useBiometrics through a real BiometricPrompt on an
# Android emulator (#4569).
#
# Run from examples/native-counter/android with ONE emulator attached:
#
#   bash ../scripts/biometric-device-test.sh
#
# 1. installs the debug app + test APKs
# 2. sets a PIN and enrols fingerprint 1 through Settings, touching the
#    emulator's virtual sensor (`adb emu finger touch`) until it is added
# 3. runs BiometricPromptInstrumentedTest#enrolledFingerprintUnlocks while the
#    host touches finger 1, then #unenrolledFingerprintThenCancelDenies while it
#    touches finger 2 (not enrolled)
# 4. ALWAYS removes the fingerprint and the PIN again, so the emulator is back
#    to the unenrolled state the rest of the suite expects
#
# Each phase must report `OK (1 test)`; a skipped or empty run fails.
set -euo pipefail

PKG="com.pyreon.PyreonCounter"
RUNNER="${PKG}.test/androidx.test.runner.AndroidJUnitRunner"
CLASS="com.pyreon.BiometricPromptInstrumentedTest"
PIN=1111
ADB="${ADB:-adb}"
GRADLE="${GRADLE:-gradle}"
SERIAL="${ANDROID_SERIAL:-$("$ADB" devices | awk 'NR > 1 && $2 == "device" { print $1; exit }')}"

dump() { "$ADB" shell 'uiautomator dump /sdcard/pyreon-bio.xml > /dev/null 2>&1; cat /sdcard/pyreon-bio.xml'; }

# Tap the first node whose text matches the (case-insensitive) regex; 1 if none.
tap_text() {
  local node b
  local screen
  screen=$(dump)
  node=$(grep -oiE "<node [^>]*text=\"($1)\"[^>]*>" <<< "$screen" | head -1 || true)
  [ -z "$node" ] && return 1
  b=$(grep -oE 'bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' <<< "$node" | grep -oE '[0-9]+' | tr '\n' ' ')
  set -- $b
  "$ADB" shell input tap $(( ($1 + $3) / 2 )) $(( ($2 + $4) / 2 ))
}

# Poll until a node's text matches the regex, for up to $2 seconds.
wait_text() {
  local screen
  for _ in $(seq 1 "$2"); do
    screen=$(dump)
    if grep -qiE "text=\"($1)\"" <<< "$screen"; then return 0; fi
    sleep 1
  done
  return 1
}

touch_finger() { "$ADB" -s "$SERIAL" emu finger touch "$1" > /dev/null; }

cleanup() {
  # Removing the PIN also removes every enrolled fingerprint.
  "$ADB" shell locksettings clear --old "$PIN" > /dev/null 2>&1 || true
  "$ADB" shell am force-stop com.android.settings > /dev/null 2>&1 || true
  "$ADB" shell am force-stop "$PKG" > /dev/null 2>&1 || true
}
trap cleanup EXIT

"$GRADLE" installDebug installDebugAndroidTest --stacktrace

# ── Enrol fingerprint 1 ──
"$ADB" shell locksettings set-pin "$PIN" > /dev/null
# Settings sometimes does not come up on the first launch on a loaded CI
# emulator (the activity start is swallowed, or an earlier Settings task is
# still in front), and the script then waited 30 s on a screen that was never
# going to ask. Wake the device, start from a stopped Settings, and try the
# launch up to three times; on failure say what the screen showed instead.
pin_prompt='Re-enter your PIN|Enter your device PIN.*|Confirm your PIN'
asked=0
for attempt in 1 2 3; do
  "$ADB" shell input keyevent KEYCODE_WAKEUP > /dev/null 2>&1 || true
  "$ADB" shell wm dismiss-keyguard > /dev/null 2>&1 || true
  "$ADB" shell am force-stop com.android.settings > /dev/null 2>&1 || true
  "$ADB" shell am start -W -a android.settings.FINGERPRINT_ENROLL > /dev/null
  if wait_text "$pin_prompt" 30; then asked=1; break; fi
  echo "[biometric] attempt ${attempt}: Settings did not ask for the PIN. Screen:"
  screen=$(dump)
  grep -oE 'text="[^"]+"' <<< "$screen" | head -10 || true
done
if [ "$asked" -ne 1 ]; then
  echo "[biometric] FAIL: Settings never asked for the PIN (a harness failure, not an app verdict)"; exit 1
fi
"$ADB" shell input text "$PIN"
"$ADB" shell input keyevent 66
# The intro screens: tap through until the sensor screen asks for a touch.
for _ in $(seq 1 10); do
  screen=$(dump)
  if grep -qi 'Touch the sensor' <<< "$screen"; then break; fi
  tap_text 'more|i agree|agree|start|next' || sleep 2
  sleep 1
done
enrolled=0
for _ in $(seq 1 20); do
  touch_finger 1
  sleep 1.5
  # Captured first: `dump | grep -q` under pipefail fails when grep exits early.
  screen=$(dump)
  if grep -qi 'Fingerprint added' <<< "$screen"; then enrolled=1; break; fi
done
if [ "$enrolled" -ne 1 ]; then
  echo "[biometric] FAIL: could not enrol a fingerprint (a harness failure, not an app verdict). Last screen:"
  screen=$(dump)
  grep -oE 'text="[^"]+"' <<< "$screen" | head -10
  exit 1
fi
tap_text 'done' || true
"$ADB" shell input keyevent KEYCODE_HOME
echo "[biometric] fingerprint 1 enrolled"

# ── Phases ──
run_phase() {
  local phase="$1" method="$2" finger="$3" out pid
  ( sleep 4; for _ in $(seq 1 12); do touch_finger "$finger"; sleep 2; done ) &
  pid=$!
  out="$("$ADB" shell am instrument -w -r -e pyreonBiometric "$phase" -e class "${CLASS}#${method}" "$RUNNER" 2>&1)" || true
  kill "$pid" 2> /dev/null || true
  wait "$pid" 2> /dev/null || true
  if ! grep -q '^OK (1 test)' <<< "$out" || grep -q 'INSTRUMENTATION_STATUS_CODE: -3' <<< "$out"; then
    echo "[biometric] ${phase} phase did not pass:"
    echo "$out" | grep -E 'stack=|Error|Exception|FAILURES|Tests run|OK' | head -20
    exit 1
  fi
  echo "[biometric] ${phase}: ok"
}
run_phase accept enrolledFingerprintUnlocks 1
run_phase reject unenrolledFingerprintThenCancelDenies 2
echo "[biometric] BiometricPrompt accepted the enrolled finger and denied the other"
