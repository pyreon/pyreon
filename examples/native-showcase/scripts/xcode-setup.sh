#!/usr/bin/env bash
# xcode-setup.sh — one-command flow from clean checkout to working
# Xcode project. Compiles src/TodayApp.tsx, then runs xcodegen in ios/.
#
# Usage:
#   ./scripts/xcode-setup.sh
#   open ios/PyreonShowcase.xcodeproj
#
# Or together (after `xcodegen` is installed via `brew install xcodegen`):
#   ./scripts/xcode-setup.sh && open ios/PyreonShowcase.xcodeproj
#
# Why this exists: xcodegen scans the filesystem at generate-time to
# build the file references in the .pbxproj. The `generated/` directory
# is empty on a fresh checkout (.gitkeep only). Running build-ios.sh first
# populates ios/generated/TodayApp.swift so xcodegen picks it up.
#
# Inside Xcode, the project's preBuildScript re-runs build-ios.sh on
# every build — so source edits in src/TodayApp.tsx are picked up the
# next time you hit ⌘+B. The first-time setup is the only step that
# needs this wrapper.
#
# Mirror of `examples/native-counter-ios/scripts/xcode-setup.sh` — same
# two-step pattern, different target name.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "[xcode-setup] Step 1/2: compile src/TodayApp.tsx → ios/generated/*.swift"
bash "${SCRIPT_DIR}/build-ios.sh"

echo "[xcode-setup] Step 2/2: regenerate ios/PyreonShowcase.xcodeproj from ios/project.yml"
if ! command -v xcodegen >/dev/null 2>&1; then
    echo
    echo "[xcode-setup] xcodegen not installed — install with:"
    echo "[xcode-setup]     brew install xcodegen"
    echo
    exit 1
fi

cd "${PROJECT_DIR}/ios"
xcodegen generate

echo
echo "[xcode-setup] Done. Open the project with:"
echo "[xcode-setup]     open ios/PyreonShowcase.xcodeproj"
