---
"@pyreon/reactivity": minor
"@pyreon/storage": patch
"@pyreon/state-tree": patch
---

feat(reactivity): `wrapSignal` primitive — fixes a latent state-tree bind bug + retires hand-rolled signal facades

`@pyreon/reactivity` had no primitive for "a signal whose write runs a side
effect" (persist, emit a patch, validate). So **two** packages hand-rolled the
same signal-facade — `@pyreon/storage`'s `wrapBaseSignal` and
`@pyreon/state-tree`'s `trackedSignal` — and a dedicated lint rule
(`pyreon/storage-signal-v-forwarding`) existed only to police the contract.
**A lint rule enforcing a wrapper invariant is the proof the primitive is
missing.**

New `wrapSignal(base, { set, update? })` builds a signal facade over `base`
that delegates ALL reads — including the internal `_v` field and `.direct`
that the compiler's `_bindText` / `_bindDirect` fast paths read directly,
bypassing the call — by construction, and routes writes through `set`. The
`_v`/`.direct` forwarding can no longer be forgotten.

**Latent bug fixed:** `state-tree`'s `trackedSignal` forwarded neither
`.direct` nor `_v`, so a model field bound via `{() => model.field()}` (the
text fast path) rendered empty and stayed empty — the exact class
`wrapBaseSignal` was created to prevent in storage, present and unfixed in
state-tree. Routing it through `wrapSignal` fixes it. Bisect-verified by
`state-tree/src/tests/tracked-signal-bind-contract.test.ts`.

- `@pyreon/reactivity`: new `wrapSignal` + `WrapSignalOptions` exports.
- `@pyreon/storage`: all 5 backends use `wrapSignal`; `wrap-base-signal.ts`
  deleted.
- `@pyreon/state-tree`: `trackedSignal` uses `wrapSignal` (bug fix).

`provide`/`useContext`-style user APIs are unchanged. The lint rule stays as
defense for any future hand-rolled facade that bypasses the primitive.
