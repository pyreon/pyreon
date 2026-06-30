---
'@pyreon/form': patch
---

Lazy-allocate the four off-hot-path per-field signals (`error` / `touched` /
`disabled` / `readOnly`), keeping `value` + `dirty` eager (both are written by
`setValue` on the keystroke path, so they stay captured directly in the closures
— no getter on the hot path, no V8 deopt). A freshly created N-field form now
allocates **2N signals at setup instead of 6N**, materializing the rest on first
access with stable signal identity. The `error` signal's `_invalidCount`
subscriber attaches on materialization (until then the field has no error and
contributes 0, so `isValid` stays correct).

Measured (Tier-A headless bench, Apple M3 / Node 24, TanStack Form as the stable
in-bench control): `setup-12-fields` **~4.8µs → ~3.65µs (−24%)** — now ties/beats
TanStack Form, closing the one op where Pyreon was behind; the keystroke hot path
is unchanged (40–42ns); `reset` is ~15% faster (it skips resetting unmaterialized
signals). All existing behavior is preserved (228 form tests pass; the lazy
contract is bisect-verified by `form-additional.test.tsx`).
