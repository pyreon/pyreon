# Lifecycle Hooks

Nova provides four lifecycle hooks that let components respond to mount, unmount, update, and error events. All hooks must be called synchronously during component setup — the same restriction as React hooks, but for a different reason: Nova captures them from a component-local context that only exists during the initial function call.

## API Reference

| Hook | Signature | When it runs |
|---|---|---|
| `onMount` | `onMount(fn: () => void \| Cleanup): void` | After the component's DOM is inserted into the document |
| `onUnmount` | `onUnmount(fn: () => void): void` | Just before the component's DOM is removed |
| `onUpdate` | `onUpdate(fn: () => void): void` | After any reactive update within this component's subtree |
| `onErrorCaptured` | `onErrorCaptured(fn: (err: unknown) => boolean \| void): void` | When a descendant throws during rendering or in an effect |

## onMount

Runs once after the component is attached to the DOM. Safe to access DOM nodes and start subscriptions here.

```tsx
import { onMount } from "@pyreon/core"
import { signal } from "@pyreon/reactivity"

function Map() {
  let container: HTMLDivElement

  onMount(() => {
    const map = new MapLibrary(container, { zoom: 12 })
    return () => map.destroy()  // cleanup on unmount
  })

  return <div ref={el => (container = el)} style="height:400px" />
}
```

If `onMount` returns a function, that function is called when the component unmounts. This is the idiomatic cleanup pattern — equivalent to returning a cleanup from `useEffect` in React.

### Async onMount

You can use an async function, but the return value must be a cleanup function or `void`. Wrap async logic explicitly:

```tsx
function UserProfile({ id }: { id: number }) {
  const user = signal<User | null>(null)

  onMount(() => {
    const controller = new AbortController()

    fetch(`/api/users/${id}`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => user.set(data))
      .catch(err => {
        if (err.name !== "AbortError") console.error(err)
      })

    return () => controller.abort()
  })

  return (
    <div>
      {() => user() ? <p>{user()!.name}</p> : <p>Loading...</p>}
    </div>
  )
}
```

## onUnmount

Runs just before the component's DOM subtree is removed. Use for cleanup that does not require a DOM reference.

```tsx
import { onUnmount } from "@pyreon/core"

function Timer() {
  const elapsed = signal(0)
  const interval = setInterval(() => elapsed.update(n => n + 1), 1000)

  onUnmount(() => clearInterval(interval))

  return <span>Elapsed: {elapsed()}s</span>
}
```

Note: If you return a cleanup from `onMount`, Nova calls it on unmount automatically. `onUnmount` is for cleanup that is set up outside of `onMount` (e.g., a global subscription registered synchronously during setup).

## onUpdate

Runs after any reactive update settles within this component's DOM subtree. Useful for third-party libraries that need to re-measure the DOM after a change.

```tsx
import { onUpdate } from "@pyreon/core"

function AutoResizeTextarea() {
  let textarea: HTMLTextAreaElement
  const value = signal("")

  onUpdate(() => {
    // Called after the textarea's value attribute is updated in the DOM
    textarea.style.height = "auto"
    textarea.style.height = `${textarea.scrollHeight}px`
  })

  return (
    <textarea
      ref={el => (textarea = el)}
      value={value()}
      onInput={e => value.set((e.target as HTMLTextAreaElement).value)}
    />
  )
}
```

## onErrorCaptured

Catches errors thrown by descendant components during rendering or in effects. Return `true` to mark the error as handled and prevent it from propagating further up the tree.

```tsx
import { onErrorCaptured } from "@pyreon/core"
import { signal } from "@pyreon/reactivity"

function SafeWidget({ children }: { children: VNodeChild }) {
  const error = signal<Error | null>(null)

  onErrorCaptured(err => {
    error.set(err instanceof Error ? err : new Error(String(err)))
    return true  // stop propagation
  })

  return (
    <>
      {() => error()
        ? <div class="error">Something went wrong: {error()!.message}</div>
        : children
      }
    </>
  )
}
```

For declarative error boundaries, see [suspense.md](./suspense.md).

## Cleanup Pattern

The preferred pattern for any resource that needs cleanup is to return a cleanup function from `onMount`:

```tsx
function WebSocketFeed({ url }: { url: string }) {
  const messages = signal<string[]>([])

  onMount(() => {
    const ws = new WebSocket(url)

    ws.onmessage = evt => {
      messages.update(list => [...list, evt.data])
    }

    // Called when component unmounts
    return () => ws.close()
  })

  return (
    <ul>
      {() => messages().map(m => <li>{m}</li>)}
    </ul>
  )
}
```

## Combining Lifecycle Hooks

You can call multiple lifecycle hooks in a single component:

```tsx
function Analytics({ pageId }: { pageId: string }) {
  onMount(() => {
    analytics.pageView(pageId)
    console.log("mounted")
  })

  onUnmount(() => {
    analytics.pageLeave(pageId)
    console.log("unmounted")
  })

  onErrorCaptured(err => {
    analytics.error(err, pageId)
  })

  return <slot />
}
```

## Gotchas

**Hooks must be called synchronously during setup.**

```tsx
// Wrong — called inside setTimeout, outside setup phase
function Bad() {
  setTimeout(() => {
    onMount(() => console.log("mounted"))  // throws
  }, 0)
  return <div />
}

// Correct
function Good() {
  onMount(() => {
    setTimeout(() => console.log("after mount + 0ms"), 0)
  })
  return <div />
}
```

**`onUpdate` fires after every reactive flush, including the initial paint.** If you only want to run after subsequent updates, track a "mounted" flag:

```tsx
function AfterUpdate() {
  let mounted = false
  onMount(() => { mounted = true })
  onUpdate(() => {
    if (!mounted) return
    console.log("updated")
  })
  return <div />
}
```

**Effects vs lifecycle hooks.** For reactive side effects (e.g., logging whenever a signal changes), use `effect` rather than `onUpdate`. `onUpdate` is for post-DOM-update measurements and third-party integrations.
