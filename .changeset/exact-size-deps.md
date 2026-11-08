---
'@pyreon/reactivity': patch
---

Effects, computeds, template bindings (`_bind`) and `renderEffect`s retain about 128 B less each on V8 (node; about half that in Chromium, which compresses pointers).

V8 gives an empty array a 16-slot backing store on its first `push`. Every reactive owner collected its dependencies into such an array and kept it for its lifetime. Each owner now keeps an exact-size copy after its first run. The `onCleanup` collector and an `effectScope`'s disposer list start from a one-element array for the same reason. Behaviour is unchanged.
