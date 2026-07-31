---
'@pyreon/native-compiler': minor
'@pyreon/native-cli': patch
---

`<Transition>` gains configurable `duration` (ms, static literal) + `easing`
(`linear | ease-in | ease-out | ease-in-out`) on both native targets:
`.animation(.linear(duration: 2.5), value:)` on SwiftUI,
`AnimatedVisibility(enter/exit = fadeIn/fadeOut(tween(ms, easing)))` on
Compose, with the CSS easings mapped to the canonical curves. Absent props
emit byte-identically to the previous default shape (spec-locked); a
non-literal duration warns + falls back. The CLI's conditional-import table
learns the animation sub-package symbols (fadeIn/fadeOut/tween/easings) —
the stub-masked-symbol class, caught by the real gradle build.
