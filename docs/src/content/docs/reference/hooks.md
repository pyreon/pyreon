---
title: "Signal-Based Hooks — API Reference"
description: "35 signal-based hooks: state (useToggle/usePrevious/useLatest/useControllableState), DOM (useEventListener/useClickOutside/useFocus/useHover/useFocusTrap/useEle"
---

# @pyreon/hooks — API Reference

> **Generated** from `hooks`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [hooks](/docs/hooks).

Signal-based hooks for Pyreon — 35 reactive primitives covering state, DOM, responsive, timing, interaction, data, and composition. Every hook is SSR-safe (browser API access guarded), self-cleaning (registers `onUnmount` for listeners/observers/timers), and signal-native: hooks return `Signal<T>` / `Computed<T>` accessors, never plain values, so consumers compose with `effect`/`computed` without re-bridging. `useControllableState` is the canonical controlled/uncontrolled pattern used by every `@pyreon/ui-primitives` component — never reimplement the `isControlled + signal + getter` shape by hand.

## Features

- 35 signal-based hooks across 7 categories
- State: useToggle, usePrevious, useLatest, useControllableState
- DOM: useEventListener, useClickOutside, useFocus, useHover, useFocusTrap, useElementSize, useWindowResize, useScrollLock, useIntersection, useInfiniteScroll
- Responsive: useBreakpoint, useMediaQuery, useColorScheme, useReducedMotion, useThemeValue, useSpacing, useRootSize
- Timing: useDebouncedValue, useDebouncedCallback, useThrottledCallback, useInterval, useTimeout, useTimeAgo
- Interaction: useClipboard, useDialog, useKeyboard, useOnline
- Data: useFetch — thin reactive JSON fetch (&#123; data, error, isPending, refetch &#125;); the web half of the multiplatform useFetch contract
- Composition: useMergedRef, useUpdateEffect, useIsomorphicLayoutEffect
- Every hook is SSR-safe and auto-cleans on unmount
- Signal-native return shapes — compose with `effect` / `computed` without re-bridging

## Complete example

A full, end-to-end usage of the package:

```tsx
import {
  // State
  useToggle, usePrevious, useLatest, useControllableState,
  // DOM
  useEventListener, useClickOutside, useFocus, useHover, useFocusTrap,
  useElementSize, useWindowResize, useScrollLock, useIntersection, useInfiniteScroll,
  // Responsive
  useBreakpoint, useMediaQuery, useColorScheme, useReducedMotion, useThemeValue, useSpacing, useRootSize,
  // Timing
  useDebouncedValue, useDebouncedCallback, useThrottledCallback, useInterval, useTimeout, useTimeAgo,
  // Interaction
  useClipboard, useDialog, useKeyboard, useOnline,
  // Composition
  useMergedRef, useUpdateEffect, useIsomorphicLayoutEffect,
} from '@pyreon/hooks'

// 1. useControllableState — canonical controlled / uncontrolled pattern.
//    Every @pyreon/ui-primitives component uses it. Never reimplement
//    the `isControlled + signal + getter` shape by hand.
function MyToggle(props: { checked?: boolean; defaultChecked?: boolean; onChange?: (v: boolean) => void }) {
  const [checked, setChecked] = useControllableState({
    value: () => props.checked,            // controlled — function so signal reads track
    defaultValue: () => props.defaultChecked ?? false,
    onChange: props.onChange,
  })
  return <button onClick={() => setChecked(!checked())}>{checked() ? 'on' : 'off'}</button>
}

// 2. DOM listeners — auto-cleanup on unmount.
useEventListener(window, 'resize', () => layoutSig.set(measure()))
useClickOutside(panelRef, () => setOpen(false))

// 3. Element observers.
const size = useElementSize(boxRef)        // Signal<{ width, height }>
const visible = useIntersection(targetRef, { threshold: 0.5 })  // Signal<boolean>
useInfiniteScroll(() => loadMore(), { rootMargin: '200px' })

// 4. Focus management for modals / drawers.
useFocusTrap(modalRef, () => isOpen())     // traps Tab inside the ref while signal is true
useScrollLock(() => isOpen())              // locks <body> scroll while signal is true

// 5. Responsive — driven by theme breakpoints, NOT raw media queries.
const bp = useBreakpoint()                 // Signal<{ xs, sm, md, lg, xl }> active breakpoint flags
const isMobile = useMediaQuery('(max-width: 640px)')
const colorScheme = useColorScheme()       // Signal<'light' | 'dark'> from prefers-color-scheme
const motion = useReducedMotion()          // Signal<boolean> from prefers-reduced-motion

// 6. Timing — debounced/throttled signals + callbacks.
const search = signal('')
const debounced = useDebouncedValue(search, 300)   // Signal<string> — only updates after 300ms idle
const onSearch = useDebouncedCallback((q: string) => fetchResults(q), 300)
useInterval(() => poll(), 1000)            // SSR-safe, auto-cleans
const sent = useTimeAgo(message.sentAt)    // Signal<string> "5 minutes ago", auto-updates

// 7. Clipboard / dialog / online status — wraps the browser quirks.
const { copy, copied } = useClipboard()    // `copied` auto-resets after 2s
copy('hello')
const dialog = useDialog()                 // native <dialog> with open/close/returnValue
const online = useOnline()                 // Signal<boolean>

// 8. Composition primitives.
const merged = useMergedRef(localRef, props.ref)   // forward ref + capture local
useUpdateEffect(() => save(value()), [value])      // skips first run (mount-only effect)
useIsomorphicLayoutEffect(() => measure())          // useLayoutEffect on client, no-op on SSR
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`useControllableState`](#usecontrollablestate) | hook | Canonical controlled/uncontrolled state pattern. |
| [`useEventListener`](#useeventlistener) | hook | Register a DOM event listener with automatic cleanup on unmount. |
| [`useClickOutside`](#useclickoutside) | hook | Fire a callback when the user clicks outside the referenced element. |
| [`useElementSize`](#useelementsize) | hook | Reactive element size via `ResizeObserver`. |
| [`useFocusTrap`](#usefocustrap) | hook | Trap Tab/Shift+Tab focus inside the referenced element while `active()` is true. |
| [`useBreakpoint`](#usebreakpoint) | hook | Reactive breakpoint flags driven by the **theme**, not raw media queries — reads `theme.breakpoints` so swapping themes  |
| [`useDebouncedValue`](#usedebouncedvalue) | hook | Returns a debounced signal that only updates after `delayMs` of source-signal idle. |
| [`useFetch`](#usefetch) | hook | Thin reactive JSON fetch matching the multiplatform `useFetch<T>(url)` contract — the SAME call in a shared `.tsx` compi |
| [`useClipboard`](#useclipboard) | hook | `navigator.clipboard.writeText` wrapped with a reactive `copied` flag that auto-resets after `timeoutMs` (default 2000). |
| [`useDialog`](#usedialog) | hook | Native `<dialog>` element wrapper with reactive `isOpen` / `returnValue` signals. |
| [`useTimeAgo`](#usetimeago) | hook | Reactive "5 minutes ago" / "in 2 hours" relative-time string. |
| [`useInfiniteScroll`](#useinfinitescroll) | hook | `IntersectionObserver`-based infinite loading. |
| [`useMergedRef`](#usemergedref) | hook | Combine multiple refs into a single callback ref — used when forwarding `props.ref` while also keeping a local ref to th |
| [`useUpdateEffect`](#useupdateeffect) | hook | Like `effect` but skips the initial run — only fires when one of the tracked signals updates *after* mount. |
| [`useIsomorphicLayoutEffect`](#useisomorphiclayouteffect) | hook | Runs a layout-phase effect on the client (synchronous, before paint) and a no-op on the server. |

## API

### useControllableState `hook`

```ts
<T>(opts: { value?: () => T | undefined; defaultValue: () => T; onChange?: (v: T) => void }) => [Signal<T>, (v: T) => void]
```

Canonical controlled/uncontrolled state pattern. Returns a `[value, setValue]` tuple where the setter respects controlled mode (calls `onChange` only if controlled, mutates internal signal if uncontrolled). Used by every primitive in `@pyreon/ui-primitives`. Never reimplement the `isControlled + signal + getter` shape by hand. `value` and `defaultValue` are FUNCTIONS so signal reads track reactively — passing a plain value loses controlled/uncontrolled detection on prop changes.

**Example**

```tsx
function MyToggle(props: { checked?: boolean; defaultChecked?: boolean; onChange?: (v: boolean) => void }) {
  const [checked, setChecked] = useControllableState({
    value: () => props.checked,
    defaultValue: () => props.defaultChecked ?? false,
    onChange: props.onChange,
  })
  return <button onClick={() => setChecked(!checked())}>{checked() ? 'on' : 'off'}</button>
}
```

**Common mistakes**

- Passing `value: props.checked` (not a function) — loses reactivity on prop changes
- Mutating the returned signal directly with `.set()` instead of using the returned setter — bypasses the controlled-mode check

**See also:** `useToggle` · `usePrevious`

---

### useEventListener `hook`

```ts
(target: EventTarget | (() => EventTarget | null), event: string, handler: EventListener, options?: AddEventListenerOptions) => void
```

Register a DOM event listener with automatic cleanup on unmount. Use this instead of raw `addEventListener` in primitives — never `addEventListener` / `removeEventListener` directly in component code (the cleanup is the hook's whole job). `target` may be a getter so reactive refs (`() => buttonRef()`) re-bind when the underlying element changes.

**Example**

```tsx
useEventListener(window, 'resize', () => layoutSig.set(measure()))
useEventListener(() => panelRef(), 'keydown', (e) => {
  if (e.key === 'Escape') setOpen(false)
})
```

**Common mistakes**

- Using raw `addEventListener` instead of `useEventListener` — you lose automatic `onUnmount` cleanup
- Passing a static `window` / `document` when the target might not exist on SSR — `useEventListener` handles SSR-safe registration internally, but the target must be resolvable at `onMount` time

**See also:** `useClickOutside` · `useKeyboard`

---

### useClickOutside `hook`

```ts
(ref: () => HTMLElement | null, handler: (e: MouseEvent) => void) => void
```

Fire a callback when the user clicks outside the referenced element. Foundation for click-to-dismiss popovers, dropdowns, modals. Pair with `useFocusTrap` + `useScrollLock` for the full modal package.

**Example**

```tsx
useClickOutside(() => panelRef(), () => setOpen(false))
```

**Common mistakes**

- Attaching to a ref that encompasses the entire viewport — every click anywhere except the ref itself triggers the handler; use a more specific ref (the popover panel, not the whole page)

**See also:** `useFocusTrap` · `useScrollLock` · `useDialog`

---

### useElementSize `hook`

```ts
(ref: () => HTMLElement | null) => Signal<{ width: number; height: number }>
```

Reactive element size via `ResizeObserver`. Returns `Signal<{ width, height }>` that updates whenever the observed element resizes. SSR-safe (returns `{ width: 0, height: 0 }` until mount).

**Example**

```tsx
const size = useElementSize(() => boxRef())
effect(() => console.log('Box is', size().width, 'x', size().height))
```

**See also:** `useWindowResize` · `useRootSize`

---

### useFocusTrap `hook`

```ts
(ref: () => HTMLElement | null, active: () => boolean) => void
```

Trap Tab/Shift+Tab focus inside the referenced element while `active()` is true. Required for modals / drawers / fullscreen overlays to be keyboard-accessible. Returns focus to the previously-focused element on deactivation.

**Example**

```tsx
const isOpen = signal(false)
useFocusTrap(() => modalRef(), () => isOpen())
useScrollLock(() => isOpen())
```

**Common mistakes**

- Forgetting the second argument `active` — always pass a reactive boolean (`() => isOpen()`) so the trap deactivates when the modal closes; a static `true` traps focus forever
- Using on an element that isn't rendered yet — the ref getter must return the element at the time `active` becomes true; pair with a `<Show>` or reactive accessor that mounts the element first

**See also:** `useScrollLock` · `useDialog` · `useClickOutside`

---

### useBreakpoint `hook`

```ts
() => Signal<{ xs: boolean; sm: boolean; md: boolean; lg: boolean; xl: boolean }>
```

Reactive breakpoint flags driven by the **theme**, not raw media queries — reads `theme.breakpoints` so swapping themes (or unit systems) Just Works. Use `useMediaQuery` for one-off arbitrary queries.

**Example**

```tsx
const bp = useBreakpoint()
{() => bp().md ? <DesktopNav /> : <MobileNav />}
```

**Common mistakes**

- Using `useBreakpoint` for a one-off media query like `(prefers-contrast: more)` — `useBreakpoint` reads theme breakpoints only; use `useMediaQuery` for arbitrary media queries

**See also:** `useMediaQuery` · `useThemeValue`

---

### useDebouncedValue `hook`

```ts
<T>(source: Signal<T> | (() => T), delayMs: number) => Signal<T>
```

Returns a debounced signal that only updates after `delayMs` of source-signal idle. Use for search-as-you-type, filter inputs, anywhere downstream effects shouldn't fire on every keystroke. The PAIR — `useDebouncedCallback` — debounces a function call instead of a value.

**Example**

```tsx
const search = signal('')
const debouncedSearch = useDebouncedValue(search, 300)
effect(() => fetchResults(debouncedSearch()))
```

**Common mistakes**

- Reading the debounced signal immediately after setting the source — it still holds the OLD value during the debounce window; effects downstream of the debounced signal are correct, but imperative reads in the same tick are stale

**See also:** `useDebouncedCallback` · `useThrottledCallback`

---

### useFetch `hook`

```ts
<T>(url: string) => { data: Signal<T | undefined>; error: Signal<unknown>; isPending: Signal<boolean>; refetch: () => void }
```

Thin reactive JSON fetch matching the multiplatform `useFetch<T>(url)` contract — the SAME call in a shared `.tsx` compiles to native `PyreonFetch<T>` containers on iOS (URLSession `.task {}`) and Android (`LaunchedEffect` + kotlinx-serialization) via PMTC, while this runs on web. Fires once at component setup (client only — SSR renders the not-yet-loaded state); each `refetch()` aborts the previous in-flight request so a slow stale response can never clobber a fresh one; unmount aborts too. Deliberately thinner than `@pyreon/query`: no cache, no dedup, no retries.

**Example**

```tsx
type Quote = { id: number; text: string }
const quotes = useFetch<Quote[]>('/api/quotes.json')
<Show when={quotes.isPending}><Text>Loading…</Text></Show>
<For each={() => quotes.data() ?? []} by={(q) => q.id}>{(q) => <Text>{q.text}</Text>}</For>
```

**Common mistakes**

- Reading `quotes.data` without calling it in non-JSX code — the fields are Signals; `quotes.data()` reads the value. In JSX child position the bare signal works (accessor children render reactively)
- Expecting data during SSR — the fetch only runs client-side; server HTML renders the `undefined`-data state and the request fires after hydration
- Using a reactive/computed URL — v1 takes a plain string captured once (PMTC requires a string literal for native emit anyway); call `refetch()` for manual re-runs, or use `@pyreon/query` for signal-driven keys
- Reaching for useFetch when you need caching, request dedup, retries, or mutations — that is `@pyreon/query` (TanStack) territory; useFetch is the thin multiplatform primitive
- Forgetting the non-2xx contract — HTTP errors land in `error()` as `[Pyreon] useFetch <url>: HTTP <status>`, they do NOT throw

**See also:** `useOnline`

---

### useClipboard `hook`

```ts
(timeoutMs?: number) => { copy: (text: string) => Promise<void>; copied: Signal<boolean> }
```

`navigator.clipboard.writeText` wrapped with a reactive `copied` flag that auto-resets after `timeoutMs` (default 2000). Use the `copied` signal to flash a "Copied!" UI cue without manual timer management.

**Example**

```tsx
const { copy, copied } = useClipboard()
<button onClick={() => copy(token)}>{copied() ? 'Copied!' : 'Copy'}</button>
```

**See also:** `useDialog` · `useOnline`

---

### useDialog `hook`

```ts
() => { ref: (el: HTMLDialogElement | null) => void; open: () => void; close: (returnValue?: string) => void; isOpen: Signal<boolean>; returnValue: Signal<string> }
```

Native `<dialog>` element wrapper with reactive `isOpen` / `returnValue` signals. Handles `showModal()` / `close()` plumbing and the `cancel`/`close` event wiring so consumers don't reimplement the boilerplate.

**Example**

```tsx
const dialog = useDialog()
<dialog ref={dialog.ref}>...</dialog>
<button onClick={dialog.open}>Open</button>
```

**Common mistakes**

- Calling `dialog.open()` before the ref callback has fired — Pyreon components run once, so the `<dialog>` must be in the initial render (not behind a conditional `<Show>`); the ref callback fires synchronously during mount, and `dialog.open()` before that point has no element to call `showModal()` on

**See also:** `useFocusTrap` · `useScrollLock`

---

### useTimeAgo `hook`

```ts
(date: Date | (() => Date), opts?: UseTimeAgoOptions) => Signal<string>
```

Reactive "5 minutes ago" / "in 2 hours" relative-time string. Auto-updates on a sensible interval (every minute under an hour, every hour under a day, etc.) so the UI stays accurate without manual scheduling. Cleans up the interval on unmount.

**Example**

```tsx
const sent = useTimeAgo(message.sentAt)
<span>{sent}</span>
```

**See also:** `useInterval` · `useDebouncedValue`

---

### useInfiniteScroll `hook`

```ts
(onLoadMore: () => void | Promise<void>, opts?: { rootMargin?: string; threshold?: number; enabled?: () => boolean }) => { sentinelRef: (el: HTMLElement | null) => void; isLoading: Signal<boolean> }
```

`IntersectionObserver`-based infinite loading. Attach the returned `sentinelRef` to a node at the bottom of the list — when it scrolls into view, `onLoadMore` fires. `isLoading` blocks re-fires until the promise resolves. `enabled` accessor lets you stop observing once you've loaded the last page.

**Example**

```tsx
const { sentinelRef, isLoading } = useInfiniteScroll(loadNextPage, { rootMargin: '200px', enabled: () => hasMore() })
<For each={items()} by={(i) => i.id}>{(item) => <Row data={item} />}</For>
<div ref={sentinelRef}>{isLoading() && 'Loading…'}</div>
```

**Common mistakes**

- Placing the sentinel inside a container with `overflow: hidden` and no scroll — IntersectionObserver never fires because the sentinel is always clipped; the sentinel must be inside the scrollable container
- Forgetting to pass `enabled: () => hasMore()` — the hook keeps calling `onLoadMore` even after the last page

**See also:** `useIntersection`

---

### useMergedRef `hook`

```ts
<T>(...refs: (Ref<T> | RefCallback<T> | null | undefined)[]) => RefCallback<T>
```

Combine multiple refs into a single callback ref — used when forwarding `props.ref` while also keeping a local ref to the same element. Each provided ref (callback or object) receives the element on mount and `null` on unmount.

**Example**

```tsx
const localRef = ref<HTMLDivElement>()
const merged = useMergedRef(localRef, props.ref)
<div ref={merged}>...</div>
```

**See also:** `useEventListener`

---

### useUpdateEffect `hook`

```ts
(fn: () => void | (() => void), deps: Signal<unknown>[]) => void
```

Like `effect` but skips the initial run — only fires when one of the tracked signals updates *after* mount. Use for "save on change but not on first render" patterns where the initial value is already persisted.

**Example**

```tsx
useUpdateEffect(() => api.save(value()), [value])
// Doesn't fire on initial mount — only on subsequent value changes
```

**See also:** `useIsomorphicLayoutEffect`

---

### useIsomorphicLayoutEffect `hook`

```ts
(fn: () => void | (() => void)) => void
```

Runs a layout-phase effect on the client (synchronous, before paint) and a no-op on the server. Use when you need to read DOM measurements before the next paint without triggering an SSR mismatch warning.

**Example**

```tsx
const ref = signal<HTMLDivElement | null>(null)
useIsomorphicLayoutEffect(() => {
  const el = ref()
  if (el) widthSig.set(el.getBoundingClientRect().width)
})
```

**See also:** `useUpdateEffect` · `useElementSize`

---

## Package-level notes

> **Use `useControllableState` for controlled/uncontrolled — never reimplement:** `useControllableState({ value, defaultValue, onChange })` is the canonical controlled/uncontrolled pattern. Every primitive in `@pyreon/ui-primitives` uses it. Reimplementing the `isControlled + signal + getter` shape by hand was the #1 anti-pattern across primitives before the helper landed. Pass `value` and `defaultValue` as FUNCTIONS so signal reads track reactively — a plain value loses prop-driven controlled/uncontrolled detection.

> **Hooks return signals, not plain values:** Every hook returns `Signal<T>` / `Computed<T>` / accessor objects — never plain values. Read by calling: `size().width`, `bp().md`, `online()`. This is the cost of fine-grained reactivity but the reward is composition: hooks chain into `effect` / `computed` directly without re-bridging into Pyreon's reactivity graph.

> **SSR-safe by construction:** Every hook that touches a browser API (`window`, `document`, `navigator`, `IntersectionObserver`, `ResizeObserver`, `MediaQueryList`) is guarded so SSR returns a sensible default and the listener is registered inside `onMount`. Do not wrap hook calls in `if (typeof window !== "undefined")` — the hook does it for you, and your wrapper would skip the hook on the SSR-rendered shell where it should still register no-op state.

> **Auto-cleanup on unmount — never call `addEventListener` directly:** Every observer/listener/timer hook (`useEventListener`, `useClickOutside`, `useElementSize`, `useIntersection`, `useInterval`, `useTimeout`, etc.) registers an `onUnmount` cleanup. In primitives, never reach for raw `addEventListener` / `removeEventListener` — use `useEventListener`. The framework lint rule `pyreon/use-pyreon-hooks` (planned) will flag direct DOM listener registration in component code.

> **`useBreakpoint` reads the theme, `useMediaQuery` is raw:** `useBreakpoint()` reads `theme.breakpoints` so swapping themes (or unit systems) Just Works — use it for layout decisions tied to the design system. `useMediaQuery("(max-width: 640px)")` is a raw media-query escape hatch — use it for one-off queries that don't correspond to a theme breakpoint (`(prefers-contrast: more)`, `(orientation: landscape)`, etc.).
