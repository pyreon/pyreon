#!/usr/bin/env bash
# Assert the release lane actually tested what it claims. Two silent-vacuity
# holes, both observed shapes from building the lane:
#   1. R8 ran — mapping.txt exists and is non-empty. A lane where minify was
#      silently dropped would pass connectedCheck against an unminified APK.
#   2. The connected tests ran against the RELEASE build type — if the
#      testBuildType toggle is removed, `-PpyreonReleaseTests` is an UNUSED
#      property (not an error) and connectedCheck silently re-runs debug.
# Same script locally and in CI — one authority.
set -euo pipefail
cd "$(dirname "$0")/.."

MAPPING=app/build/outputs/mapping/release/mapping.txt
if [ ! -s "$MAPPING" ]; then
  echo "[assert-release-lane] FAIL: $MAPPING missing/empty — the tested build was not R8-minified"
  exit 1
fi

RESULTS_DIR=app/build/outputs/androidTest-results/connected/release
if ! ls "$RESULTS_DIR"/*.xml >/dev/null 2>&1; then
  echo "[assert-release-lane] FAIL: no RELEASE connected-test results under $RESULTS_DIR — the suite ran against debug (toggle removed?)"
  exit 1
fi

# Belt-and-braces: the results XML must record at least one executed test —
# a runner that crashed at startup reports "0 tests" while gradle still
# writes the file (observed: the tracing/LazyKt startup crashes).
TESTS=$(grep -ho 'tests="[0-9]*"' "$RESULTS_DIR"/*.xml | grep -o '[0-9]*' | paste -sd+ - | bc)
if [ "${TESTS:-0}" -eq 0 ]; then
  echo "[assert-release-lane] FAIL: release results record 0 executed tests — runner crashed at startup?"
  exit 1
fi

echo "[assert-release-lane] ok: R8 mapping present + ${TESTS} test(s) executed against the RELEASE build."
