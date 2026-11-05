---
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Four iOS/Android emit fixes, each of which shipped code that did not compile, or that crashed on one platform only, with no warning:

- **A zero-argument helper called from another helper keeps its call.** `function label() { return 'L' + String(k()) }` emitted `String(k)` — the bare function reference — on both targets, because module scope did not treat the file's own helpers as callable. Calls from a component body were unaffected.
- **`substring` behaves like JavaScript.** Kotlin's own `String.substring` throws for a bound past the end, a negative bound or `start > end`, where JavaScript clamps and swaps — so the everyday `title.substring(0, 10)` on a shorter title crashed an Android app. On iOS a negative or variable bound trapped or did not compile. Both now go through a new runtime helper, `pyreonSubstring`. This also fixes the generated chart engine's date formatter on Android, which read `pattern.substring(i, i + 4)` and threw `StringIndexOutOfBoundsException` near the end of every date pattern.
- **A fractional `slice` bound compiles on iOS.** `xs.slice(0, xs.length / 2)` passed a `Double` where `pyreonSlice` takes `Int`. It now converts through `pyreonSliceIndex`, which truncates like JavaScript and reads NaN as 0 (a bare `Int(x)` would trap).
- **A `throw` inside an array callback propagates on iOS.** `xs.map(s => { if (!s) throw new Error('bad'); … })` inside a helper became `fatalError` on iOS while the web and Android propagate it to the caller's `try`/`catch`. A callback of `map` / `filter` / `forEach` / `find` / `findIndex` / `some` / `every` / `reduce` / `flatMap` now keeps the enclosing throw context (Swift's own versions are `rethrows`), and the call is marked `try`.

The component-body destructuring warning also stopped claiming that nesting, holes and a trailing array rest do not lower (they have since #4085); it now names what still does not: a default value, an object rest and a computed key. The real-SDK Swift typecheck links `PyreonIntl.swift` for emits that use `Intl` formatting, which it previously could not type-check at all.
