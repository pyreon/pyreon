---
'@pyreon/native-cli': patch
---

`pyreon-native wire` no longer follows a dependency's `devDependencies` (#4849). Installing a library does not install its devDependencies, so the native source directories wire found through them could not be resolved by a published app (adding a test-only devDependency to one `@pyreon/*` package wired its Swift and Kotlin sources into every app that used the package). The walk now follows the app's own `dependencies`, `devDependencies` and `optionalDependencies`, and from each `@pyreon/*` package only its `dependencies`, `optionalDependencies` and non-optional `peerDependencies`.

Upgrade: an app that relied on a native source reaching it through a library's devDependency must declare that package itself.
