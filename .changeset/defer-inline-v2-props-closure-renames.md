---
'@pyreon/compiler': minor
---

`<Defer>` inline form (v2) — closes 3 of the 4 scope gaps from PR #587:

**Props on inline child** (gap 1)

```tsx
// Before — bailed with no warning; runtime errored.
<Defer when={open}>
  <Modal title="Confirm" size="md" />
</Defer>

// Now — compiler rewrites:
<Defer when={open} chunk={() => import('./Modal').then((__m) => ({ default: __m.Modal }))}>
  {(__C) => <__C title="Confirm" size="md" />}
</Defer>
```

Props pass through verbatim into the render-prop body. The compiler only replaces the JSXIdentifier name (in opening AND closing tags) with `__C`; everything else (attrs, spread props, event handlers, nested children) survives unchanged.

**Closure capture** (gap 2)

```tsx
const open = signal(false)
const count = signal(0)

<Defer when={open}>
  <Modal count={count} onClose={() => open.set(false)} />
</Defer>
```

Works automatically once gap 1 is fixed — the render-prop arrow function lexically captures the surrounding scope, so `count` / `open` references resolve correctly at chunk-load time. No new code path; this falls out of preserving the child JSX verbatim.

**Renamed imports** (gap 3)

```tsx
// Before — bailed with `import-not-found` warning.
import { Modal as M } from './Modal'
<Defer when={open}><M /></Defer>

// Now — compiler rewrites, extracting the ORIGINAL exported name from the chunk:
<Defer when={open} chunk={() => import('./Modal').then((__m) => ({ default: __m.Modal }))}>
  {(__C) => <__C />}
</Defer>
```

`__m.Modal` — not `__m.M`. The chunk resolves the module's actual export, while the render-prop body uses `__C` (the render-prop binding).

**Multi-specifier import handling** (drive-by bug fix)

```tsx
import { Modal, OtherStuff } from './shared'
// ... uses OtherStuff elsewhere ...
<Defer when={open}><Modal /></Defer>
```

v1 would have removed the entire `import { Modal, OtherStuff }` declaration, breaking `OtherStuff`'s usage. v2 removes ONLY the `Modal` specifier — the import becomes `import { OtherStuff } from './shared'`. Sibling bindings stay intact. Handles both first-specifier and later-specifier cases.

**Still NOT in this** (gap 4 — namespace imports)

```tsx
import * as M from './Modal'
<Defer><M.Modal /></Defer>  // — still bails
```

Namespace imports with `JSXMemberExpression` children require a different rewrite path (the `_C` binding can't replace `M.Modal` since it's a member access, not an identifier). Not addressed in this PR — explicit form is the workaround.

## Verification

- 16 unit tests in `defer-inline.test.ts` (3 new props tests + 2 renamed-imports tests + 2 multi-specifier tests in addition to the existing 9)
- End-to-end via verify-modes — `examples/playground/src/pages/About.tsx` now uses inline `<Defer><DeferredFixture label="..." /></Defer>`, exercising prop-preservation through a real Vite build. The fingerprint `DEFER_INLINE_FIXTURE_PROP_LABEL_ABC987` must land in the route chunk (the render-prop body lives in the caller), NOT in the fixture chunk.
- Bisect-verified: reverting `buildRenderPropBody` to a constant `{(__C) => <__C />}` (drops prop preservation) → cell fails with `fingerprint "DEFER_INLINE_FIXTURE_PROP_LABEL_ABC987" found in 0 chunks`. Restored → passes.

1007 `@pyreon/compiler` tests pass.
