---
'@pyreon/compiler': patch
---

Update the Rust JSX backend's napi bindings from 2.x to 3.x (`napi` 3.8.6,
`napi-derive` 3.6.3).

The `#[napi(object)]` prelude helpers moved behind napi 3's `compat-mode`
feature, so the feature list gains it. Emit is unchanged: the seeded
differential fuzz reports 5000 seeds × 3 modes byte-identical between the JS
and Rust backends against the rebuilt binary.
