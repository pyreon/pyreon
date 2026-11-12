---
'@pyreon/solid-compat': patch
---

Exports Solid's `<SuspenseList>`, so `import { SuspenseList } from 'solid-js'` under `compat: 'solid'` no longer fails. Its children render with each `<Suspense>` revealing on its own; the `revealOrder` / `tail` coordination is not implemented and warns in development when requested.
