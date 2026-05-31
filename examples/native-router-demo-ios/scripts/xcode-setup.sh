#!/usr/bin/env bash
# xcode-setup.sh — one-command flow from clean checkout to working
# Xcode project. Compiles src/*.tsx, then runs xcodegen.
#
# Usage:
#   ./scripts/xcode-setup.sh
#   open PyreonRouterDemo.xcodeproj
#
# Or together (after `xcodegen` is installed via `brew install xcodegen`):
#   ./scripts/xcode-setup.sh && open PyreonRouterDemo.xcodeproj
#
# Why this exists: xcodegen scans the filesystem at generate-time to
# build the file references in the .pbxproj. The `generated/`
# directory is empty on a fresh checkout (.gitkeep only). Running
# build.sh first populates `generated/RouterApp.swift` so xcodegen
# picks it up.
#
# Inside Xcode, the project's preBuildScript re-runs build.sh on
# every build — so source edits in src/RouterApp.tsx are picked up
# the next time you hit ⌘+B. The first-time setup is the only step
# that needs this wrapper.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "[xcode-setup] Step 1/2: compile src/*.tsx → generated/*.swift"
bash "${SCRIPT_DIR}/build.sh"

echo "[xcode-setup] Step 2/2: regenerate PyreonRouterDemo.xcodeproj from project.yml"
if ! command -v xcodegen >/dev/null 2>&1; then
    echo
    echo "[xcode-setup] xcodegen not installed — install with:"
    echo "[xcode-setup]     brew install xcodegen"
    echo
    exit 1
fi

cd "${PROJECT_DIR}"
xcodegen generate

echo
echo "[xcode-setup] Done. Open the project with:"
echo "[xcode-setup]     open PyreonRouterDemo.xcodeproj"
