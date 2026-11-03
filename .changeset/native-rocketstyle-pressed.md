---
'@pyreon/rocketstyle': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

A rocketstyle `active:` (or `pressed:`) style on a `Button` or `Press` base now lowers to iOS and Android, driven by the platform's own press state: a `PyreonPressStyle` ButtonStyle reading `configuration.isPressed` on iOS, and a hoisted interaction source with `collectIsPressedAsState()` on Android. `hover` / `focus` blocks are named in a warning instead of being dropped as a "non-literal value".
