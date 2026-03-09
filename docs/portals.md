# Portals

A `Portal` renders its children into a different DOM node than the one in the component tree. This is useful for modals, tooltips, dropdowns, and other UI elements that need to visually escape their parent's overflow or z-index stacking context.

## API Reference

| Prop | Type | Description |
|---|---|---|
| `mount` | `Element` | The DOM element to render children into |
| `children` | `VNodeChild` | Content to render in the target element |

## Basic Usage

```tsx
import { Portal } from "@pyreon/core"

function Modal({ open, onClose }: { open: () => boolean; onClose: () => void }) {
  return (
    <Portal mount={document.body}>
      {() =>
        open() ? (
          <div class="modal-backdrop" onClick={onClose}>
            <div class="modal" onClick={e => e.stopPropagation()}>
              <button onClick={onClose}>Close</button>
              <p>Modal content</p>
            </div>
          </div>
        ) : null
      }
    </Portal>
  )
}
```

The `Modal` component can be placed anywhere in the component tree. Its DOM output is appended to `document.body`, ensuring it sits above all other content regardless of CSS positioning.

## Custom Target

```tsx
const notificationRoot = document.getElementById("notifications")!

function Notification({ message }: { message: string }) {
  return (
    <Portal mount={notificationRoot}>
      <div class="toast">{message}</div>
    </Portal>
  )
}
```

## Tooltip Pattern

```tsx
function Tooltip({ anchor, content }: {
  anchor: () => DOMRect | null
  content: string
}) {
  return (
    <Portal mount={document.body}>
      {() => {
        const rect = anchor()
        if (!rect) return null

        const style = `
          position: fixed;
          top: ${rect.bottom + 8}px;
          left: ${rect.left}px;
        `

        return <div class="tooltip" style={style}>{content}</div>
      }}
    </Portal>
  )
}

function Button() {
  const rect = signal<DOMRect | null>(null)
  let el: HTMLButtonElement

  return (
    <>
      <button
        ref={e => (el = e)}
        onMouseEnter={() => rect.set(el.getBoundingClientRect())}
        onMouseLeave={() => rect.set(null)}
      >
        Hover me
      </button>
      <Tooltip anchor={rect} content="This is a tooltip" />
    </>
  )
}
```

## Context Preservation

Even though the Portal renders into a different DOM node, it is still part of the Nova component tree. Context provided above the Portal is available to components inside it.

```tsx
const ThemeCtx = createContext({ primary: "#0070f3" })

function App() {
  return (
    <ThemeCtx.Provider value={{ primary: "#6200ee" }}>
      <Portal mount={document.body}>
        {/* ThemeCtx is still accessible here */}
        <ThemedModal />
      </Portal>
    </ThemeCtx.Provider>
  )
}
```

## Lifecycle

The Portal's children follow the same lifecycle as the Portal component itself. When the Portal unmounts (e.g., because it is conditionally rendered), its children are removed from the target DOM node and their `onUnmount` hooks run.

```tsx
function App() {
  const showModal = signal(false)

  return (
    <div>
      <button onClick={() => showModal.set(true)}>Open</button>
      {() =>
        showModal() ? (
          <Portal mount={document.body}>
            <Modal onClose={() => showModal.set(false)} />
          </Portal>
        ) : null
      }
    </div>
  )
}
```

## Using h() Without JSX

```ts
import { Portal, h } from "@pyreon/core"

h(Portal, { mount: document.body },
  h("div", { class: "modal" }, "Hello from portal")
)
```

## Gotchas

**The target element must exist when the Portal mounts.** If `mount` is `null` or `undefined`, Nova throws at mount time.

```tsx
// Wrong — querySelector may return null
<Portal mount={document.querySelector(".target")}>
```

```tsx
// Correct — assert or guard
const target = document.querySelector(".target")
if (!target) throw new Error("Portal target not found")
<Portal mount={target}>
```

**Events do not bubble through the DOM tree — they bubble through the Nova component tree.** If you attach a click handler to a parent component that wraps a Portal, it will not receive click events from inside the Portal via DOM event bubbling (because the Portal DOM is attached to a different node). Handle this explicitly.

**Multiple Portals to the same target render in mount order.** Nova appends Portal children to the target element in the order the Portals mount. If you need explicit ordering (e.g., z-index layers), use separate target elements or manage `z-index` via CSS.
