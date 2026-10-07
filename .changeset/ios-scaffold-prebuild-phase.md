---
"@pyreon/create-multiplatform": patch
---

The iOS scaffold's `preBuildScripts` now lives on the application target in `ios/project.yml`. At the YAML root XcodeGen accepted it and generated zero script phases, so an ordinary Xcode build never ran the TSX to Swift compile hook. `scripts/build-ios.sh` also passes `--app` to `pyreon-native wire`, which Xcode (running the phase from `ios/`, where there is no package.json) needs to resolve the app root.
