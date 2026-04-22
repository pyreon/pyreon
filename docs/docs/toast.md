---
title: Toast
description: Signal-driven toast notifications for Pyreon — imperative API, promise pattern, auto-dismiss, pause on hover
---

# @pyreon/toast

Signal-driven toast notifications. Imperative API that works anywhere — no provider needed. Place `<Toaster>` once at your app root, then call `toast()` from any module.

## Installation

::: code-group

```bash [npm]
npm install @pyreon/toast
```

```bash [bun]
bun add @pyreon/toast
```

```bash [pnpm]
pnpm add @pyreon/toast
```

```bash [yarn]
yarn add @pyreon/toast
```

:::

Peer dependencies: `@pyreon/core`, `@pyreon/reactivity`

## Quick Start

```tsx
import { toast, Toaster } from '@pyreon/toast'

function App() {
  return (
    <>
      <Toaster position="top-right" />
      <button onClick={() => toast.success('Saved!')}>Save</button>
    </>
  )
}
```

<Playground title="Toast Notifications" :height="100">
const toasts = signal([])
let id = 0

const addToast = (type, msg) => {
  const toast = { id: ++id, type, msg }
  toasts.update(t => [...t, toast])
  setTimeout(() => toasts.update(t => t.filter(x => x.id !== toast.id)), 2000)
}

const app = document.getElementById('app')
const colors = { success: '#198754', error: '#dc3545', info: '#0d6efd' }
const ui = h('div', {},
  h('div', { style: { display: 'flex', gap: '8px' } },
    h('button', { onClick: () => addToast('success', 'Saved!') }, 'Success'),
    h('button', { onClick: () => addToast('error', 'Failed!') }, 'Error'),
    h('button', { onClick: () => addToast('info', 'FYI') }, 'Info'),
  ),
  h('div', { style: { marginTop: '12px' } }, () =>
    toasts().map(t => h('div', { style: { padding: '6px 12px', marginBottom: '4px', borderRadius: '4px', color: '#fff', background: colors[t.type] } }, t.msg))
  ),
)
mount(ui, app)
</Playground>

## Imperative API — `toast()`

Show a toast from anywhere — components, stores, event handlers, async functions.

```tsx
import { toast } from '@pyreon/toast'

// Basic toast (type: "info")
toast('Something happened')

// Typed shortcuts
toast.success('File uploaded')
toast.error('Connection failed')
toast.warning('Disk almost full')
toast.info('New version available')

// Loading toast (persistent, no auto-dismiss)
const id = toast.loading('Uploading...')

// Update an existing toast
toast.update(id, { message: 'Almost done...', type: 'info' })

// Dismiss
toast.dismiss(id)    // dismiss one
toast.dismiss()      // dismiss all
```

Every `toast()` call returns a unique string ID.

## Toast Options

```tsx
toast('Custom toast', {
  type: 'success',
  duration: 8000,
  dismissible: false,
  action: {
    label: 'Undo',
    onClick: () => undoAction(),
  },
  onDismiss: () => console.log('Gone'),
})
```

| Option        | Type                                        | Default       | Description                                  |
| ------------- | ------------------------------------------- | ------------- | -------------------------------------------- |
| `type`        | `'info' \| 'success' \| 'warning' \| 'error'` | `'info'`      | Toast variant — controls styling             |
| `duration`    | `number`                                    | `4000`        | Auto-dismiss delay in ms. `0` = persistent   |
| `position`    | `ToastPosition`                             | from Toaster  | Override position for this toast              |
| `dismissible` | `boolean`                                   | `true`        | Show dismiss button                          |
| `action`      | `{ label: string; onClick: () => void }`    | —             | Action button next to the message            |
| `onDismiss`   | `() => void`                                | —             | Called when dismissed (manually or by timeout)|

## Promise Pattern

Auto-transitions a toast through loading → success/error states:

```tsx
toast.promise(saveDocument(), {
  loading: 'Saving...',
  success: 'Document saved!',
  error: 'Failed to save',
})

// Dynamic messages from result/error
toast.promise(fetchUser(id), {
  loading: 'Loading user...',
  success: (user) => `Welcome, ${user.name}!`,
  error: (err) => `Error: ${err.message}`,
})
```

## Toaster Component

Renders all active toasts via a `<Portal>`. Place once at your app root.

```tsx
import { Toaster } from '@pyreon/toast'

function App() {
  return (
    <>
      <Toaster
        position="bottom-right"
        max={3}
        gap={12}
        offset={24}
      />
      <MyApp />
    </>
  )
}
```

### Toaster Props

| Prop       | Type            | Default       | Description                      |
| ---------- | --------------- | ------------- | -------------------------------- |
| `position` | `ToastPosition` | `'top-right'` | Default position for all toasts  |
| `max`      | `number`        | `5`           | Maximum visible toasts           |
| `gap`      | `number`        | `8`           | Gap between toasts in px         |
| `offset`   | `number`        | `16`          | Offset from viewport edge in px  |

### Positions

`'top-left'` | `'top-center'` | `'top-right'` | `'bottom-left'` | `'bottom-center'` | `'bottom-right'`

## Pause on Hover

Toast timers automatically pause when the mouse enters the toast container and resume when it leaves. No configuration needed.

## Action Buttons

Add an action button to any toast for undo/retry patterns:

```tsx
toast('Item deleted', {
  type: 'warning',
  duration: 6000,
  action: {
    label: 'Undo',
    onClick: () => restoreItem(id),
  },
})
```

## Accessibility

Toast elements use `role="alert"` and `aria-atomic="true"`. The container uses `aria-live="polite"` for screen reader announcements.

## SSR

`<Toaster>` returns `null` on the server — safe to include in SSR layouts. `toast()` calls during SSR are safe (they queue into the signal, which is discarded).

## TypeScript

```ts
import type {
  Toast,
  ToastOptions,
  ToastPosition,
  ToastType,
  ToasterProps,
  ToastPromiseOptions,
} from '@pyreon/toast'
```
