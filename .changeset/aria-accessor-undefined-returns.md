---
'@pyreon/core': patch
---

Widen the reactive-accessor form of 8 ARIA attribute types to permit an `undefined` return — `aria-label` (the reported gap) plus `aria-hidden` / `aria-disabled` / `aria-expanded` / `aria-selected` / `aria-checked` / `aria-required` / `aria-readonly`. The runtime already removes the attribute when a dynamic value resolves to `undefined`, and `aria-x={cond ? 'true' : undefined}` is the documented recommended shape — but these accessors were typed `() => T` (no undefined), inconsistently with the neighbouring `role` / `aria-describedby` / `aria-current` / `aria-invalid`, forcing `?? ''` workarounds for a purely type-level gap. Type-only; no runtime change.
