---
'@pyreon/native-compiler': minor
---

Lower two-element responsive style arrays on iOS and Android

`style={{ padding: [8, 16] }}` — unistyle's mobile-first idiom — previously
refused on the native targets, so a responsive web layout had to be rewritten
with an explicit `useSizeClass()` branch to cross. It now lowers directly:

- **iOS** — `.padding((pyreonSizeClass == .regular ? 16 : 8))`, with the
  `@Environment(\.horizontalSizeClass)` injection the conditional needs.
- **Android** — `Modifier.padding((if (LocalConfiguration.current.screenWidthDp >= 600) 16 else 8).dp)`,
  the same 600dp boundary `useSizeClass()` already uses.

Exactly two elements, because that is the only length that maps losslessly:
native resolves two size classes, not N breakpoints, so a three-element
array's middle band spans both and collapsing it would silently pick a wrong
value for part of its range. Longer arrays keep the existing refusal and its
diagnostic.
