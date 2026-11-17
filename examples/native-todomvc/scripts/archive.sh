#!/usr/bin/env bash
# iOS ARCHIVE lane — the release-packaging half the repo never had: every
# other xcodebuild invocation in this repo is Simulator-SDK build/test.
# `xcodebuild archive` against 'generic/platform=iOS' compiles for the
# DEVICE SDK (real arm64-ios, not the simulator slice) and produces the
# .xcarchive an App Store/TestFlight export starts from — so this lane
# proves (a) the emitted app + both Pyreon Swift runtimes compile for the
# device SDK, and (b) the archive packaging path works.
#
# Signing is deliberately DISABLED: exporting a signed .ipa needs an Apple
# Developer account (user-side credential). CODE_SIGNING_ALLOWED=NO is
# legal here under the repo's signing policy — the archived app is never
# LAUNCHED (the policy forbids the flag only on `xcodebuild test`, which
# runs the app; see scripts/check-ios-signing-policy.ts). When an account
# exists, `xcodebuild -exportArchive -exportOptionsPlist` picks up from
# the artifact this lane already builds.
set -euo pipefail
cd "$(dirname "$0")/../ios"

command -v xcodegen >/dev/null || { echo "[archive] xcodegen not installed"; exit 1; }
# The emit MUST run before xcodegen: project.yml marks generated/ as
# optional:true, so a missing TodoApp.swift builds the target WITHOUT the
# app and dies at ContentView with 'cannot find TodoApp in scope' —
# observed on this script's first run.
bash ../scripts/build-ios.sh
xcodegen generate

ARCHIVE=build/PyreonTodoMVC.xcarchive
rm -rf "$ARCHIVE"
xcodebuild archive \
  -project PyreonTodoMVC.xcodeproj \
  -scheme PyreonTodoMVC \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  DEBUG_INFORMATION_FORMAT=dwarf-with-dsym \
  CODE_SIGNING_ALLOWED=NO \
  | tail -5

# The archive must CONTAIN the app with a real arm64-ios binary — an
# empty archive directory is a silent-vacuity pass.
APP="$ARCHIVE/Products/Applications/PyreonTodoMVC.app"
BIN="$APP/PyreonTodoMVC"
test -d "$APP" || { echo "[archive] FAIL: no .app inside the archive"; exit 1; }
test -f "$BIN" || { echo "[archive] FAIL: no executable inside the .app"; exit 1; }
if ! lipo -info "$BIN" | grep -q arm64; then
  echo "[archive] FAIL: binary is not arm64 — this was not a device-SDK build"
  exit 1
fi
echo "[archive] ok: device-SDK .xcarchive built; $(lipo -info "$BIN")"

# Crash-symbol retention. The dSYM lives inside the archive, which the next
# run deletes (rm -rf above) — so the one file that makes this build's crash
# stacks readable would be gone by the next archive. Keep it, per build, at
# symbols/ios/<CFBundleShortVersionString>-<CFBundleVersion>/, where
# `pyreon-native symbolicate` looks it up by the UUID a crash report carries.
DSYM="$ARCHIVE/dSYMs/PyreonTodoMVC.app.dSYM"
test -d "$DSYM" || { echo "[archive] FAIL: no dSYM in the archive"; exit 1; }
VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Info.plist")"
BUILD="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP/Info.plist")"
DEST="symbols/ios/$VERSION-$BUILD"
rm -rf "$DEST" && mkdir -p "$DEST"
cp -R "$DSYM" "$DEST/"
# The retained dSYM must be THIS binary's (same LC_UUID) — a dSYM from any
# other build symbolicates to plausible, wrong frames.
BIN_UUID="$(dwarfdump --uuid "$BIN" | awk '{print $2}')"
DSYM_UUID="$(dwarfdump --uuid "$DEST/PyreonTodoMVC.app.dSYM" | awk '{print $2}')"
if [ "$BIN_UUID" != "$DSYM_UUID" ]; then
  echo "[archive] FAIL: retained dSYM UUID $DSYM_UUID != binary $BIN_UUID"
  exit 1
fi
echo "[archive] ok: dSYM $DSYM_UUID retained in $DEST"
