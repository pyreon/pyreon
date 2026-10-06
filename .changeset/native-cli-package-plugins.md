---
"@pyreon/native-cli": minor
---

`build` and `check` now discover compiler plugins shipped by an app's dependencies (`pyreon.native.plugin` in the package's `package.json`) and load each one lazily, only when the source imports one of its `pyreon.native.modules` (default: the package name). `--no-plugins` disables discovery; explicit `--plugin` is unchanged. New `pyreon-native plugins [--verify]` lists built-in and discovered plugins and the owner of each service hook (and verifies service types against the package's own native sources), and `pyreon-native explain <file.tsx>` prints, per service hook, the owning plugin and the Swift/Kotlin declaration emitted.
