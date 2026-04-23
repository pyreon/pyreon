---
title: "Imperative notifications — toasts"
summary: "Mount <Toaster /> once, then toast() / toast.success() / toast.promise() from anywhere."
seeAlso: [event-listeners]
---

# Imperative notifications — toasts

## The pattern

Mount `<Toaster />` once at the app root, then call `toast()` from anywhere (event handlers, store actions, effects — no hook-order concerns):

```tsx
import { toast, Toaster } from '@pyreon/toast'

<App>
  <MainContent />
  <Toaster />
</App>

// Anywhere in your app:
function SaveButton() {
  async function onClick() {
    try {
      await api.save()
      toast.success('Saved')
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
    }
  }
  return <button onClick={onClick}>Save</button>
}
```

Presets: `toast.success`, `toast.error`, `toast.warning`, `toast.info`, `toast.loading`. Each returns an ID so you can update the toast later:

```ts
const id = toast.loading('Saving…')
try {
  await api.save()
  toast.update(id, { type: 'success', message: 'Saved' })
} catch (err) {
  toast.update(id, { type: 'error', message: `Failed: ${err.message}` })
}
```

Or use `toast.promise(...)` which handles the state machine for you:

```ts
toast.promise(api.save(), {
  loading: 'Saving…',
  success: 'Saved',
  error: (err) => `Failed: ${err.message}`,
})
```

## Why

Toasts are inherently imperative — they're triggered by an event (a save succeeding, a button click, a WebSocket message) rather than driven by reactive state. The callable API `toast(message)` mirrors that shape directly. `<Toaster />` handles the rendering, cleanup, pause-on-hover, and a11y (`role="alert"`, `aria-live="polite"`).

Mount the `Toaster` ONCE at app root. Multiple `Toaster` instances stack visually and confuse focus management.

## Anti-pattern

```tsx
// BROKEN — constructing a toast signal and mounting manually
const toastMessage = signal('')
<div class="toast">{() => toastMessage()}</div>
// This is the whole reason @pyreon/toast exists. Use it instead.
```

```tsx
// BROKEN — <Toaster /> inside a conditional mount
{() => showToaster() && <Toaster />}
// Toaster is singleton-ish; toggling it dismisses active toasts.
// Mount it once at the root, always on.
```

```tsx
// BROKEN — calling toast() inside a render body fires on every render
function Component() {
  toast('rendered!')  // fires once the FIRST render, then again if anything
                      // upstream triggers re-creation
  return <div>...</div>
}

// Correct — gate on an event:
function Component() {
  return <button onClick={() => toast('clicked!')}>Click</button>
}
```

## Related

- Reference API: `toast`, `Toaster`, `toast.promise` — `get_api({ package: "toast", symbol: "..." })`
- For component-local feedback (input errors, validation), prefer `useField().error()` — toast is for cross-cutting events
