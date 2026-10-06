---
'@pyreon/native-compiler': patch
'@pyreon/lathe': patch
---

Fix a minimal nested response (`{ data: { id } }`) generating mismatched Swift and Kotlin types, and make the native reach report honest about it (#3784).

`@pyreon/native-compiler`: a response shape named at two sites (a render callback parameter and a `useQuery<T>` generic) now resolves to one declared type on both targets. The lifted/declared struct was keyed by its field types (`ref:Name`) while the annotation site keyed the same shape as `obj{…}`, so the lookup missed; Kotlin then synthesized a second class without asking whether the shape was already named, and Swift's single-field fallback collapsed `{ data: T }` to the inner `T`. Shape keys now expand references to declared structs, and Kotlin consults the declared shapes before synthesizing.

`@pyreon/lathe`: a native module imports `zodSchema` only when it declares a named model binding (an unused import drew PMTC's misleading "zodSchema has NO native lowering" warning); the verifier no longer demands a schema marker for an inline `z.object(…)` response; and an operation whose module failed to lower or compile is reported `web-only` with the first real cause instead of `web+native`.
