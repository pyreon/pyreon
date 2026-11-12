#!/usr/bin/env bash
# build.sh — compile the shared showcase source (../native-showcase/src) to
# Kotlin / Jetpack Compose. Run standalone (`./scripts/build.sh`) or from the
# Gradle `pyreonCompile` task that `preBuild` depends on.
#
# The source is the SAME directory the web and iOS hosts build: one file,
# three targets.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRC_DIR="$(cd "${PROJECT_DIR}/../native-showcase/src" && pwd)"
# Output lands inside the Gradle source tree so Compose picks it up
# at compile time without extra source-set wiring.
OUT_DIR="${PROJECT_DIR}/app/src/main/kotlin/com/pyreon/generated"

# Walk up to find the monorepo root (carries package.json with workspaces).
REPO_ROOT="${PROJECT_DIR}"
while [[ "${REPO_ROOT}" != "/" ]]; do
    if grep -q '"workspaces"' "${REPO_ROOT}/package.json" 2>/dev/null; then
        break
    fi
    REPO_ROOT="$(dirname "${REPO_ROOT}")"
done

if [[ "${REPO_ROOT}" == "/" ]]; then
    echo "[build.sh] could not locate monorepo root (no package.json with workspaces found above ${PROJECT_DIR})"
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
