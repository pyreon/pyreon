---
'@pyreon/compiler': minor
'@pyreon/vite-plugin': minor
---

`<Defer>` now supports inline children — the compiler extracts the subtree into a proper chunk automatically.

**Before (v1, PR #585)** — explicit `chunk` prop required:

```tsx
<Defer chunk={() => import('./ConfirmModal')} when={open}>
  {Modal => <Modal onClose={() => setOpen(false)} />}
</Defer>
```

**After (this PR)** — inline children, compiler does the chunking:

```tsx
import { Modal } from './ConfirmModal'

<Defer when={open}>
  <Modal />
</Defer>
```

The compiler (`@pyreon/compiler`'s new `transformDeferInline`) detects `<Defer>` JSX with no `chunk` prop and a single bare component child, looks up that component's import, rewrites the JSX to use an explicit `chunk={() => import('./path')}` prop, and removes the static import so Rolldown actually emits a separate chunk.

## v1 scope (this PR)

- Single Defer JSX element per file (multiple Defers in one file each get their own transform pass — works fine)
- Child must be a single self-closing component element with **no props** (`<Modal />` ✓; `<Modal title="hi" />` falls back to the explicit form)
- Named or default imports only — renamed imports (`{ Modal as M }`) and namespace imports (`* as M`) bail with a warning, user falls back to explicit form
- The imported binding must NOT be used outside the Defer subtree (Rolldown would static-bundle the module and the dynamic import becomes a no-op; the compiler warns and bails when this is detected)
- JS-fallback compiler path only — Rust compiler parity is a follow-up

When the transform bails on any of the above, the user sees a soft warning at compile time. The `<Defer>` element is left unchanged; runtime then errors at chunk-load time because `chunk` is missing, prompting the user to use the explicit form.

## What's NOT in this PR

- Closure capture (passing `count` signals or local state to the inline child) — requires prop-extraction analysis
- Rust compiler implementation — JS fallback only
- HMR for the synthetic chunk module — relies on Rolldown's standard dynamic-import HMR
- TypeScript type-narrowing for the inline form — `<Defer>`'s props still type-check the explicit form; inline form passes through without type-narrowing the chunk relationship

## How it composes

The transform runs in `@pyreon/vite-plugin`'s `transform()` hook BEFORE `transformJSX()`. By the time the JSX→runtime transform sees the source, the inline form has already been rewritten into the explicit chunk-prop form. No special-casing in the runtime, no new VNode shape, no new bundler hook — just AST rewriting before the existing pipeline.

Verified via 13 unit tests (`@pyreon/compiler/src/tests/defer-inline.test.ts`) covering:

- Basic rewrites: named/default imports, on="visible" / when={signal} triggers, props preservation
- Bail-outs: chunk already provided, binding used elsewhere, child not imported, child has props, multiple children, syntax errors
- Multi-Defer files: two independent Defers in one file get rewritten independently

1004 `@pyreon/compiler` tests pass (13 new + 991 existing — no regressions).

Depends on PR #585 (the runtime `<Defer>` primitive). Won't be useful until that merges.
