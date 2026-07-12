---
title: Toast
description: Signal-driven toast notifications for Pyreon — imperative API, preset variants, promise pattern, auto-dismiss, pause on hover and focus
---

`@pyreon/toast` provides imperative toast notifications. Call `toast()` from anywhere in your app — event handlers, effects, async functions, even non-component modules — with no provider or context to set up. Mount a single `<Toaster />` at your app root and it renders the active stack via a Portal, with CSS transitions, auto-dismiss timers, pause-on-hover-and-focus, and type-aware accessibility built in. Toasts are backed by a module-level signal, so creating one is a plain function call and updating one patches only the affected DOM node.

<PackageBadge name="@pyreon/toast" href="/docs/toast" />

## Installation

:::code-group

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

Peer dependency: `@pyreon/runtime-dom` — required because `<Toaster />` JSX emits `_tpl()` calls. Declare it in your app's dependencies.

## Quick Start

Two pieces: mount `<Toaster />` once, then call `toast()` anywhere.

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

<Example file="./examples/toast/toast-notifications" title="Toast Notifications" />

## Why imperative toasts?

Most reactive UI libraries make notifications a declarative tree of components you conditionally render. That works, but it forces every toast trigger to thread state up to a shared owner — exactly the prop-drilling toasts exist to avoid.

`@pyreon/toast` takes the opposite approach. The toast stack lives in a **module-level signal**, so `toast()` is a free function you can import and call from anywhere:

```tsx
// in a store action
async function saveTodo(todo: Todo) {
  await api.save(todo)
  toast.success('Todo saved')
}

// in an event handler
<button onClick={() => toast('Copied to clipboard')}>Copy</button>

// in an effect
effect(() => {
  if (connection() === 'lost') toast.error('Connection lost')
})
```

The single `<Toaster />` reads from that shared store. Because each toast is keyed by id and read field-by-field, updating or dismissing one toast patches only its own DOM node — there is no full re-render of the stack.

:::tip[No provider needed]
Unlike most Pyreon packages, toast does not use context. The shared signal store means `toast()` works from any module, including code that runs outside the component tree.
:::

## Imperative API — `toast()`

`toast(message, options?)` creates a toast and returns its **id** (a string). Pass the id to `toast.update()` or `toast.dismiss()` later.

```tsx
import { toast } from '@pyreon/toast'

// Basic toast — defaults to type "info"
const id = toast('Something happened')

// The id lets you update or dismiss it later
toast.dismiss(id)
```

The `message` accepts a plain string or any `VNodeChild` (an SVG, an `<Icon>`, a composed fragment), so you are not limited to text:

```tsx
toast(<span>Saved <strong>3 files</strong></span>)
```

### Preset variants

Five shortcuts set the `type` for you (and `toast.loading` also makes the toast persistent):

```tsx
toast.success('File uploaded')        // type: "success"
toast.error('Connection failed')      // type: "error"
toast.warning('Disk almost full')     // type: "warning"
toast.info('New version available')   // type: "info"

// Persistent loading toast (duration: 0 — no auto-dismiss)
const id = toast.loading('Uploading...')
```

Each preset takes the same `options` as `toast()` (minus `type`, which it sets). `toast.loading` additionally fixes `duration` to `0`, so its `options` omit both `type` and `duration`.

## Toast options

Every `toast()` call accepts an options object. The full `ToastOptions` shape:

```tsx
toast('Item deleted', {
  type: 'warning',
  duration: 8000,
  description: 'You can undo this for 30 seconds.',
  icon: <TrashIcon />,
  dismissible: true,
  action: {
    label: 'Undo',
    onClick: () => restoreItem(id),
  },
  onDismiss: () => console.log('gone'),
})
```

| Option        | Type                                          | Default            | Description                                                       |
| ------------- | --------------------------------------------- | ------------------ | ----------------------------------------------------------------- |
| `type`        | `'info' \| 'success' \| 'warning' \| 'error'` | `'info'`           | Toast variant — controls styling and live-region urgency.        |
| `duration`    | `number`                                      | Toaster's default (`4000`) | Auto-dismiss delay in ms. `0` = persistent (no auto-dismiss).     |
| `description` | `string \| VNodeChild`                        | —                  | Secondary line rendered under the message.                        |
| `icon`        | `VNodeChild`                                  | —                  | Leading icon (any VNode — an SVG, `<Icon>`, etc.).                |
| `dismissible` | `boolean`                                     | `true`             | Whether the toast shows a `×` dismiss button.                     |
| `action`      | `{ label: string; onClick: () => void }`      | —                  | Action button rendered beside the message (undo/retry patterns).  |
| `onDismiss`   | `() => void`                                  | —                  | Called when the toast is dismissed — manually, by the action, by timeout, or when evicted by the queue cap. |

:::note[There is no per-toast `position`]
Position is set on the `<Toaster />`, not per toast. `ToastOptions` has no `position` field — all toasts render in the Toaster's configured corner.
:::

### Description, icon, and action

A toast can carry a secondary line, a leading icon, and an action button at the same time:

```tsx
toast.success('Backup complete', {
  description: '2.4 GB · 1,204 files',
  icon: <CheckCircleIcon />,
  action: { label: 'View', onClick: () => openBackup() },
})
```

`description` and `icon` accept any `VNodeChild`, so the description can itself be rich markup. The icon, action, and dismiss button are read **once** when the toast mounts (they are immutable for a toast's lifetime); only `message`, `type`, `duration`, and `description` can change via `toast.update()`.

## Updating a toast — `toast.update()`

`toast.update(id, updates)` modifies an existing toast in place. You can change the `message`, `type`, `duration`, and `description`. Updating restarts the auto-dismiss timer using the new (or unchanged) duration.

```tsx
const id = toast.loading('Saving...')

try {
  await saveData()
  toast.update(id, { type: 'success', message: 'Done!', duration: 4000 })
} catch {
  toast.update(id, { type: 'error', message: 'Save failed' })
}
```

This is the canonical loading-to-result pattern: start a persistent loading toast, then promote it to success or error on completion. Because the update touches the same toast id, the visible toast morphs in place rather than appearing as a second notification.

:::warning[Update after dismiss is a no-op]
Once a toast has been auto-dismissed (or dismissed manually), its id is no longer in the store. Calling `toast.update()` with a stale id is silently ignored. Use `duration: 0` (e.g. via `toast.loading`) so a long-running operation's toast persists until you update it.
:::

## Promise pattern — `toast.promise()`

`toast.promise(promise, messages)` shows a persistent loading toast and auto-transitions it to success or error when the promise settles. It returns the **original promise** so you can chain or `await` it.

```tsx
toast.promise(saveDocument(), {
  loading: 'Saving...',
  success: 'Document saved!',
  error: 'Failed to save',
})
```

`success` and `error` can be functions that receive the resolved value / rejection reason, for dynamic messages:

```tsx
toast.promise(fetchUser(id), {
  loading: 'Loading user...',
  success: (user) => `Welcome, ${user.name}!`,
  error: (err) => `Error: ${err instanceof Error ? err.message : 'unknown'}`,
})
```

Because it returns the promise, you can keep using the result:

```tsx
const user = await toast.promise(fetchUser(id), {
  loading: 'Loading...',
  success: 'Loaded',
  error: 'Failed',
})
// `user` is the resolved value — the toast handling is transparent
```

:::warning[Pass a promise, not a function]
`toast.promise()` expects an already-started promise. Pass `fetchData()`, **not** `() => fetchData()`. A function never resolves, so the loading toast would persist forever.
:::

Under the hood, the loading toast is created with `duration: 0` (persistent) and then `update`d on settle to a success/error toast that uses the Toaster's default duration.

## Dismissing — `toast.dismiss()` (soft) and `toast.remove()` (hard)

```tsx
const id = toast('Dismissable')

toast.dismiss(id)   // SOFT: play the leave animation, then remove
toast.dismiss()     // soft-dismiss all toasts

toast.remove(id)    // HARD: remove instantly, no leave animation
toast.remove()      // hard-remove all toasts
```

`dismiss` is the default you want — the toast plays its CSS leave transition (fade + collapse in place) and is removed once the animation finishes; its siblings reflow up smoothly. `onDismiss` fires **immediately** in both cases, and the toast's auto-dismiss timer is cleared. This is the same `dismiss` (soft, animated) / `remove` (hard, instant) split react-hot-toast uses — reach for `remove` when you need a toast gone right now (replacing it, or tearing down on unmount).

Auto-dismiss (a toast's `duration` elapsing) goes through the soft `dismiss` path too, so timed-out toasts animate out the same way manual dismissals do.

## The Toaster component

`<Toaster />` is the render container. Mount it **once** at your app root. It renders the active stack into a Portal (a `<div>` host appended to `document.body`), injects its CSS once, runs the auto-dismiss timers, and manages pause-on-hover-and-focus.

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
        duration={5000}
      />
      <MyApp />
    </>
  )
}
```

### Toaster props

| Prop       | Type            | Default       | Description                                                                 |
| ---------- | --------------- | ------------- | --------------------------------------------------------------------------- |
| `position` | `ToastPosition` | `'top-right'` | Corner the stack renders in (see [Positions](#positions)).                  |
| `max`      | `number`        | `5`           | Maximum number of toasts shown at once — the most recent `max` are visible. |
| `gap`      | `number`        | `8`           | Gap between stacked toasts, in pixels.                                       |
| `offset`   | `number`        | `16`          | Distance from the viewport edge, in pixels.                                 |
| `duration` | `number`        | `4000`        | Default auto-dismiss duration (ms) for toasts that don't set their own. `0` makes toasts persistent by default. |

The `duration` prop sets the app-wide default that any toast without an explicit `duration` uses. Because the store is module-level, the Toaster writes this default on setup and `toast()` reads it for new toasts.

:::warning[Mount exactly one Toaster]
Mounting multiple `<Toaster />` instances causes toasts to render in all of them — visible duplicates. Render a single Toaster at the root.
:::

### Positions

`ToastPosition` is one of six corners:

```
'top-left'    | 'top-center'    | 'top-right'
'bottom-left' | 'bottom-center' | 'bottom-right'
```

Bottom positions stack in reverse (newest nearest the edge) so the freshest toast is always closest to its corner.

### The queue cap

The store caps the active stack at a hard limit (well above any sensible `max`). When the cap is exceeded — for example a runaway loop or a WebSocket surfacing every message as a toast — the **oldest** toast is evicted (its timer cleared and `onDismiss` fired) and the newest wins. Past a couple dozen visible toasts the user can't read them anyway, so this keeps memory and per-write cost bounded. The `max` prop controls how many are *visible*; the cap is a backstop against unbounded growth.

## Pause on hover and focus

Auto-dismiss timers pause when the pointer enters the toast region and resume when it leaves — so a toast won't vanish while the user is reading or reaching for its action button. The same applies to keyboard focus: tabbing into a toast (e.g. onto its close button) pauses the timers via the bubbling focus events, and they resume on blur. This is built into `<Toaster />` with no configuration.

The pause is precise: it tracks the remaining time, so a toast that was 1 second from dismissal still has 1 second left when the cursor leaves.

## Action buttons

Add an action button for undo/retry flows. The button renders beside the message and runs `onClick` when pressed:

```tsx
function deleteItem(item: Item) {
  removeFromList(item)
  toast('Item deleted', {
    type: 'warning',
    duration: 6000,
    action: {
      label: 'Undo',
      onClick: () => restoreToList(item),
    },
  })
}
```

A common pattern is to dismiss the toast inside the action so it disappears once the user acts:

```tsx
const id = toast('Message archived', {
  action: {
    label: 'Undo',
    onClick: () => {
      unarchive()
      toast.dismiss(id)
    },
  },
})
```

## Rich content

Because `message`, `description`, and `icon` all accept `VNodeChild`, toasts are not limited to plain strings:

```tsx
toast.info(<span>Updated to <code>v2.1.0</code></span>, {
  icon: <SparkleIcon />,
  description: <a href="/changelog">See what's new →</a>,
})
```

## Accessibility

Toast accessibility is **type-aware**, matching the urgency of the message:

- **Error and warning** toasts use `role="alert"` — an assertive live region that interrupts the screen reader to announce immediately.
- **Info and success** toasts use `role="status"` — a polite live region that announces at the next pause.

Each toast also sets `aria-atomic="true"` so the whole toast is announced as one unit. The role implies its own `aria-live`, so the **container does not** add `aria-live` — doing so would double-announce every toast. The container is a labeled landmark: `<section aria-label="Notifications">`. The dismiss button has `aria-label="Dismiss"`, and a decorative `icon` is hidden from assistive tech (`aria-hidden`).

An `info → error` update also upgrades the live-region urgency, because `role` is reactive to the toast's current type.

## Animation

Toasts animate on both enter and leave via CSS transitions — no external animation library. A new toast fades + slides in (`entering → visible`, promoted on the next frame). A dismissed toast fades and collapses in place (`--exiting`, `max-height → 0`) for ~200ms before it is removed, so its siblings reflow up smoothly rather than snapping. The store owns this timing (`dismiss` schedules the removal), so the leave still completes even without a mounted animation runtime. Use [`toast.remove()`](#dismissing--toastdismiss-soft-and-toastremove-hard) to skip the animation.

## Scope — deliberate non-goals

`@pyreon/toast` is signal-native, framework-integrated, and a11y-first — not a port of a React toast library. A few features common elsewhere are intentional non-goals:

- **Swipe-to-dismiss / draggable toasts** (sonner, react-toastify) — a touch-gesture affordance; use the `×` button (`dismissible`) or an `action`.
- **Collapsed stacking with hover-to-expand** (sonner's signature look) — an opinionated visual; `max` controls how many render at once.
- **Per-toast `position`** — position is a `<Toaster>` prop; mount two Toasters if you need two corners.

Rich/custom content is fully supported the idiomatic way: `message`, `description`, and `icon` all accept any `VNodeChild`.

## SSR

`<Toaster />` returns `null` on the server, so it is safe to include in SSR layouts — nothing renders until the client mounts. `toast()` calls during SSR are harmless: they write into the module-level signal, which is simply discarded server-side (no DOM, no Portal). Notifications begin rendering once the Toaster mounts on the client.

## TypeScript

All public types are exported from the package root:

```ts
import type {
  Toast,
  ToastOptions,
  ToastPosition,
  ToastType,
  ToasterProps,
  ToastPromiseOptions,
  ToastState,
} from '@pyreon/toast'
```

- `ToastType` — `'info' | 'success' | 'warning' | 'error'`
- `ToastPosition` — the six corner literals
- `ToastOptions` — the options object accepted by `toast()` and the preset variants
- `ToasterProps` — the `<Toaster />` props
- `ToastPromiseOptions<T>` — the `{ loading, success, error }` shape for `toast.promise()`, generic over the resolved value `T`
- `Toast` — the full internal toast record (id, message, type, state, timers, …)
- `ToastState` — the lifecycle phase: `'entering' | 'visible' | 'exiting'`

## Common mistakes

:::warning[Forgetting to render `<Toaster />`]
`toast()` creates the toast in the store, but with no `<Toaster />` mounted there is nowhere to render it. The toast is queued into the signal but stays invisible until a Toaster mounts. Render exactly one Toaster at your app root.
:::

:::warning[Conditionally rendering the Toaster]
If `<Toaster />` is unmounted (behind a condition), toasts created via `toast()` are queued but invisible. Keep the Toaster mounted for the app's lifetime.
:::

:::warning[Updating a dismissed toast]
`toast.update(id, …)` after the toast has auto-dismissed is a silent no-op — the id is no longer in the store. For long operations, start with `toast.loading()` (persistent) so the toast survives until you update it.
:::

:::warning[`toast.promise` with a function]
Pass the promise itself (`fetchData()`), not a thunk (`() => fetchData()`). A function never settles, so the loading toast would never transition.
:::

## API Reference

### `toast(message, options?)`

| Signature | Returns | Description |
| --------- | ------- | ----------- |
| `toast(message: string \| VNodeChild, options?: ToastOptions)` | `string` | Create a toast. Returns its id for later `update`/`dismiss`. Defaults to type `'info'`. |

The `toast` function also exposes these methods:

| Method | Signature | Returns | Description |
| ------ | --------- | ------- | ----------- |
| `toast.success` | `(message, options?: Omit<ToastOptions, 'type'>)` | `string` | Create a success toast. |
| `toast.error` | `(message, options?: Omit<ToastOptions, 'type'>)` | `string` | Create an error toast. |
| `toast.warning` | `(message, options?: Omit<ToastOptions, 'type'>)` | `string` | Create a warning toast. |
| `toast.info` | `(message, options?: Omit<ToastOptions, 'type'>)` | `string` | Create an info toast. |
| `toast.loading` | `(message, options?: Omit<ToastOptions, 'type' \| 'duration'>)` | `string` | Create a persistent (`duration: 0`) info toast. Returns its id for later `update`. |
| `toast.update` | `(id: string, updates: { message?, type?, duration?, description? })` | `void` | Modify an existing toast in place. Restarts its timer. No-op if the id is gone. |
| `toast.dismiss` | `(id?: string)` | `void` | **Soft**: dismiss one toast by id (or all) — plays the leave animation, then removes. Fires each toast's `onDismiss` immediately. |
| `toast.remove` | `(id?: string)` | `void` | **Hard**: remove one toast by id (or all) instantly, no leave animation. Fires `onDismiss` if the toast wasn't already dismissed. |
| `toast.promise` | `<T>(promise: Promise<T>, opts: ToastPromiseOptions<T>)` | `Promise<T>` | Show a loading toast that transitions to success/error on settle. Returns the original promise. |

### `<Toaster />`

| Signature | Returns | Description |
| --------- | ------- | ----------- |
| `Toaster(props?: ToasterProps)` | `VNodeChild` | Render container for the toast stack. Mount once at the app root. Returns `null` on the server. |

See [Toaster props](#toaster-props) for the full `ToasterProps` table.

### Types

| Type | Description |
| ---- | ----------- |
| `ToastOptions` | Options for `toast()` and presets — `type`, `duration`, `description`, `icon`, `dismissible`, `action`, `onDismiss`. |
| `ToasterProps` | `<Toaster />` props — `position`, `max`, `gap`, `offset`, `duration`. |
| `ToastPromiseOptions<T>` | `{ loading, success, error }` for `toast.promise()`. `success`/`error` may be functions of the resolved value / rejection reason. |
| `ToastType` | `'info' \| 'success' \| 'warning' \| 'error'`. |
| `ToastPosition` | `'top-left' \| 'top-center' \| 'top-right' \| 'bottom-left' \| 'bottom-center' \| 'bottom-right'`. |
| `Toast` | The full toast record stored internally (id, message, type, state, timers, …). |
| `ToastState` | Lifecycle phase: `'entering' \| 'visible' \| 'exiting'`. |
