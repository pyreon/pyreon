---
'@pyreon/hooks': patch
'@pyreon/meta': patch
---

`@pyreon/hooks`: add the missing SSR-guard coverage annotations to the native
hooks (`useAppState`, `useBiometrics`, `useDatabase`, `useFilePicker`,
`useGeolocation`, `useImagePicker`). Comment-only — no runtime change. The arms
they mark are unreachable from a node+happy-dom run, so they were counted
against a threshold they could never satisfy in that environment; marking them
is what lets the package hold a real 99% bar instead of quietly sitting under
it. Ships alongside genuine new tests for the same hooks: the `useAppState`
listener cleanup (leak class D), `useDatabase`'s persistence-degradation
contracts, `useBiometrics`, and `useMap.setCamera`.

`@pyreon/meta`: run its tests on vitest instead of `bun test`. All 149 tests
already passed under vitest and the package already had a `vitest.config.ts` —
only the `test` script was never switched, which meant it emitted Bun's coverage
format and the coverage gate could not read it at all.
