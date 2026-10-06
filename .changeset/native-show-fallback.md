---
'@pyreon/native-compiler': patch
---

`<Show fallback={…}>` now lowers on Swift and Kotlin: the fallback is emitted as the `else` branch of the same condition (it was silently dropped, `warnings: []`, so the screen started empty). A JSX element, fragment, or accessor returning one lowers; `<Suspense>`/`<ErrorBoundary>` share the same fallback reading (fragments now work there too). Any fallback shape that cannot lower, and any other JSX-valued attribute on a built-in tag that no emitter reads, is now a named warning instead of a silent drop.
