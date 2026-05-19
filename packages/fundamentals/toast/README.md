# @pyreon/toast

Imperative toast notifications — call `toast()` from anywhere, render `<Toaster />` once.

A provider-less toast system: one `<Toaster />` mounted at the root, and any code (component bodies, event handlers, async functions, stores, route loaders) calls `toast(message)` / `toast.success(message)` / `toast.promise(promise, ...)` to enqueue. Backed by a signal so the Toaster picks updates up reactively. Includes auto-dismiss, pause-on-hover, action buttons, the loading → success / error promise pattern, and accessibility primitives (`role="alert"`, `aria-live="polite"`).

## Install

```bash
bun add @pyreon/toast @pyreon/core @pyreon/reactivity @pyreon/runtime-dom
```

## Quick start

```tsx
import { toast, Toaster } from '@pyreon/toast'

const App = () => (
  <>
    <Toaster position="top-right" />
    <button onClick={() => toast.success('Saved!')}>Save</button>
    <button onClick={() => toast.error('Connection failed')}>Trigger error</button>
  </>
)

// From anywhere — no provider, no hook needed:
toast('Plain message')
toast.success('Done', { duration: 6000 })
toast.error('Failed', { action: { label: 'Retry', onClick: retry } })
toast.promise(saveDraft(), {
  loading: 'Saving…',
  success: (data) => `Saved revision #${data.rev}`,
  error: (err) => `Failed: ${(err as Error).message}`,
})
```

## API

| Surface | Signature | Notes |
|---|---|---|
| `toast(message, options?)` | `→ string` | Returns the toast ID |
| `toast.success(message, options?)` | shortcut for `{ type: 'success' }` | |
| `toast.error(message, options?)` | `{ type: 'error' }` | |
| `toast.warning(message, options?)` | `{ type: 'warning' }` | |
| `toast.info(message, options?)` | `{ type: 'info' }` | |
| `toast.loading(message, options?)` | persistent loading toast — won't auto-dismiss | |
| `toast.update(id, patch)` | mutate an open toast (text + type) | |
| `toast.dismiss(id?)` | dismiss one or every toast | |
| `toast.promise(promise, opts)` | transitions loading → success / error automatically | |

```ts
toast(message: string | VNodeChild, options?: ToastOptions): string
```

The `message` accepts plain strings AND `VNodeChild`, so you can render rich content:

```tsx
toast(<span>Saved to <strong>{name}</strong></span>)
```

## `ToastOptions`

```ts
interface ToastOptions {
  type?: 'info' | 'success' | 'warning' | 'error'
  duration?: number // ms, default 4000. Set 0 for persistent.
  position?: ToastPosition // overrides the Toaster default
  dismissible?: boolean // shows × dismiss button, default true
  action?: { label: string; onClick: () => void }
  onDismiss?: () => void // fires on manual or auto dismiss
}
```

## `<Toaster>` — render once at root

```tsx
<Toaster
  position="top-right" // default
  max={5} // visible toasts simultaneously
  gap={8} // px between toasts
  offset={16} // px from viewport edge
/>
```

Positions: `'top-left'` · `'top-center'` · `'top-right'` · `'bottom-left'` · `'bottom-center'` · `'bottom-right'`.

The Toaster:

- Renders into a Portal so it sits above any z-index stack
- Pauses auto-dismiss timers on hover, resumes on leave (the remaining duration is preserved per toast)
- Emits `role="alert"` + `aria-live="polite"` so screen readers announce new toasts
- Animates entry / exit via CSS transitions (no external animation lib)

## Loading → success/error via `toast.promise`

```ts
const id = toast.promise(fetch('/api/save'), {
  loading: 'Saving…',
  success: (response) => `Saved (${response.status})`,
  error: (err) => `Failed: ${(err as Error).message}`,
})

// Returns the toast ID — use to dismiss manually if needed
toast.dismiss(id)
```

`success` and `error` accept either a `string`/`VNodeChild` or a function `(data) => string|VNodeChild` so the eventual message can read the resolved value.

## Updating a live toast

```ts
const id = toast.loading('Uploading…')
// later:
toast.update(id, { message: 'Processing…', type: 'info' })
toast.update(id, { message: 'Done', type: 'success', duration: 3000 })
```

## Testing

```ts
import { _reset, _toasts } from '@pyreon/toast'
import { afterEach } from 'vitest'

afterEach(_reset)
```

`_reset()` clears the queue and timers; `_toasts` is the raw `Signal<Toast[]>` for assertions.

## Gotchas

- **Mount `<Toaster />` exactly once at the root** — multiple mounted Toasters each render the full queue, producing duplicates.
- **`toast.loading()` returns an ID with `duration: 0`** (persistent). You MUST call `toast.update(id, ...)` or `toast.dismiss(id)` — otherwise the loading toast stays forever.
- **The action button does NOT auto-dismiss** the toast. Call `toast.dismiss(id)` inside your `onClick` if you want both behaviors.
- **Toasts above `max` are queued, not dropped** — when a visible toast dismisses, the next queued one slides in.
- **`onDismiss` fires on manual dismiss AND auto-timeout** — there's no separate "auto-dismiss" callback. Compare with `duration === 0` upstream if you need to disambiguate.
- **`<Toaster>` uses a Portal** — make sure your app has a mounted DOM root before any `toast()` call, or the queue accumulates until the Toaster mounts.

## Documentation

Full docs: [docs.pyreon.dev/docs/toast](https://docs.pyreon.dev/docs/toast) (or `docs/docs/toast.md` in this repo).

## License

MIT
