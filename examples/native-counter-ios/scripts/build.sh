#!/usr/bin/env bash
# build.sh — drive the Pyreon → Swift compile loop for the iOS counter
# sample. Designed to be invoked either:
#   - Standalone from this directory (`./scripts/build.sh`)
#   - As an Xcode "Run Script" build phase (Xcode passes envs like
#     `$SRCROOT`; the script tolerates missing envs and falls back to
#     paths relative to itself)
#
# Effect: turns `src/*.tsx` into `generated/*.swift` using the
# `@pyreon/native-cli` package from the monorepo workspace.

set -euo pipefail

# Resolve THIS script's directory regardless of how it was invoked.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRC_DIR="${PROJECT_DIR}/src"
OUT_DIR="${PROJECT_DIR}/generated"

# Walk up to find the monorepo root (the directory carrying a
# package.json with `"workspaces"`). This is the directory `bun` runs
# its workspace commands against.
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

# Invoke pyreon-native via bun, ensuring we use the workspace's local
# version (not whatever might be globally installed). `bun run` from
# the repo root resolves the binary via the workspace.
cd "${REPO_ROOT}"
bun packages/native/cli/src/cli.ts build \
    --target=ios \
    --source="${SRC_DIR}" \
    --out="${OUT_DIR}"
