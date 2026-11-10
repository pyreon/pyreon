---
'@pyreon/native-router-kotlin': patch
'@pyreon/native-router-swift': patch
---

A cold-launch deep link (the default `initialPath`, from `PyreonDeepLink.takePendingPath()`) now runs the matched route chain's `beforeEnter` before it is committed, matching the Swift router. A refused initial path falls back to the root with no params; a tab router opens on its first tab. Previously only `push`/`replace` were gated, so a link that launched the app could open a route whose guard refuses it.

Swift: a refused initial path no longer leaves the refused route's params in `params`, and a tab router now opens on its first tab instead of the target's tab — which, when the refused path was that tab's root, rendered the guarded page anyway. Kotlin gets the same two rules.
