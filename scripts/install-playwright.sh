#!/usr/bin/env bash
# Linux CI browser setup. Run timeout AS ROOT: Playwright's internal sudo
# otherwise leaves apt alive (and holding dpkg's lock) when timeout fires.
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo 'usage: bash scripts/install-playwright.sh chromium [webkit firefox]' >&2
  exit 1
fi

NODE_BIN=$(command -v node)
PLAYWRIGHT_CLI=$("$NODE_BIN" -p 'require("node:path").join(require.resolve("playwright/package.json"), "..", "cli.js")')

# APT reads both legacy .list files and deb822 .sources files. Leaving even
# one Azure entry active keeps apt-get update waiting on that stalled mirror.
sudo "$NODE_BIN" "$(dirname "${BASH_SOURCE[0]}")/set-ci-apt-mirror.ts"

# Unrelated Microsoft repositories have repeatedly stalled apt-get update.
sudo grep -rlZ packages.microsoft.com /etc/apt/sources.list.d/ 2>/dev/null | sudo xargs -0 -r rm -f || true
sudo tee /etc/apt/apt.conf.d/99pyreon-ci >/dev/null <<'APT'
Acquire::Retries "3";
Acquire::http::Timeout "30";
Acquire::https::Timeout "30";
DPkg::Lock::Timeout "60";
APT

deps_ready=false
deps_attempts=2
deps_timeout=300s
if [ "$*" = chromium ]; then
  deps_attempts=1
  deps_timeout=240s
fi
for ((attempt = 1; attempt <= deps_attempts; attempt++)); do
  # Do not use --foreground: timeout must signal the entire process group.
  # Kill the group at the deadline. TERM + kill-after can still orphan apt
  # when Node exits on TERM first: timeout stops waiting before escalating.
  if sudo timeout --signal=KILL "$deps_timeout" "$NODE_BIN" "$PLAYWRIGHT_CLI" install-deps "$@"; then
    deps_ready=true
    break
  fi
  echo "::warning::Playwright OS dependencies failed on attempt $attempt"
  if [ "$attempt" -lt "$deps_attempts" ] || [ "$*" = chromium ]; then
    # A timeout during configuration can leave dpkg interrupted. Repair it
    # before retrying, under the same root-owned process-group bound.
    sudo timeout --signal=KILL 60s dpkg --configure -a
  fi
done

if [ "$deps_ready" != true ]; then
  # Ubuntu runners ship Chromium's core libraries. Other engines require
  # their OS dependencies; keep that failure hard and visible.
  if [ "$*" = chromium ]; then
    echo "::warning::Using the runner's preinstalled Chromium OS libraries"
  else
    echo "::error::Could not install Playwright OS dependencies for $*" >&2
    exit 1
  fi
fi

# Download as the runner user, into the same store restored by actions/cache.
# Keep CDN outages bounded too, and reconcile even an exact cache hit.
for attempt in 1 2; do
  if timeout --kill-after=15s 120s "$NODE_BIN" "$PLAYWRIGHT_CLI" install "$@"; then
    exit 0
  fi
  echo "::warning::Playwright browser download failed on attempt $attempt"
done
echo "::error::Could not install Playwright browsers for $*" >&2
exit 1
