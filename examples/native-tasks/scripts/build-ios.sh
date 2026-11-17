#!/usr/bin/env bash
# build-ios.sh — compile src/TasksApp.tsx (web entries skipped) for the ios host in ios/.
# build.sh — drive the Pyreon → Swift compile loop for the iOS tasks
# showcase host. Mirror of `native-router-demo-ios/scripts/build.sh`
# (only the source path differs — points at `examples/native-tasks/src/`).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
# Source SHARED with `examples/native-tasks/` (#1449's canonical
# TasksApp source) and `examples/native-tasks/` (#1456's web host).
SRC_DIR="${PROJECT_DIR}/src"
OUT_DIR="${PROJECT_DIR}/ios/generated"

REPO_ROOT="${PROJECT_DIR}"
while [[ "${REPO_ROOT}" != "/" ]]; do
    if grep -q '"workspaces"' "${REPO_ROOT}/package.json" 2>/dev/null; then
        break
    fi
    REPO_ROOT="$(dirname "${REPO_ROOT}")"
done

if [[ "${REPO_ROOT}" == "/" ]]; then
    echo "[build-ios.sh] could not locate monorepo root"
    exit 1
fi

echo "[build-ios.sh] project dir: ${PROJECT_DIR}"
echo "[build-ios.sh] repo root:   ${REPO_ROOT}"
echo "[build-ios.sh] source dir:  ${SRC_DIR}"
echo "[build-ios.sh] output dir:  ${OUT_DIR}"

mkdir -p "${OUT_DIR}"

cd "${REPO_ROOT}"
bun packages/native/cli/src/cli.ts build \
    --target=ios \
    --source="${SRC_DIR}" \
    --out="${OUT_DIR}" \
    --fonts="${SRC_DIR}/../assets"

# Asset pipeline (asset-pipeline arc): materialize the shared assets/
# into Assets.xcassets under ios/ (an included XcodeGen group, so the
# catalog lands in the app bundle with zero project.yml changes).
ASSETS_DIR="${SRC_DIR}/../assets"
if [[ -d "${ASSETS_DIR}" ]]; then
    bun packages/native/cli/src/cli.ts assets \
        --target=ios \
        --source="${ASSETS_DIR}" \
        --out="${PROJECT_DIR}/ios/Sources"
fi
