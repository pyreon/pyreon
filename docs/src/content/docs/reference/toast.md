---
title: "Toast Notifications — API Reference"
description: "Toast notifications — toast(), toast.success/error/warning/info/loading, Toaster component, a11y"
---

# @pyreon/toast — API Reference

> **Generated** from `toast`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [toast](/docs/toast).

Imperative toast notifications for Pyreon. Call `toast()` from anywhere in your app — no provider or context needed. Preset variants (`toast.success`, `toast.error`, etc.), a `toast.promise()` helper for async operations, and `toast.update()` for loading-to-success patterns. Render `<Toaster />` once at the app root — it uses Portal, animated enter/leave CSS transitions, auto-dismiss, and pause-on-hover-and-focus. Accessible with a type-aware live-region role — `role="alert"` (assertive) for error/warning, `role="status"` (polite) for info/success — plus `aria-atomic`.

> **Peer dependencies:** `@pyreon/runtime-dom` — install alongside this package.

## Features

- toast() imperative API — call from anywhere, no provider needed
- toast.success/error/warning/info/loading preset variants
- toast.update(id, options) for loading-to-success transitions
- toast.promise(promise, messages) auto-transitions through states
- toast.dismiss(id?) — soft-dismiss one or all (plays the CSS leave animation)
- toast.remove(id?) — hard-remove one or all instantly (no leave animation)
- Per-toast description (secondary line), custom icon, and action button
- Animated enter AND leave — a dismissed toast fades + collapses in place, siblings reflow smoothly
- &lt;Toaster /&gt; with Portal, CSS transitions, auto-dismiss, pause on hover/focus, configurable default duration
- Accessible: type-aware live regions — role="alert" (assertive) for error/warning, role="status" (polite) for info/success

## Complete example

A full, end-to-end usage of the package:

```tsx
import { toast, Toaster } from '@pyreon/toast'

// Mount Toaster once at app root:
function App() {
  return (
    <>
      <Toaster position="top-right" duration={4000} />
      <MainContent />
    </>
  )
}

// Call toast() from anywhere — no provider needed:
toast('Hello!')

// Preset variants:
toast.success('Saved successfully!')
toast.error('Something went wrong')
toast.warning('Session expiring soon')
toast.info('New version available')

// Loading → success pattern:
const id = toast.loading('Saving...')
try {
  await saveData()
  toast.update(id, { type: 'success', message: 'Done!' })
} catch {
  toast.update(id, { type: 'error', message: 'Save failed' })
}

// Promise helper — auto-transitions through states:
toast.promise(fetchData(), {
  loading: 'Loading...',
  success: 'Loaded!',
  error: 'Failed to load',
})

// Dismiss (soft — animates out) or remove (hard — instant):
const toastId = toast('Dismissable')
toast.dismiss(toastId)  // soft-dismiss one (plays the leave animation)
toast.dismiss()         // soft-dismiss all
toast.remove(toastId)   // hard-remove one (no animation)
toast.remove()          // hard-remove all
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`toast`](#toast) | function | Create a toast notification imperatively. |
| [`Toaster`](#toaster) | component | Render container for toast notifications. |

## API

### toast `function`

```ts
(message: string, options?: ToastOptions) => string
```

Create a toast notification imperatively. Returns the toast ID for later `update()` or `dismiss()`. Works from anywhere in the app — no context or provider needed. Options include `type`, `duration` (0 = persistent), `description` (a secondary line), `icon` (any VNode), `action` (a button), `dismissible`, and `onDismiss`. The function also exposes `.success()`, `.error()`, `.warning()`, `.info()`, `.loading()` preset methods, `.update(id, options)` for modifying an existing toast (message/type/duration/description), `.dismiss(id?)` for SOFT removal (plays the CSS leave animation, then removes), `.remove(id?)` for HARD instant removal (no animation), and `.promise(promise, messages)` for async operation tracking.

**Example**

```tsx
// Basic:
toast('Hello!')
const id = toast.success('Saved!')

// With a description + custom icon:
toast.success('Uploaded', { description: '3 files · 1.2 MB', icon: <CheckIcon /> })

// Loading → success:
const loadId = toast.loading('Saving...')
await save()
toast.update(loadId, { type: 'success', message: 'Done!' })

// Promise helper:
toast.promise(fetchData(), {
  loading: 'Loading...',
  success: 'Loaded!',
  error: 'Failed',
})

// Dismiss:
toast.dismiss(id)  // one
toast.dismiss()    // all
```

**Common mistakes**

- Forgetting to render `<Toaster />` — toasts are created but have no visual container to render into
- Calling `toast.update()` after the toast has been auto-dismissed — the ID is no longer valid, the update is silently ignored
- Using `toast.promise()` with a function instead of a promise — pass the promise directly, not `() => fetch(...)`
- Expecting `toast.dismiss(id)` to remove the toast synchronously — it is SOFT (plays the ~200ms leave animation first); reach for `toast.remove(id)` when you need it gone instantly

**See also:** `Toaster`

---

### Toaster `component`

```ts
(props?: ToasterProps) => VNodeChild
```

Render container for toast notifications. Mount once at the app root. Renders via Portal with CSS transitions, auto-dismiss timer, and pause-on-hover behavior. Position configurable via `position` prop (`top-right`, `top-left`, `bottom-right`, `bottom-left`, `top-center`, `bottom-center`). Duration configurable via `duration` prop (default 4000ms).

**Example**

```tsx
<Toaster position="top-right" duration={5000} />
```

**Common mistakes**

- Mounting multiple `<Toaster />` instances — toasts render in all of them, causing duplicates
- Conditional rendering of `<Toaster />` — if unmounted, toasts created via `toast()` are queued but invisible until the Toaster mounts

**See also:** `toast`

---

## Package-level notes

> **No provider needed:** Unlike most Pyreon packages, toast uses a module-level signal store — `toast()` works from event handlers, effects, or any non-component code. The `<Toaster />` component reads from this shared store.

> **Peer dep:** `@pyreon/runtime-dom` is required because `<Toaster />` JSX emits `_tpl()` calls — declare it in consumer app dependencies.

> **Pause on hover:** The auto-dismiss timer pauses while the user hovers over a toast and resumes when the cursor leaves. This is built into `<Toaster />` with no configuration needed.
