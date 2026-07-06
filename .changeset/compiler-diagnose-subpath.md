---
"@pyreon/compiler": minor
---

Add a browser-safe `@pyreon/compiler/diagnose` subpath. `diagnoseError` + the `ERROR_PATTERNS` catalog (pure regex + strings) are extracted out of `react-intercept.ts` — which imports the Node-only TypeScript compiler API — into a new `diagnose.ts` module with **zero** `typescript` dependency, exported at `@pyreon/compiler/diagnose`. This lets error diagnosis load in the browser (enabling a dev-time throw-time fix printer) without dragging the ~8 MB TypeScript compiler into the client bundle. `react-intercept.ts` re-exports `diagnoseError` so existing consumers and the package main entry are unchanged. Locked by a bundle test asserting the subpath pulls no TS-API markers.
