---
'@pyreon/core': patch
'@pyreon/runtime-dom': patch
---

`<Suspense>` is now pay-per-use in the browser bundle. Its DOM boundary handler moved from `@pyreon/runtime-dom` into `@pyreon/core`, where `<Suspense>` carries it under a `Symbol.for('pyreon:suspense-attach')` key, so runtime-dom reads it off the component instead of importing it. An app that never renders a `<Suspense>` no longer bundles the component or its handler: the keyed-table benchmark app shrinks from 17,308 to 16,926 B gzipped. No API change.
