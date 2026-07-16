# @pyreon/hooks

46 signal-based reactive utilities across seven categories for Pyreon apps.

A reactive-primitives library for the patterns Pyreon components reach for every day: controllable state, DOM observers, responsive layout, timing, interaction, and ref composition. Every hook is SSR-safe (browser-API access is guarded), auto-cleans on unmount (registers `onUnmount` for listeners / observers / timers), and signal-native (returns `Signal<T>` / `Computed<T>` / accessor objects — never plain values) so consumers compose directly with `effect` / `computed` without re-bridging. Used as the foundation by every `@pyreon/ui-primitives` component.

## Install

```bash
bun add @pyreon/hooks @pyreon/core @pyreon/reactivity
```

## Quick start

```tsx
import { effect, signal } from '@pyreon/reactivity'
import {
  useControllableState,
  useClickOutside,
  useEventListener,
  useFocusTrap,
  useScrollLock,
} from '@pyreon/hooks'

function Modal(props: { open?: boolean; defaultOpen?: boolean; onOpenChange?: (v: boolean) => void }) {
  const [open, setOpen] = useControllableState({
    value: () => props.open,
    defaultValue: props.defaultOpen ?? false,
    onChange: props.onOpenChange,
  })

  const panelRef = signal<HTMLElement | null>(null)
  const scroll = useScrollLock()
  useClickOutside(() => panelRef(), () => setOpen(false))
  // Live-gated on the ref (null => inert). `initialFocus` moves focus to the
  // first field on open; `active` can arm/disarm without unmounting.
  useFocusTrap(() => panelRef(), { active: () => open(), initialFocus: true })
  useEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false)
  })
  effect(() => (open() ? scroll.lock() : scroll.unlock()))

  return () =>
    open() ? (
      <div ref={panelRef.set} role="dialog">
        …
      </div>
    ) : null
}
```

## The full surface

46 hooks across 7 categories.

### State

| Hook | Signature | Notes |
|---|---|---|
| `useToggle(initial?)` | `() => { value: Signal<boolean>; toggle, setTrue, setFalse }` | Boolean state with helpers |
| `useCounter(initial?, opts?)` | `() => { count: Signal<number>; inc, dec, set, reset }` | Numeric counter, optional `min`/`max` clamp |
| `usePrevious(value)` | `Signal<T> → Signal<T \| undefined>` | Previous value across updates |
| `useLatest(value)` | `Signal<T> → { current: T }` | Always-current ref (escape hatch) |
| `useControllableState(opts)` | See manifest | Canonical controlled/uncontrolled pattern |

### DOM & observers

| Hook | Notes |
|---|---|
| `useEventListener(event, handler, options?, target?)` | Auto-cleanup listener. `target` getter defaults to `window`, resolved once at setup. |
| `useClickOutside(ref, handler)` | Click-outside dismissal |
| `useFocus()` | `{ focused, props: { onFocus, onBlur } }` |
| `useHover()` | `{ hovered, props: { onMouseEnter, onMouseLeave } }` |
| `useFocusTrap(ref, options?)` | Tab/Shift-Tab trap inside `ref()`. Inert while `ref()` is null. Optional `{ active, initialFocus }` (or a positional `active` getter): arm reactively + move focus in on open. Spec-grade focusable query (contenteditable / media / hidden-filtering / tabindex order). Pair with `useFocusReturn` for return-on-close. |
| `useFocusReturn(isOpen, opts?)` | Restore focus to the trigger when `isOpen()` flips false |
| `useElementSize(ref)` | `Signal<{ width, height }>` via `ResizeObserver` |
| `useWindowResize(debounceMs?)` | `() => { width, height }` debounced viewport size |
| `useWindowScroll()` | `{ position: () => { x, y }; scrollTo }` — reactive scroll offset |
| `useScrollLock()` | `{ lock, unlock }` — refcounted `<body>` scroll lock |
| `useIntersection(ref, opts?)` | `IntersectionObserver` wrapper — exposes `{ entry }` |
| `useInfiniteScroll(onLoadMore, opts?)` | Sentinel-based infinite loading with `isLoading` gate |

### Responsive

| Hook | Notes |
|---|---|
| `useBreakpoint()` | Theme-driven active-breakpoint flags |
| `useMediaQuery(query)` | Raw CSS media-query escape hatch |
| `useColorScheme()` | `Signal<'light' \| 'dark'>` from `prefers-color-scheme` |
| `useSizeClass()` | `() => 'compact' \| 'regular'` horizontal size class (`min-width: 600px`); PMTC lowers to iOS `@Environment(\.horizontalSizeClass)` / Android `LocalConfiguration` width |
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
| `useClipboard(opts?)` | `{ copy, copied, text }` — `copy` resolves `true`/`false`; `copied` auto-resets after `opts.timeout` (2s) |
| `useHaptics()` | `{ impact, notification, selection }` — fire-and-forget device haptics; web `navigator.vibrate`, iOS/Android via PMTC (`@pyreon/native-*`). Coarser on web/Android than iOS |
| `useShare()` | `{ text, url, textUrl, canShare }` — open the platform share sheet; web Web Share API, iOS `UIActivityViewController` / Android `Intent.ACTION_SEND` via PMTC. Android shares URLs as text |
| `useLinking()` | `{ openUrl }` — open an external URL in the platform browser; web `window.open`, iOS `UIApplication.open` / Android `Intent.ACTION_VIEW` via PMTC |
| `useNotifications()` | `{ notify, requestPermission }` — post a LOCAL notification; web Notification API, iOS `UNUserNotificationCenter` / Android `NotificationManager` + channel via PMTC. Distinct from remote push |
| `useDialog(opts?)` | Native `<dialog>` wrapper — `open` signal + `show`/`showModal`/`close`/`toggle`/`ref` |
| `useKeyboard(key, handler)` | Single-key listener |
| `useOnline()` | `Signal<boolean>` from `navigator.onLine` |
| `useDocumentVisibility()` | `() => 'visible' \| 'hidden'` from the Page Visibility API |
| `useIdle(timeoutMs?, opts?)` | `Signal<boolean>` — true after `timeoutMs` of no activity |

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
    value: () => props.checked, // controlled — a FUNCTION so the signal read tracks
    defaultValue: props.defaultChecked ?? false, // uncontrolled initial — a plain value
    onChange: props.onChange,
  })
  return (
    <button onClick={() => setChecked(!checked())}>{checked() ? 'on' : 'off'}</button>
  )
}
```

Pass `value` as a function (`() => props.checked`) so the controlled read tracks reactively. `defaultValue` is a plain value — the uncontrolled initial, captured once.

## Gotchas

- **Every hook returns a signal or accessor**, never a plain value. Read by calling: `size().width`, `bp().md`, `online()`.
- **Every hook is SSR-safe**. Do NOT wrap hook calls in `if (typeof window !== 'undefined')` — the hook does it for you, and your wrapper would skip SSR-rendered shell registration.
- **Never reach for `addEventListener` / `removeEventListener` directly in primitives** — use `useEventListener`. Same for observers (`useIntersection` / `useElementSize`) and timers (`useInterval` / `useTimeout`). The cleanup is the hook's job.
- **`useBreakpoint` reads the theme**, `useMediaQuery` is raw — the former for layout decisions tied to the design system, the latter for one-off queries like `(prefers-contrast: more)`.
- **`useFocusTrap(getEl, options?)` gates on the ref OR an `active` flag** — the getter is read live on every Tab, so the trap is inert while `getEl()` returns `null`; render the trapped element conditionally (a `<Show>` / reactive accessor) and it turns on/off with it. For an element you keep mounted, pass `{ active: () => isOpen() }` (or the positional shorthand `useFocusTrap(getEl, () => isOpen())`) to disarm the listener without unmounting. By default the trap does NOT move focus — pass `{ initialFocus: true }` (or a selector / element / getter) to focus the first field on activation. For return-on-close focus, add `useFocusReturn(() => isOpen())`.
- **`useInfiniteScroll` sentinel must live inside the scrollable container** — `overflow: hidden` with no scroll means `IntersectionObserver` never fires.
- **`useDialog`** — the `<dialog>` must be present in the initial render (not gated behind `<Show>`) so the ref callback fires before `dialog.open()`.
- **`useDebouncedValue`** — the debounced signal still holds the OLD value during the debounce window. Effects downstream of it are correct; imperative reads in the same tick are stale.
- **`useWindowResize` signature changed from the vitus-labs original**: returns a `() => WindowSize` getter rather than a destructurable object, and debounces rather than throttles.

## Documentation

Full docs: [pyreon.dev/docs/hooks](https://pyreon.dev/docs/hooks) (or `docs/src/content/docs/hooks.md` in this repo).

## License

MIT
