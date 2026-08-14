---
'@pyreon/native-compiler': minor
---

The web-only import warning now explains itself per package

Importing any web-only `@pyreon/*` package into shared source produced one
identical sentence for all 29 of them — "render it behind a `<Web>` escape
hatch". That set spans a linter, a `<head>` manager, a virtualization library
and an animation engine, and the advice is wrong for most:

- `@pyreon/lint` is dev-time tooling that never reaches a component.
- `@pyreon/head` has no device analogue at all.
- `@pyreon/virtual` has a BETTER native answer — native lists are lazy by
  construction, so `<For>` inside `<Scroll>` beats a WebView.
- `@pyreon/kinetic`'s preset vocabulary genuinely DOES cross via
  `<Transition name>` (verified: it lowers to `.transition(.opacity)` on
  SwiftUI and `AnimatedVisibility(fadeIn/fadeOut)` on Compose), so the old
  advice steered users away from a working native path.

The reason now comes from each package's manifest `rationale` — already
required for web-only by `check-multiplatform-tier`, which generates this
mapping, so it cannot drift from the docs tier table. The native-equivalent
option is stated FIRST and the escape hatch second.
