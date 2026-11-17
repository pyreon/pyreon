#!/usr/bin/env bash
# aab-smoke.sh — the Android App Bundle path, built and installed the way Play
# delivers it.
#
# Google Play accepts only an App Bundle (.aab), and no lane built one: the
# release lane installs `app-release.apk` straight from Gradle. This script
#
#   1. builds the signed, R8-minified bundle (`gradle bundleRelease`) and
#      checks it carries R8's mapping (the minify ran on the bundle too),
#   2. turns it into device APKs with bundletool, signed with the same release
#      key, in `--local-testing` mode (Play's split delivery, emulated on the
#      device without a store),
#   3. installs them with `bundletool install-apks` and checks the device got
#      SPLITS (base + config APKs) rather than one universal APK, so what runs
#      is the bundle's own output,
#   4. reruns release-smoke.sh's launch-and-render check against that install.
#
# Needs ensure-release-keystore.sh to have run (CI does it in the release lane)
# and one device attached. bundletool comes from $BUNDLETOOL_JAR, a `bundletool`
# on PATH, or the copy the Android Gradle Plugin already put in the Gradle cache.
#
#   bash ../scripts/aab-smoke.sh   # from examples/native-todomvc/android
set -euo pipefail
cd "$(dirname "$0")/../android"

PKG=com.pyreon.PyreonTodoMVC
AAB=app/build/outputs/bundle/release/app-release.aab
APKS=app/build/outputs/bundle/release/app-release.apks
GRADLE="${GRADLE:-gradle}"

if [ ! -f keystore.properties ]; then
  echo "[aab-smoke] FAIL: keystore.properties missing — run ../scripts/ensure-release-keystore.sh first"
  exit 1
fi

"$GRADLE" bundleRelease --stacktrace
if [ ! -f "$AAB" ]; then
  echo "[aab-smoke] FAIL: bundleRelease produced no $AAB"
  exit 1
fi
# Listed into a variable first: `unzip -l | grep -q` under pipefail fails when
# grep exits early and unzip takes SIGPIPE, which would read as "no mapping".
listing=$(unzip -l "$AAB")
if ! grep -q 'BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map' <<< "$listing"; then
  echo "[aab-smoke] FAIL: $AAB carries no R8 mapping — the bundle was not minified"
  exit 1
fi
echo "[aab-smoke] ok: built $AAB (R8 mapping inside)"

if [ -n "${BUNDLETOOL_JAR:-}" ]; then
  bundletool() { java -jar "$BUNDLETOOL_JAR" "$@"; }
elif ! command -v bundletool > /dev/null 2>&1; then
  jar=$(find "${GRADLE_USER_HOME:-$HOME/.gradle}/caches/modules-2" -name 'bundletool-*.jar' 2>/dev/null | sort -V | tail -1)
  if [ -z "$jar" ]; then
    echo "[aab-smoke] FAIL: no bundletool (set BUNDLETOOL_JAR, install it, or build once so AGP caches it)"
    exit 1
  fi
  echo "[aab-smoke] bundletool: $jar"
  bundletool() { java -jar "$jar" "$@"; }
fi

prop() { grep -E "^$1=" keystore.properties | head -1 | cut -d= -f2-; }
bundletool build-apks \
  --bundle="$AAB" \
  --output="$APKS" \
  --overwrite \
  --local-testing \
  --ks="$(prop storeFile)" \
  --ks-pass="pass:$(prop storePassword)" \
  --ks-key-alias="$(prop keyAlias)" \
  --key-pass="pass:$(prop keyPassword)"

# A release key cannot update a debug-signed install (INSTALL_FAILED_UPDATE_INCOMPATIBLE).
adb uninstall "$PKG" > /dev/null 2>&1 || true
bundletool install-apks --apks="$APKS"

paths=$(adb shell pm path "$PKG" | tr -d '\r')
echo "$paths"
if ! grep -q 'base.apk' <<< "$paths"; then
  echo "[aab-smoke] FAIL: $PKG is not installed from the bundle's base APK"
  exit 1
fi
count=$(grep -c '^package:' <<< "$paths" || true)
if [ "$count" -lt 2 ]; then
  echo "[aab-smoke] FAIL: one APK installed, not base + config splits — this is not the bundle's split delivery"
  exit 1
fi
echo "[aab-smoke] ok: installed from the bundle as $count APKs (base + config splits)"

PYREON_SMOKE_INSTALLED=1 bash ../scripts/release-smoke.sh
