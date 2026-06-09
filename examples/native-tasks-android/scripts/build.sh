#!/usr/bin/env bash
# build.sh — drive the Pyreon → Kotlin compile loop for the Android
# tasks showcase host. Mirror of `native-router-demo-android/scripts/build.sh`
# (only the source path differs — points at `../native-tasks/src/`).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
# Source SHARED with `examples/native-tasks/` (#1449's canonical
# TasksApp source), `examples/native-tasks-web/` (#1456's web host),
# and `examples/native-tasks-ios/` (#1457's iOS host).
SRC_DIR="$(cd "${PROJECT_DIR}/../native-tasks/src" && pwd)"
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
