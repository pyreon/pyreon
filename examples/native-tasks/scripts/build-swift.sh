#!/usr/bin/env bash
# build-swift.sh — Compile the Tasks showcase canonical source to
# SwiftUI via PMTC. Mirror of `native-router-demo-ios/scripts/build.sh`
# but emits to a shared `generated/swift/` directory (the Gap 5
# showcase deliberately lives in ONE example dir compiling to BOTH
# targets, rather than one dir per target).
#
# Effect: `src/TasksApp.tsx` → `generated/swift/TasksApp.swift`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRC_DIR="${PROJECT_DIR}/src"
OUT_DIR="${PROJECT_DIR}/generated/swift"

# Walk up to find the monorepo root.
REPO_ROOT="${PROJECT_DIR}"
while [[ "${REPO_ROOT}" != "/" ]]; do
    if grep -q '"workspaces"' "${REPO_ROOT}/package.json" 2>/dev/null; then
        break
    fi
    REPO_ROOT="$(dirname "${REPO_ROOT}")"
done

if [[ "${REPO_ROOT}" == "/" ]]; then
    echo "[build-swift.sh] could not locate monorepo root"
    exit 1
fi

echo "[build-swift.sh] source: ${SRC_DIR}"
echo "[build-swift.sh] output: ${OUT_DIR}"
mkdir -p "${OUT_DIR}"

cd "${REPO_ROOT}"
bun packages/native/cli/src/cli.ts build \
    --target=ios \
    --source="${SRC_DIR}" \
    --out="${OUT_DIR}"

echo "[build-swift.sh] ✓ done — see ${OUT_DIR}/"
