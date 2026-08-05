#!/usr/bin/env bash
# Run the push-receipt delivery assertion against a real Simulator.
#
# `xcrun simctl push` injects an actual APNs payload through the system
# notification pipeline — UNUserNotificationCenter delivers it to the app's
# delegate exactly as a real push would arrive, and no APNs credentials are
# involved. That makes the receipt half of Background/push device-provable
# without the certificates the token half needs.
#
# A push is an EVENT, not persistent state (unlike `simctl location`, which
# sticks), so it must land while the app is foreground on the push page. The
# test polls for the rendered title for 60s; this script loops the injection
# every 3s for the duration of the test run — the first payload delivered
# after the page opens satisfies the poll, and repeats are idempotent for the
# title assertion.
#
# Usage: ./scripts/push-device-test.sh [simulator-name]
set -euo pipefail

# NOTE: the env var MUST carry the TEST_RUNNER_ prefix. xcodebuild forwards
# only TEST_RUNNER_-prefixed variables into the XCUITest runner, stripping the
# prefix — a bare PYREON_PUSH_INJECTED=1 silently downgrades the test to its
# render-only half (the geo script shipped broken that way first).

SIM_NAME="${1:-iPhone 17 Pro}"
BUNDLE_ID="com.pyreon.PyreonRouterDemo"

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

xcodebuild build-for-testing \
  -project PyreonRouterDemo.xcodeproj -scheme PyreonRouterDemo \
  -destination "platform=iOS Simulator,id=$UDID" \
  -configuration Debug

PAYLOAD=$(mktemp -t pyreon-push).json
cat > "$PAYLOAD" <<'JSON'
{
  "aps": {
    "alert": { "title": "Hello from Pyreon", "body": "device-proven receipt" }
  },
  "source": "simctl"
}
JSON

# Inject on a loop for the whole test run. Pushes delivered before the app is
# on the push page are dropped or banner-only — harmless; the poll catches the
# first one delivered after the delegate installs.
(
  while true; do
    xcrun simctl push "$UDID" "$BUNDLE_ID" "$PAYLOAD" >/dev/null 2>&1 || true
    sleep 3
  done
) &
INJECTOR=$!
trap 'kill "$INJECTOR" 2>/dev/null || true; rm -f "$PAYLOAD"' EXIT

TEST_RUNNER_PYREON_PUSH_INJECTED=1 xcodebuild test-without-building \
  -project PyreonRouterDemo.xcodeproj -scheme PyreonRouterDemo \
  -destination "platform=iOS Simulator,id=$UDID" \
  -configuration Debug \
  -only-testing:PyreonRouterDemoUITests/PyreonRouterDemoUITests/test_pushReceiptRendersInjectedPayload
