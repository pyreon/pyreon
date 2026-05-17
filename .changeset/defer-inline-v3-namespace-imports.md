---
'@pyreon/compiler': minor
---

`<Defer>` inline form (v3) — closes the last open scope gap: namespace imports.

```tsx
// Before — bailed with `import-not-found`; user had to use the explicit form.
import * as M from './Modal'
<Defer when={open}><M.Modal /></Defer>

// Now — compiler rewrites:
<Defer when={open} chunk={() => import('./Modal').then((__m) => ({ default: __m.Modal }))}>
  {(__C) => <__C />}
</Defer>
```

The compiler recognises `<M.Modal />` as a depth-1 `JSXMemberExpression`, looks up `M` as an `ImportNamespaceSpecifier`, and rewrites:

1. The chunk extracts `__m.Modal` (the JSX property — `Modal`) from the namespace's source module
2. The full `M.Modal` JSX name is replaced with `__C` in both opening and closing tags
3. The static `import * as M from './Modal'` is removed (when M isn't used elsewhere)

Closes gap 4 from the v2 follow-up roadmap — every common import shape now works inline:
- `import X from './X'` ✓ (v1)
- `import { X } from './X'` ✓ (v1)
- `import { X as Y } from './X'` ✓ (v2)
- `import * as M from './X'; <M.X />` ✓ (v3, this PR)

Plus: multi-specifier imports drop only the deferred binding (v2 drive-by fix).

**Sub-gaps explicitly NOT closed by this PR:**

- **Deeper member expressions** (`<M.Sub.Modal />`) — `analyzeChildElement` returns null for non-depth-1 member expressions. The Defer is left alone; runtime errors with "missing chunk" if mounted. Workaround: explicit form.
- **Member access on a default-import** (`import M from './X'; <M.Modal />`) — semantically different (member access on a component, not a namespace bag). Compiler emits `defer-inline/unsupported-import-shape` warning so the author understands why the inline form is being skipped.
- **Namespace bindings referenced elsewhere in the file** (`import * as M; const x = M.Settings; <Defer><M.Modal /></Defer>`) — bails with `defer-inline/import-used-elsewhere` (Rolldown would static-bundle the module on shared usage, making the dynamic import a no-op). Common shape; users hitting this need either the explicit form or to refactor the namespace import.

## Verification

- **23 unit tests** in `defer-inline.test.ts` (7 new for v3 — basic rewrite + props on member-expression child + non-self-closing + 4 bail-out cases)
- **Real-app verify-modes**: `examples/playground/src/pages/About.tsx` now uses BOTH the v2 prop-preservation shape (`<DeferredFixture label="..." />`) AND the v3 namespace shape (`<NS.NamespaceFixture />`). New fingerprint `DEFER_NAMESPACE_FIXTURE_MARKER_QRS456` asserts the namespace fixture lands in its own chunk.
- **Bisect-verified**: disabling the `ImportNamespaceSpecifier` branch in `findImportFor` → fingerprint lands in `about-*.js` (the route chunk) instead of `NamespaceFixture-*.js`. Restored → passes. Grep for `TEMP BISECT` → clean.

1014 `@pyreon/compiler` tests pass.
