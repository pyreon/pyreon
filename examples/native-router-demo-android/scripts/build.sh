#!/usr/bin/env bash
# build.sh — drive the Pyreon → Kotlin compile loop for the Android
# Router Demo. Mirror of `native-counter-android/scripts/build.sh`
# (the only difference is the source path → router-demo iOS instead
# of counter iOS).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRC_DIR="$(cd "${PROJECT_DIR}/../native-router-demo-ios/src" && pwd)"
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
