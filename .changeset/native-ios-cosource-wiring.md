---
"@pyreon/native-cli": patch
"@pyreon/create-multiplatform": patch
---

A scaffolded iOS app can now reach its native Swift runtimes under any install layout. `pyreon-native wire --ios-out=<dir>` stages every co-located `native/swift` source into one directory that the Xcode project lists as a static source group, and the scaffold runs it on each build before the TSX compile. Previously 16 packages shipping Swift — including `PyreonForm`, `PyreonAuth` and `PyreonDatabase` — were wired on Android and unreachable on iOS, so the same shared source built on one platform and failed on the other with `cannot find 'PyreonForm' in scope`. The same command also links the two SwiftPM runtimes to wherever the install actually put them; the previous hardcoded `../node_modules/@pyreon/native-runtime-swift` exists only in a flat install, and under hoisting or pnpm `xcodegen generate` failed the spec outright with `Invalid local package`.
