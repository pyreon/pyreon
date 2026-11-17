#!/usr/bin/env bash
# Assert the iOS release lane tested what it claims: the UI suite ran against
# the RELEASE build of the app. The twin of assert-release-lane.sh (Android).
#
#   bash ../scripts/assert-ios-release-lane.sh <derived-data> <results-prefix>
#
# <results-prefix> is the `--results` value given to scripts/native-ios-uitest.ts,
# which writes <prefix>.xcresult and one <prefix>-attemptN.xcresult per retry.
#
# Three silent-vacuity holes, each a way the lane could pass on a Debug app:
#   1. No Release product. `-configuration Release` dropped from the command
#      builds Debug-iphonesimulator and the lane re-runs the debug suite.
#   2. A Debug-shaped Release configuration. Swift's optimizer is what makes
#      Release a different program; if the Release configuration stops
#      setting `-O` (an edit to project.yml), the lane tests an unoptimized
#      build under a Release label. Read from the generated project, in the
#      ios/ directory this runs from.
#   3. The test run did not install the Release app. `build-for-testing`
#      writes the .xctestrun the run reads; it must point at
#      Release-iphonesimulator, and the result bundles must record executed,
#      passing tests (a runner that never attached records none). Pass/fail is
#      the uitest helper's exit code; this only refuses a run with no test.
# Same script locally and in CI — one authority.
set -euo pipefail

DD="${1:?usage: assert-ios-release-lane.sh <derived-data> <results-prefix>}"
PREFIX="${2:?usage: assert-ios-release-lane.sh <derived-data> <results-prefix>}"
APP="$DD/Build/Products/Release-iphonesimulator/PyreonTodoMVC.app"

if [ ! -x "$APP/PyreonTodoMVC" ]; then
  echo "[assert-ios-release-lane] FAIL: no Release executable at $APP — the suite did not build the Release configuration"
  exit 1
fi

OPT=$(xcodebuild -showBuildSettings -project PyreonTodoMVC.xcodeproj -target PyreonTodoMVC -configuration Release 2>/dev/null \
  | sed -n 's/^[[:space:]]*SWIFT_OPTIMIZATION_LEVEL = //p' | head -1)
case "$OPT" in
  -O | -Osize) ;;
  *)
    echo "[assert-ios-release-lane] FAIL: the Release configuration compiles Swift with '${OPT:-<unset>}', not -O — an unoptimized build under a Release label"
    exit 1
    ;;
esac

XCTESTRUN=$(ls -t "$DD"/Build/Products/PyreonTodoMVC_*.xctestrun 2>/dev/null | head -1 || true)
if [ -z "$XCTESTRUN" ]; then
  echo "[assert-ios-release-lane] FAIL: no PyreonTodoMVC .xctestrun under $DD/Build/Products — build-for-testing never ran"
  exit 1
fi
if ! grep -q 'Release-iphonesimulator/PyreonTodoMVC.app' "$XCTESTRUN"; then
  echo "[assert-ios-release-lane] FAIL: $XCTESTRUN does not target Release-iphonesimulator/PyreonTodoMVC.app — the tests ran against another build"
  exit 1
fi

PASSED=0
for bundle in "$PREFIX".xcresult "$PREFIX"-attempt*.xcresult; do
  [ -d "$bundle" ] || continue
  n=$(xcrun xcresulttool get test-results summary --path "$bundle" \
    | sed -n 's/.*"passedTests"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' | head -1)
  PASSED=$((PASSED + ${n:-0}))
done
if [ "$PASSED" -eq 0 ]; then
  echo "[assert-ios-release-lane] FAIL: no passed test in $PREFIX*.xcresult — the runner never attached, or no bundle was written"
  exit 1
fi

echo "[assert-ios-release-lane] ok: ${PASSED} UI test(s) passed against the Release build ($APP, Swift $OPT)."
