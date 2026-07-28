#!/usr/bin/env bash
# Run the geolocation coordinate assertion against a real Simulator.
#
# The assertion is skipped unless this script (or an equivalent) has prepared
# the device, because `simctl privacy grant location <bundle>` only sticks for
# an ALREADY-INSTALLED app — and xcodebuild installs during the test run. On a
# clean CI runner the grant is a no-op, iOS prompts, and the watch never
# delivers a fix. Installing FIRST, then granting, then testing is what makes it
# deterministic; CI's single-xcodebuild-invocation shape cannot express that
# ordering without splitting build-for-testing / test-without-building.
#
# Usage: ./scripts/geo-device-test.sh [simulator-name]
set -euo pipefail

SIM_NAME="${1:-iPhone 17 Pro}"
BUNDLE_ID="com.pyreon.PyreonCounter"
LAT="37.3349"
LON="-122.0090"

cd "$(dirname "${BASH_SOURCE[0]}")/.."

UDID=$(xcrun simctl list devices available | grep -F "${SIM_NAME} (" | head -1 | grep -oE '[0-9A-Fa-f-]{36}')
if [ -z "$UDID" ]; then
  echo "error: no available simulator named '${SIM_NAME}'" >&2
  xcrun simctl list devices available >&2
  exit 1
fi
echo "simulator: ${SIM_NAME} ($UDID)"

xcrun simctl bootstatus "$UDID" -b
bash scripts/build.sh
xcodegen generate

# Build and INSTALL first, so the privacy grant has an app to apply to.
xcodebuild build-for-testing \
  -project PyreonCounter.xcodeproj -scheme PyreonCounter \
  -destination "platform=iOS Simulator,id=$UDID" \
  -configuration Debug CODE_SIGNING_ALLOWED=NO

APP=$(find ~/Library/Developer/Xcode/DerivedData -name 'PyreonCounter.app' -path '*Debug-iphonesimulator*' -print -quit 2>/dev/null || true)
if [ -n "$APP" ]; then
  xcrun simctl install "$UDID" "$APP" || true
fi

xcrun simctl privacy "$UDID" grant location "$BUNDLE_ID" || \
  echo "note: privacy grant unavailable; the interruption monitor should cover the prompt"
xcrun simctl location "$UDID" set "${LAT},${LON}"
echo "injected ${LAT},${LON}"

PYREON_GEO_FIX_INJECTED=1 xcodebuild test-without-building \
  -project PyreonCounter.xcodeproj -scheme PyreonCounter \
  -destination "platform=iOS Simulator,id=$UDID" \
  -configuration Debug CODE_SIGNING_ALLOWED=NO
