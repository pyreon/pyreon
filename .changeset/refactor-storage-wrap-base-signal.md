---
'@pyreon/storage': patch
---

Extract the shared signal-wrapper pattern from the 4 storage factories (`createStorageSignal` shared by local + session, `useCookie`, `createStorage`, `useIndexedDB`) into a single `wrapBaseSignal(sig)` helper. The helper handles the callable shape, delegated `.peek` / `.subscribe` / `.direct` / `.debug` / `.label`, and the forwarded `_v` getter that the compiler-emitted `_bindText` fast path requires. Each factory keeps its own `.set` / `.update` / `.remove` for persistence — only the shared protocol is centralized.

No API change, no behavior change. Net -99 / +15 LOC across the 4 sites; the new helper file (~80 LOC including JSDoc) keeps the wrapper contract single-source so a future 5th backend (or extracted helper) can't forget a field. Bisect-verified at the helper layer: removing `_v` forwarding inside `wrap-base-signal.ts` fails all 6 `bind-text-compat` specs across every backend simultaneously.
