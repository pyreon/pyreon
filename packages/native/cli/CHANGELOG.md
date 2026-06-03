# @pyreon/native-cli

## 0.1.0

### Minor Changes

- [#1268](https://github.com/pyreon/pyreon/pull/1268) [`33642a8`](https://github.com/pyreon/pyreon/commit/33642a8ed8ffbbfaed1509fdbf4e4cd6cc1d8253) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Emit import preamble in build output — the `pyreon-native build`
  command now prepends a per-target import block to each emitted file
  (`import SwiftUI` / `import PyreonRuntime` / `import PyreonRouter` on
  Swift; the full Compose + Pyreon-runtime wildcard set on Kotlin).

  Pre-fix every emitted file failed to compile standalone — the user
  had to wrap each output in a hand-written file that supplied the
  missing imports. Generated code now compiles directly against the
  real SwiftUI / Compose toolchain.

  Unused imports are harmless on both targets.

### Patch Changes

- Updated dependencies []:
  - @pyreon/native-compiler@0.0.0
