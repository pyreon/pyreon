---
'@pyreon/compiler': patch
'@pyreon/lint': patch
---

Bump `oxc-parser` to `^0.142.0` (from `^0.140.0`).

The parser sits under the JS compiler backend, so an AST-shape change would surface as a JS/Rust divergence rather than a crash. Verified where that would show: `@pyreon/compiler` 1961 tests passing — including `native-equivalence` (the byte-identical oracle) and the 300-seed × 3-mode differential fuzz — plus `@pyreon/lint` 1150 and `@pyreon/native-compiler` 2311.

No API or behavior change; this is a dependency-range bump only.
