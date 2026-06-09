#!/usr/bin/env bash
# build.sh — drive the Pyreon → Kotlin compile loop for the Android
# Counter reference. Mirror of `native-todomvc-android/scripts/build.sh`.
#
# Effect: turns the SHARED `../native-counter-ios/src/*.tsx` source
# into `app/src/main/kotlin/com/pyreon/generated/*.kt` via @pyreon/native-cli.
#
# The source path deliberately points at the iOS counter's `src/`.
# PMTC's contract: the SAME .tsx compiles to BOTH SwiftUI AND Compose.
# If the source needed to diverge per-platform, PMTC's design would
# have failed.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRC_DIR="$(cd "${PROJECT_DIR}/../native-counter-ios/src" && pwd)"
OUT_DIR="${PROJECT_DIR}/app/src/main/kotlin/com/pyreon/generated"

REPO_ROOT="${PROJECT_DIR}"
while [[ "${REPO_ROOT}" != "/" ]]; do
    if grep -q '"workspaces"' "${REPO_ROOT}/package.json" 2>/dev/null; then
        break
    fi
    REPO_ROOT="$(dirname "${REPO_ROOT}")"
done

if [[ "${REPO_ROOT}" == "/" ]]; then
    echo "[build.sh] could not locate monorepo root"
    exit 1
fi

echo "[build.sh] project dir: ${PROJECT_DIR}"
echo "[build.sh] repo root:   ${REPO_ROOT}"
echo "[build.sh] source dir:  ${SRC_DIR}"
echo "[build.sh] output dir:  ${OUT_DIR}"

mkdir -p "${OUT_DIR}"

cd "${REPO_ROOT}"
bun packages/native/cli/src/cli.ts build \
    --target=android \
    --source="${SRC_DIR}" \
    --out="${OUT_DIR}" \
    --kotlin-package=com.pyreon.generated
