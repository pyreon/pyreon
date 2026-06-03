---
'@pyreon/native-cli': minor
---

Emit import preamble in build output — the `pyreon-native build`
command now prepends a per-target import block to each emitted file
(`import SwiftUI` / `import PyreonRuntime` / `import PyreonRouter` on
Swift; the full Compose + Pyreon-runtime wildcard set on Kotlin).

Pre-fix every emitted file failed to compile standalone — the user
had to wrap each output in a hand-written file that supplied the
missing imports. Generated code now compiles directly against the
real SwiftUI / Compose toolchain.

Unused imports are harmless on both targets.
