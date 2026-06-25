---
'@pyreon/compiler': patch
---

compiler: bare-signal attribute values now bind directly (`_bindDirect`), matching the accessor form

`class={active}` (a bare signal as an attribute value) compiled to a
re-tracking `_bind(() => { … active() … })`, while the semantically
identical accessor form `class={() => active()}` already took the direct
`_bindDirect(active, …)` path. The two now compile **byte-identically** —
a bare signal/computed attribute value (`class` / `style` / `data-*` /
DOM props) takes the direct-subscriber path, skipping the per-update
re-track. Both compiler backends (JS + Rust native) emit identical output.

Scoped to **attributes** by design: bare-signal **text** children
(`<div>{name}</div>`) keep their existing emission — promoting that
dominant shape to `_bindText` is a separate, larger change.

`createSelector` results stay on the general path (guarded by
`isActiveSignal`); `_bindDirect` also falls back to a `renderEffect` for
any source lacking `.direct`, so the change is safe at the edges.
