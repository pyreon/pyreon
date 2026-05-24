#!/usr/bin/env bash
# build.sh — drive the Pyreon → Kotlin compile loop for the Android
# TodoMVC reference. Designed to be invoked either:
#   - Standalone from this directory (`./scripts/build.sh`)
#   - As a Gradle pre-build task (the project's `app/build.gradle.kts`
#     wires a `preBuild.dependsOn(":pyreonCompile")` task that calls
#     this script)
#
# Effect: turns the SHARED `../native-todomvc-ios/src/*.tsx` source
# into `app/src/main/kotlin/com/pyreon/generated/*.kt` using the
# `@pyreon/native-cli` package from the monorepo workspace.
#
# The source path deliberately points at the iOS example's `src/`.
# Pyreon's Multi-Target Compiler (PMTC) is designed so the SAME
# Pyreon JSX compiles to BOTH SwiftUI AND Compose — sharing the source
# verbatim is the structural proof. If the source needed to diverge
# per-platform, PMTC's design would have failed.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
# Source SHARED with native-todomvc-ios — the single canonical TodoMVC
# Pyreon source. Both example apps compile this same .tsx.
SRC_DIR="$(cd "${PROJECT_DIR}/../native-todomvc-ios/src" && pwd)"
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
