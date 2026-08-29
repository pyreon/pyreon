---
'@pyreon/rocketstyle': minor
'@pyreon/ui-core': minor
'@pyreon/unistyle': minor
---

A `.theme()` chain with no `.styles()` now renders its theme as CSS

`.theme()` supplies values; nothing turned them into CSS unless the author also
chained `.styles()`. So a theme-only chain rendered COMPLETELY UNSTYLED in a
browser, while `@pyreon/native-compiler` reads the same `.theme()` statically and
emits real view modifiers — one declaration, fully styled on iOS/Android and bare
on the web.

The bridge arrives through ui-core's existing theme-engine seam
(`responsiveStyles`, registered by unistyle), so rocketstyle gains no dependency
on unistyle and still degrades to no CSS without it. It applies ONLY when the
chain declared no `.styles()` of its own — an explicit chain already owns the
bridge, and a second one would emit the theme twice.
