#!/usr/bin/env bash
# build-kotlin.sh — Compile the Analytics showcase to Compose/Kotlin via
# PMTC. Sibling of `build-swift.sh`.
#
# Effect: `src/AnalyticsApp.tsx` → `generated/kotlin/AnalyticsApp.kt`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRC_DIR="${PROJECT_DIR}/src"
OUT_DIR="${PROJECT_DIR}/generated/kotlin"

REPO_ROOT="${PROJECT_DIR}"
while [[ "${REPO_ROOT}" != "/" ]]; do
    if grep -q '"workspaces"' "${REPO_ROOT}/package.json" 2>/dev/null; then
        break
    fi
    REPO_ROOT="$(dirname "${REPO_ROOT}")"
done

if [[ "${REPO_ROOT}" == "/" ]]; then
    echo "[build-kotlin.sh] could not locate monorepo root"
    exit 1
fi

echo "[build-kotlin.sh] source: ${SRC_DIR}"
echo "[build-kotlin.sh] output: ${OUT_DIR}"
mkdir -p "${OUT_DIR}"

cd "${REPO_ROOT}"
bun packages/native/cli/src/cli.ts build \
    --target=android \
    --source="${SRC_DIR}" \
    --out="${OUT_DIR}"

echo "[build-kotlin.sh] ✓ done — see ${OUT_DIR}/"
