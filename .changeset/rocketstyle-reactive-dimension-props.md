---
'@pyreon/rocketstyle': patch
---

fix(rocketstyle): resolve function-valued dimension props so INLINE reactive dimension props apply

The Pyreon compiler emits an inline reactive dimension prop — `state={sig() ? 'a' : 'b'}` — as a bare accessor `state: () => …` (a `.map()`/helper-scoped prop stays a plain value). rocketstyle's `calculateStylingAttrs` only handled `string`/`number`, so a function fell to the `undefined` arm and the dimension was silently dropped: active-tab highlighting, signal-driven `variant`/`size`/`state`, etc. never applied for inline reactive dimension props. It now resolves a function-valued dimension prop — and, since this runs inside rocketstyle's reactive resolution, the read is tracked, so a dimension flip re-resolves the class with no remount. Static values, plain-value props, and `_rp`-getter (already-resolved-to-string) props are unchanged.
