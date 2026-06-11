---
'@pyreon/create-multiplatform': patch
---

The Android scaffold ships `material-icons-core` — `<Icon>` now references Material glyphs at compile time (`Icons.Filled.*` via the canonical `ICON_MAP`), replacing a phantom `pyreonIcon` runtime lookup that existed only as a typecheck stub and failed every real Gradle build that used an icon.
