---
'@pyreon/compiler': patch
---

Two root-cause fixes at the template child/attr classification seam (both backends, byte-identical):

- **TS type-layers are now transparent to the template classifier (PZ-05).** `{(() => x()) as never}`, `{(expr) satisfies T}`, `{(expr)!}`, and plain parens `{(expr)}` classify (and compile byte-identically to) the bare form at BOTH the child seam and the attr seam. Pre-fix a wrapped accessor fell through to a static bake and rendered the function SOURCE as literal text (`textContent = (() => x()) as never`); the attr form setAttribute'd the source string.
- **Calls to in-file JSX-returning helpers now MOUNT (PZ-02).** `const cell = (v) => <b>{v}</b>` + `<td>{cell(x)}</td>` (also the accessor form `{() => cell(x)}`, zero-arg calls, `function` declarations, and conditional `string|VNode` returns) route through `_mountSlot(() => (cell(x)))` instead of a reactive-text bind that stringified the returned VNode to "[object Object]". Scope-aware (shadowed callees are not routed, same discipline as the signal auto-call pass); reactive args re-render the slot; the client now matches SSR (which always mounted the shape — the old emit was a guaranteed SSR↔client mismatch). Cross-file callees are out of scope (no type info at this seam) and keep the reactive-text path.

The seeded differential-fuzz grammar now generates cast/paren wrappers and helper-call children to police the seam; `pyreon doctor diagnose` teaches the cast shape.
