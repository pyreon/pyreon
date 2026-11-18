---
'@pyreon/create-multiplatform': minor
---

Scaffolded release builds now keep the files that make a crash stack readable.

`gradle assembleRelease` / `bundleRelease` copies R8's `mapping.txt` to `symbols/android/<versionName>-<versionCode>/`. The new `npm run release:ios` (`scripts/archive-ios.sh`) builds an unsigned device-SDK archive and copies its dSYM to `symbols/ios/<version>-<build>/`, after checking that its UUID matches the binary. `symbols/` is gitignored, so archive it with each release you ship. `npx pyreon-native symbolicate crash.json --symbols=symbols` reads that layout.
