#!/usr/bin/env bash
# Generate a SELF-SIGNED release keystore + keystore.properties if absent.
#
# Credential-free by design: Play App Signing re-signs store uploads, so
# a locally-generated key proves the full sign→install→run path without
# any store account. A real upload key drops into the same
# keystore.properties shape — nothing else changes.
#
# Both outputs are gitignored. Idempotent: an existing
# keystore.properties short-circuits, so an app-provided real key is
# never overwritten.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f keystore.properties ]; then
  echo "[pyreon] keystore.properties present — keeping it."
  exit 0
fi

# A random password PER CHECKOUT, kept only in the gitignored, owner-only
# keystore.properties. A fixed password shared by every copy would make any
# leaked release.keystore usable by anyone. It reaches keytool through the
# environment, not argv, so it never shows in a process listing.
umask 077
PYREON_KEYSTORE_PASS="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
export PYREON_KEYSTORE_PASS
keytool -genkeypair -v -keystore release.keystore -alias pyreon-release \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass:env PYREON_KEYSTORE_PASS -keypass:env PYREON_KEYSTORE_PASS \
  -dname "CN=Pyreon Local Release, OU=dev, O=pyreon, C=US"

cat > keystore.properties <<EOF
storeFile=release.keystore
storePassword=${PYREON_KEYSTORE_PASS}
keyAlias=pyreon-release
keyPassword=${PYREON_KEYSTORE_PASS}
EOF
unset PYREON_KEYSTORE_PASS

echo "[pyreon] Self-signed release keystore generated (release.keystore + keystore.properties)."
