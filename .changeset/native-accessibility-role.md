---
"@pyreon/primitives": minor
---

Add `accessibilityRole` to the cross-platform `AccessibilityProps` vocabulary — a constrained, cleanly-mapping semantic-role enum (`'button' | 'image' | 'header'`) that lowers to the native a11y model on every target: web `role` (`button`/`img`/`heading`), iOS accessibility traits (`.isButton`/`.isImage`/`.isHeader`), and Android Compose `Role.Button`/`Role.Image` / `heading()`. Write the role once; each platform emits its idiom. (The PMTC Swift/Kotlin emit + stubs are in the private `@pyreon/native-compiler`.)
