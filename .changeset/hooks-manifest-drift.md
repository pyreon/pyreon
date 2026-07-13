---
"@pyreon/hooks": patch
"@pyreon/mcp": patch
---

Correct 3 drifted `@pyreon/hooks` manifest `@example` blocks so they typecheck against the shipped export types, and gate-enforce them.

- **`useFocusReturn`**: the sibling `useFocusTrap` call in the example passed 2 args but `useFocusTrap` takes one `(getEl)` — dropped the extra arg.
- **`useBreakpoint`**: the signature + example claimed a flags object (`Signal<{ xs, sm, md, lg, xl }>` / `bp().md`), but the shipped hook returns `() => string` (the active breakpoint NAME accessor). Rewrote both (and the longExample comment) to compare `bp()` against a name.
- **`useUpdateEffect`**: the signature + example used React's `(effect, deps)` shape, but the shipped hook is watch-style `(source, callback)`. Rewrote the api example and the longExample line to the real shape.

`@pyreon/hooks` is removed from the `check-manifest-examples` gate's `NON_ENFORCED` list, so every hooks manifest example is now typecheck-enforced against the live exports (regenerated `@pyreon/mcp`'s api-reference accordingly). No runtime change.
