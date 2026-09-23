---
'@pyreon/native-compiler': patch
---

Two `@pyreon/flow` lowering fixes, both of which failed the build on iOS and Android. `createFlow<{ label: string }>(…)`, the explicit generic the compiler recommends for an empty graph, now resolves to the same struct its `data` literals construct, instead of `String` on Swift and `Any` on Kotlin. An integer coordinate expression such as `position: { x: col * 200 }` is now converted to the `Double` that `PyreonXYPosition` takes.
