---
'@pyreon/create-multiplatform': patch
---

`scripts/ensure-release-keystore.sh` generates a random keystore password per project instead of the fixed `pyreon-local` shared by every scaffold. The password is passed to `keytool` through the environment rather than argv, and is written only to the gitignored, owner-only `android/keystore.properties`.
