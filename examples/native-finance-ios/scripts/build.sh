#!/usr/bin/env bash
# build.sh — drive the Pyreon → Swift compile loop for the iOS Finance
# reference. Mirror of `native-counter-ios/scripts/build.sh`, with one
# difference: the SOURCE lives in a sibling package.
#
# `examples/native-finance/src/FinanceApp.tsx` is the SHARED app source —
# a platform-agnostic package carrying no iOS or Android scaffolding. This
# directory is the iOS HOST for it (an Android host would point at the same
# file, exactly as `native-counter-android` points at `native-counter-ios/src`).
# If the source had to diverge per platform, PMTC's whole premise would have
# failed.
#
# Invocable either standalone (`./scripts/build.sh`) or as an Xcode
# "Run Script" build phase (Xcode passes `$SRCROOT`; the script tolerates
# missing envs and resolves paths relative to itself).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRC_DIR="$(cd "${PROJECT_DIR}/../native-finance/src" && pwd)"
OUT_DIR="${PROJECT_DIR}/generated"

# Walk up to the monorepo root (the package.json declaring "workspaces").
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

# Invoke pyreon-native via bun so the workspace-local version is used
# (never a globally installed one).
cd "${REPO_ROOT}"
bun packages/native/cli/src/cli.ts build \
    --target=ios \
    --source="${SRC_DIR}" \
    --out="${OUT_DIR}"
