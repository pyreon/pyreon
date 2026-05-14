---
'@pyreon/core': minor
---

New `<Defer>` primitive — lazy-load a chunk when a trigger fires. Replaces the `lazy()` + `<Suspense>` + observer boilerplate with one component.

Three trigger modes:

```tsx
import { Defer } from '@pyreon/core'

// Signal-driven (modal pattern)
<Defer chunk={() => import('./ConfirmModal')} when={open}>
  {Modal => <Modal onClose={() => setOpen(false)} />}
</Defer>

// Viewport-driven (below-fold content)
<Defer chunk={() => import('./Comments')} on="visible" rootMargin="200px">
  {Comments => <Comments postId={id} />}
</Defer>

// Idle-driven (non-critical, prefetch when CPU is free)
<Defer chunk={() => import('./Analytics')} on="idle">
  {Dashboard => <Dashboard />}
</Defer>
```

Why this exists: `<Show when={open()}><Modal /></Show>` ships the modal code in the main bundle unconditionally. `<Defer>` defers the import (Rolldown sees `import('./X')` as a literal and chunks it) and only fires the trigger when the condition is met.

API details:

- `chunk: () => Promise<{ default: ComponentFn<P> } | ComponentFn<P>>` — dynamic import. The literal `import('./X')` is what enables chunk splitting.
- `when?: () => boolean` — signal accessor. Load when truthy. Repeated truthy emissions are no-ops (chunk loads exactly once per Defer instance).
- `on?: 'visible' | 'idle'` — alternative triggers. Mutually exclusive with `when`.
- `children?: (Component) => VNodeChild` — render-prop for prop forwarding. Optional; defaults to `<Component />` with no props.
- `fallback?: VNodeChild` — shown while the chunk is loading. Defaults to `null`.
- `rootMargin?: string` — IntersectionObserver `rootMargin` for `on="visible"` mode. Default `'200px'`.

SSR-safe: browser APIs (`IntersectionObserver`, `requestIdleCallback`) are gated behind `onMount` so server rendering doesn't crash. `requestIdleCallback` falls back to `setTimeout(1)` when unavailable (Safari < 16.4, jsdom).

Error handling: a rejected `chunk()` throws synchronously at the next render. Wrap `<Defer>` in `<ErrorBoundary>` (or let it propagate to a parent boundary) to recover.

This is v1 — explicit `chunk` prop, runtime-only. A v2 compiler-driven inline shape is planned: `<Defer when={x}><Heavy /></Defer>` where the compiler extracts the subtree to a synthetic chunk, no `chunk` prop or file extraction needed.
