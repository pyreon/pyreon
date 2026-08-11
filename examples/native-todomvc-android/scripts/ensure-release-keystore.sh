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

keytool -genkeypair -v -keystore release.keystore -alias pyreon-release \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass pyreon-local -keypass pyreon-local \
  -dname "CN=Pyreon Local Release, OU=dev, O=pyreon, C=US"

cat > keystore.properties <<'EOF'
storeFile=release.keystore
storePassword=pyreon-local
keyAlias=pyreon-release
keyPassword=pyreon-local
EOF

echo "[pyreon] Self-signed release keystore generated (release.keystore + keystore.properties)."
