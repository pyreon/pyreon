---
"@pyreon/native-compiler": minor
"@pyreon/native-cli": minor
"@pyreon/hooks": minor
"@pyreon/hotkeys": minor
"@pyreon/router": minor
"@pyreon/primitives": minor
"@pyreon/core": minor
"@pyreon/compiler": patch
---

Move the remaining stateful, timing and environment hook lowerings, router hooks, and native-module recognition to their owning package plugins. Add generic statement and pattern call recognizers, pass inference, typed arguments and lifecycle/environment declaration metadata. Direct native compiler callers must install the relevant package plugins; the native CLI discovers the separate tooling entries automatically. Runtime imports remain independent of compiler tooling.
