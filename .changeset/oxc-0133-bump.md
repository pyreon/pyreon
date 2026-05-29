---
'@pyreon/compiler': patch
'@pyreon/lint': patch
---

Bump `oxc-parser` / `oxc-transform` from `^0.129.0` to `^0.133.0`. Both are
runtime dependencies (the compiler's JS-fallback parse path + all 67 lint
rules' AST). No AST-shape breakage: compiler suite (1414), lint suite (750),
native-compiler (388), and the bundle-budgets import-walker (57 pkgs) all
pass unchanged on 0.133.
