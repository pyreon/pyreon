---
'@pyreon/compiler': patch
---

Reactivity Lens — Phase 3: Rust-backend sidecar parity. The native
napi-rs binary now emits the `reactivityLens` span sidecar from the
same 6 codegen-decision sites as the JS path, gated by the same opt-in
`TransformOptions.reactivityLens` flag. Purely additive — emitted code
is byte-identical with the option on or off, on both backends — so the
~80% of users on the native path get the editor lens too. JS↔Rust
span-set parity + the additive guarantee are gated by the new
`compareLens` cross-backend equivalence block (bisect-verified).
