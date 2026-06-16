# @pyreon/hooks

35 signal-based reactive utilities across seven categories for Pyreon apps.

A reactive-primitives library for the patterns Pyreon components reach for every day: controllable state, DOM observers, responsive layout, timing, interaction, and ref composition. Every hook is SSR-safe (browser-API access is guarded), auto-cleans on unmount (registers `onUnmount` for listeners / observers / timers), and signal-native (returns `Signal<T>` / `Computed<T>` / accessor objects — never plain values) so consumers compose directly with `effect` / `computed` without re-bridging. Used as the foundation by every `@pyreon/ui-primitives` component.

## Install

```bash
bun add @pyreon/hooks @pyreon/core @pyreon/reactivity
```

## Quick start

```tsx
import { signal } from '@pyreon/reactivity'
import { useControllableState, useClickOutside, useFocusTrap, useScrollLock } from '@pyreon/hooks'

function Modal(props: { open?: boolean; defaultOpen?: boolean; onOpenChange?: (v: boolean) => void }) {
  const [open, setOpen] = useControllableState({
    value: () => props.open,
    defaultValue: () => props.defaultOpen ?? false,
    onChange: props.onOpenChange,
  })

  const panelRef = signal<HTMLElement | null>(null)
  useClickOutside(() => panelRef(), () => setOpen(false))
  useFocusTrap(() => panelRef(), () => open())
  useScrollLock(() => open())

  return () =>
    open() ? (
      <div ref={panelRef.set} role="dialog">
        …
      </div>
    ) : null
}
```

## The full surface

35 hooks across 7 categories.

### State

| Hook | Signature | Notes |
|---|---|---|
| `useToggle(initial?)` | `() => { value: Signal<boolean>; toggle, setTrue, setFalse }` | Boolean state with helpers |
| `usePrevious(value)` | `Signal<T> → Signal<T \| undefined>` | Previous value across updates |
| `useLatest(value)` | `Signal<T> → { current: T }` | Always-current ref (escape hatch) |
| `useControllableState(opts)` | See manifest | Canonical controlled/uncontrolled pattern |

### DOM & observers

| Hook | Notes |
|---|---|
| `useEventListener(target, event, handler, options?)` | Auto-cleanup listener. `target` may be a getter for reactive refs. |
| `useClickOutside(ref, handler)` | Click-outside dismissal |
| `useFocus()` | `{ focused, onFocus, onBlur }` |
| `useHover()` | `{ hover, onMouseEnter, onMouseLeave }` |
| `useFocusTrap(ref, active)` | Tab/Shift-Tab trap while `active()` is true. Returns focus on deactivation. |
| `useElementSize(ref)` | `Signal<{ width, height }>` via `ResizeObserver` |
| `useWindowResize(debounceMs?)` | `() => { width, height }` debounced viewport size |
| `useScrollLock(active)` | Locks `<body>` scroll while `active()` is true |
| `useIntersection(ref, opts?)` | `IntersectionObserver` wrapper — exposes `{ entry }` |
| `useInfiniteScroll(onLoadMore, opts?)` | Sentinel-based infinite loading with `isLoading` gate |

### Responsive

| Hook | Notes |
|---|---|
| `useBreakpoint()` | Theme-driven active-breakpoint flags |
| `useMediaQuery(query)` | Raw CSS media-query escape hatch |
| `useColorScheme()` | `Signal<'light' \| 'dark'>` from `prefers-color-scheme` |
| `useReducedMotion()` | `Signal<boolean>` from `prefers-reduced-motion` |
| `useThemeValue(path)` | Reactive theme lookup by path |
| `useSpacing(value)` | Reactive theme-spacing accessor |
| `useRootSize()` | Reactive `<html>` font-size for `rem` math |

### Timing

| Hook | Notes |
|---|---|
| `useDebouncedValue(source, delayMs)` | Debounced `Signal<T>` |
| `useDebouncedCallback(fn, delayMs)` | Debounced function call |
| `useThrottledCallback(fn, delayMs)` | Throttled function call |
| `useInterval(fn, delayMs)` | SSR-safe interval with auto-cleanup |
| `useTimeout(fn, delayMs)` | SSR-safe timeout with auto-cleanup |
| `useTimeAgo(date, opts?)` | Auto-updating "5 minutes ago" |

### Interaction

| Hook | Notes |
|---|---|
| `useClipboard(timeoutMs?)` | `{ copy, copied }` — `copied` auto-resets after 2s |
| `useDialog()` | Native `<dialog>` wrapper with reactive `isOpen` / `returnValue` |
| `useKeyboard(key, handler)` | Single-key listener |
| `useOnline()` | `Signal<boolean>` from `navigator.onLine` |

### Data

| Hook | Notes |
|---|---|
| `useFetch<T>(url)` | Thin reactive JSON fetch — `{ data, error, isPending, refetch }`. Aborts in-flight requests on refetch/unmount. The web half of the multiplatform `useFetch` contract (PMTC compiles the same call to native `PyreonFetch` containers on iOS/Android). No cache/dedup/retries — use `@pyreon/query` for those |

### Composition

| Hook | Notes |
|---|---|
| `useMergedRef(...refs)` | Combine multiple refs into one callback ref |
| `useUpdateEffect(fn, deps)` | Effect that skips the first run |
| `useIsomorphicLayoutEffect(fn)` | Layout-phase on client, no-op on server |

## `useControllableState` — the canonical pattern

Every `@pyreon/ui-primitives` component uses this. Reimplementing the `isControlled + signal + getter` shape by hand was the #1 anti-pattern across primitives before the helper landed.

```tsx
function MyToggle(props: {
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (v: boolean) => void
}) {
  const [checked, setChecked] = useControllableState({
    value: () => props.checked, // function so signal reads track
    defaultValue: () => props.defaultChecked ?? false,
    onChange: props.onChange,
  })
  return (
    <button onClick={() => setChecked(!checked())}>{() => (checked() ? 'on' : 'off')}</button>
  )
}
```

Pass `value` and `defaultValue` as functions — a plain value loses controlled/uncontrolled detection on prop changes.

## Gotchas

- **Every hook returns a signal or accessor**, never a plain value. Read by calling: `size().width`, `bp().md`, `online()`.
- **Every hook is SSR-safe**. Do NOT wrap hook calls in `if (typeof window !== 'undefined')` — the hook does it for you, and your wrapper would skip SSR-rendered shell registration.
- **Never reach for `addEventListener` / `removeEventListener` directly in primitives** — use `useEventListener`. Same for observers (`useIntersection` / `useElementSize`) and timers (`useInterval` / `useTimeout`). The cleanup is the hook's job.
- **`useBreakpoint` reads the theme**, `useMediaQuery` is raw — the former for layout decisions tied to the design system, the latter for one-off queries like `(prefers-contrast: more)`.
- **`useFocusTrap` requires a reactive `active` boolean** — a static `true` traps focus forever. Always pass `() => isOpen()`.
- **`useInfiniteScroll` sentinel must live inside the scrollable container** — `overflow: hidden` with no scroll means `IntersectionObserver` never fires.
- **`useDialog`** — the `<dialog>` must be present in the initial render (not gated behind `<Show>`) so the ref callback fires before `dialog.open()`.
- **`useDebouncedValue`** — the debounced signal still holds the OLD value during the debounce window. Effects downstream of it are correct; imperative reads in the same tick are stale.
- **`useWindowResize` signature changed from the vitus-labs original**: returns a `() => WindowSize` getter rather than a destructurable object, and debounces rather than throttles.

## Documentation

Full docs: [pyreon.dev/docs/hooks](https://pyreon.dev/docs/hooks) (or `docs/src/content/docs/hooks.md` in this repo).

## License

MIT
