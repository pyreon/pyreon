# @pyreon/toast

Imperative toast notifications — call `toast()` from anywhere, render `<Toaster />` once.

A provider-less toast system: one `<Toaster />` mounted at the root, and any code (component bodies, event handlers, async functions, stores, route loaders) calls `toast(message)` / `toast.success(message)` / `toast.promise(promise, ...)` to enqueue. Backed by a signal so the Toaster picks updates up reactively. Includes auto-dismiss, pause-on-hover-and-focus, action buttons, an animated enter/leave, the loading → success / error promise pattern, and type-aware accessibility (`role="alert"` for error/warning, `role="status"` for info/success).

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
| `toast.dismiss(id?)` | dismiss one or every toast (soft — plays the leave animation) | |
| `toast.remove(id?)` | remove one or every toast instantly (hard — no leave animation) | |
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
  description?: string | VNodeChild // secondary line under the message
  icon?: VNodeChild // leading icon
  dismissible?: boolean // shows × dismiss button, default true
  action?: { label: string; onClick: () => void }
  onDismiss?: () => void // fires on manual or auto dismiss
}
```

There is **no per-toast `position`** — position is a `<Toaster>` prop, not a `ToastOptions` field. All toasts render in the Toaster's configured corner.

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
- Pauses auto-dismiss timers on hover AND on keyboard focus, resumes on leave/blur (the remaining duration is preserved per toast)
- Announces toasts with a **type-aware** live-region role — `role="alert"` (assertive) for error/warning, `role="status"` (polite) for info/success — plus `aria-atomic="true"`; the role implies its own `aria-live`, so the container is a plain labeled landmark (no double-announce)
- Animates entry AND exit via CSS transitions (no external animation lib): a dismissed toast fades + collapses in place, and its siblings reflow smoothly

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

## Dismiss (soft) vs remove (hard)

Two ways to take a toast down — the same `dismiss` / `remove` split react-hot-toast uses:

```ts
toast.dismiss(id) // SOFT: plays the CSS leave animation (fade + collapse), then removes
toast.remove(id) //  HARD: removes instantly, no leave animation
toast.dismiss() //   soft-dismiss every toast
toast.remove() //    hard-remove every toast
```

`dismiss` is the default you want for user-facing removals — the toast fades and collapses in place while its siblings reflow smoothly. `onDismiss` fires immediately in both cases. Reach for `remove` when you need a toast gone right now (replacing it, tearing down on unmount).

## Scope — what's deliberately not here

`@pyreon/toast` is a **signal-native, framework-integrated, a11y-first** toast — not a re-skin of a React toast library. Some features common elsewhere are intentional non-goals:

- **Swipe-to-dismiss / draggable toasts** (sonner, react-toastify) — a touch-gesture affordance; use `dismissible` + the `×` button, or an `action`.
- **Collapsed stacking with hover-to-expand** (sonner's signature) — an opinionated visual; `max` controls how many render, newest-first.
- **Per-toast `position`** — position is a `<Toaster>` prop; all toasts share the configured corner (mount two Toasters for two corners).

Fully custom toast content IS supported — `message`, `description`, and `icon` all accept any `VNodeChild`, so you render whatever markup you want inside the toast chrome.

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

Full docs: [pyreon.dev/docs/toast](https://pyreon.dev/docs/toast) (or `docs/src/content/docs/toast.md` in this repo).

## License

MIT
