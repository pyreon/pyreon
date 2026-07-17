---
title: "Signal-Based Hooks — API Reference"
description: "48 signal-based hooks: state (useToggle/useCounter/usePrevious/useLatest/useControllableState), DOM (useEventListener/useClickOutside/useFocus/useHover/useFocus"
---

# @pyreon/hooks — API Reference

> **Generated** from `hooks`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [hooks](/docs/hooks).

Signal-based hooks for Pyreon — 48 reactive primitives covering state, DOM, responsive, timing, interaction, data, and composition. Every hook is SSR-safe (browser API access guarded), self-cleaning (registers `onUnmount` for listeners/observers/timers), and signal-native: hooks return `Signal<T>` / `Computed<T>` accessors, never plain values, so consumers compose with `effect`/`computed` without re-bridging. `useControllableState` is the canonical controlled/uncontrolled pattern used by every `@pyreon/ui-primitives` component — never reimplement the `isControlled + signal + getter` shape by hand.

## Features

- 48 signal-based hooks across 7 categories
- State: useToggle, useCounter, usePrevious, useLatest, useControllableState
- DOM: useEventListener, useClickOutside, useFocus, useHover, useFocusTrap, useFocusReturn, useElementSize, useWindowResize, useWindowScroll, useScrollLock, useIntersection, useInfiniteScroll
- Responsive: useBreakpoint, useMediaQuery, useColorScheme, useSizeClass, useReducedMotion, useThemeValue, useSpacing, useRootSize
- Timing: useDebouncedValue, useDebouncedCallback, useThrottledCallback, useInterval, useTimeout, useTimeAgo
- Interaction: useClipboard, useHaptics, useShare, useLinking, useNotifications, useBiometrics, useDialog, useKeyboard, useOnline, useDocumentVisibility, useIdle
- Data: useFetch — thin reactive JSON fetch (&#123; data, error, isPending, refetch &#125;); the web half of the multiplatform useFetch contract
- Composition: useMergedRef, useUpdateEffect, useIsomorphicLayoutEffect
- Every hook is SSR-safe and auto-cleans on unmount
- Signal-native return shapes — compose with `effect` / `computed` without re-bridging

## Complete example

A full, end-to-end usage of the package:

```tsx
import {
  // State
  useToggle, useCounter, usePrevious, useLatest, useControllableState,
  // DOM
  useEventListener, useClickOutside, useFocus, useHover, useFocusTrap,
  useElementSize, useWindowResize, useWindowScroll, useScrollLock, useIntersection, useInfiniteScroll,
  // Responsive
  useBreakpoint, useMediaQuery, useColorScheme, useSizeClass, useReducedMotion, useThemeValue, useSpacing, useRootSize,
  // Timing
  useDebouncedValue, useDebouncedCallback, useThrottledCallback, useInterval, useTimeout, useTimeAgo,
  // Interaction
  useClipboard, useHaptics, useShare, useLinking, useNotifications, useBiometrics, useDialog, useKeyboard, useOnline, useDocumentVisibility, useIdle,
  // Composition
  useMergedRef, useUpdateEffect, useIsomorphicLayoutEffect,
} from '@pyreon/hooks'

// 1. useControllableState — canonical controlled / uncontrolled pattern.
//    Every @pyreon/ui-primitives component uses it. Never reimplement
//    the `isControlled + signal + getter` shape by hand.
function MyToggle(props: { checked?: boolean; defaultChecked?: boolean; onChange?: (v: boolean) => void }) {
  const [checked, setChecked] = useControllableState({
    value: () => props.checked,            // controlled — a FUNCTION so the signal read tracks
    defaultValue: props.defaultChecked ?? false,  // uncontrolled initial — a plain value (read once)
    onChange: props.onChange,
  })
  return <button onClick={() => setChecked(!checked())}>{checked() ? 'on' : 'off'}</button>
}

// 2. DOM listeners — auto-cleanup on unmount. Signature is (event, handler,
//    options?, target?); target defaults to window (resolved once at setup).
useEventListener('resize', () => layoutSig.set(measure()))
useClickOutside(() => panelEl, () => setOpen(false))

// 3. Element observers.
const size = useElementSize(() => boxEl)   // Signal<{ width, height }>
const visible = useIntersection(() => targetEl, { threshold: 0.5 })  // Signal<entry | null>
useInfiniteScroll(() => loadMore(), { threshold: 200, hasMore: () => more() })

// 4. Focus management for modals / drawers.
useFocusTrap(() => modalEl)                // traps Tab inside the element while it's present (null = inert)
const scroll = useScrollLock()             // scroll.lock() / scroll.unlock() — refcounted <body> lock

// 5. Responsive — driven by theme breakpoints, NOT raw media queries.
const bp = useBreakpoint()                 // () => string — active breakpoint name ('xs'|'sm'|'md'|'lg'|'xl')
const isMobile = useMediaQuery('(max-width: 640px)')
const colorScheme = useColorScheme()       // Signal<'light' | 'dark'> from prefers-color-scheme
const sizeClass = useSizeClass()           // () => 'compact' | 'regular' — SwiftUI/Compose size-class analog (min-width: 600px)
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
const dialog = useDialog()                 // native <dialog>: open signal + show/showModal/close/toggle
const online = useOnline()                 // Signal<boolean>
const haptics = useHaptics()               // fire-and-forget: haptics.impact('light') / .notification('success') / .selection()
const share = useShare()                   // platform share sheet: share.text('..') / share.url('..') / share.textUrl('..', '..')
const linking = useLinking()               // open external URL: linking.openUrl('https://pyreon.dev')
const notifs = useNotifications()           // local notification: notifs.notify('Title', 'Body') / notifs.requestPermission()

// 8. Composition primitives.
const merged = useMergedRef(localRef, props.ref)   // forward ref + capture local
useUpdateEffect(() => value(), (v) => save(v))     // watch-style (source, cb); skips first run
useIsomorphicLayoutEffect(() => measure())          // useLayoutEffect on client, no-op on SSR

// 9. More state + lifecycle.
const { count, inc, dec, reset } = useCounter(0, { min: 0, max: 10 })  // numeric counter, clamped
const { position } = useWindowScroll()     // Signal<{ x, y }> scroll offset + scrollTo()
const visibility = useDocumentVisibility()  // Signal<'visible' | 'hidden'> — pause work when hidden
const idle = useIdle(30_000)               // Signal<boolean> — true after 30s of no activity
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`useControllableState`](#usecontrollablestate) | hook | Canonical controlled/uncontrolled state pattern. |
| [`useEventListener`](#useeventlistener) | hook | Register a DOM event listener with automatic cleanup on unmount. |
| [`useClickOutside`](#useclickoutside) | hook | Fire a callback when the user clicks outside the referenced element. |
| [`useElementSize`](#useelementsize) | hook | Reactive element size via `ResizeObserver`. |
| [`useFocusTrap`](#usefocustrap) | hook | Trap Tab/Shift+Tab focus inside the element returned by `getEl()`. |
| [`useFocusReturn`](#usefocusreturn) | hook | The companion to useFocusTrap: captures the focused element (the trigger) when `isOpen()` flips true and restores focus  |
| [`useBreakpoint`](#usebreakpoint) | hook | Returns a reactive accessor for the currently active breakpoint NAME (`() => string` — e.g. |
| [`useDebouncedValue`](#usedebouncedvalue) | hook | Returns a debounced signal that only updates after `delayMs` of source-signal idle. |
| [`useFetch`](#usefetch) | hook | Thin reactive JSON fetch matching the multiplatform `useFetch<T>(url)` contract — the SAME call in a shared `.tsx` compi |
| [`useClipboard`](#useclipboard) | hook | `navigator.clipboard.writeText` wrapped with a reactive `copied` flag that auto-resets after `options.timeout` ms (defau |
| [`useDialog`](#usedialog) | hook | Native `<dialog>` element wrapper. |
| [`useTimeAgo`](#usetimeago) | hook | Reactive "5 minutes ago" / "in 2 hours" relative-time string. |
| [`useInfiniteScroll`](#useinfinitescroll) | hook | `IntersectionObserver`-based infinite loading. |
| [`useMergedRef`](#usemergedref) | hook | Combine multiple refs into a single callback ref — used when forwarding `props.ref` while also keeping a local ref to th |
| [`useUpdateEffect`](#useupdateeffect) | hook | Watch-style effect that skips the initial run — tracks `source` and fires `callback(newVal, oldVal)` only when `source`' |
| [`useIsomorphicLayoutEffect`](#useisomorphiclayouteffect) | hook | Runs a layout-phase effect on the client (synchronous, before paint) and a no-op on the server. |
| [`useCounter`](#usecounter) | hook | Reactive numeric counter — the numeric companion to useToggle. |
| [`useWindowScroll`](#usewindowscroll) | hook | Track the window scroll offset reactively via a passive `scroll` listener (auto-removed on unmount), plus an SSR-safe im |
| [`useDocumentVisibility`](#usedocumentvisibility) | hook | Track the Page Visibility state (`document.visibilityState`) reactively — `"hidden"` when the tab is backgrounded/minimi |
| [`useIdle`](#useidle) | hook | Reactive user-idle detection — `true` once no activity event (pointer / key / scroll / wheel by default) has fired for ` |
| [`useToggle`](#usetoggle) | hook | Boolean signal with named controls. |
| [`useHover`](#usehover) | hook | Track hover state. |
| [`useFocus`](#usefocus) | hook | Track focus state. |
| [`useMediaQuery`](#usemediaquery) | hook | Reactive `matchMedia`. |
| [`useColorScheme`](#usecolorscheme) | hook | Reactive OS color-scheme accessor — `computed` over `(prefers-color-scheme: dark)` (wraps `useMediaQuery`). |
| [`useSizeClass`](#usesizeclass) | hook | Reactive size-class accessor — `computed` over `(min-width: 600px)` (wraps `useMediaQuery`), mapping wide → `'regular'`, |
| [`useReducedMotion`](#usereducedmotion) | hook | Reactive accessor for `(prefers-reduced-motion: reduce)` (a thin `useMediaQuery` wrapper). |
| [`useOnline`](#useonline) | hook | Reactive network status accessor — seeded from `navigator.onLine` (or `true` on the server), updated by `online`/`offlin |
| [`useIntersection`](#useintersection) | hook | IntersectionObserver as a signal. |
| [`usePrevious`](#useprevious) | hook | Track the previous value of a reactive read. |
| [`useWindowResize`](#usewindowresize) | hook | Reactive window size accessor (default debounce 200ms). |
| [`useInterval`](#useinterval) | hook | Declarative `setInterval`. |
| [`useTimeout`](#usetimeout) | hook | Declarative `setTimeout` that STARTS immediately at setup (fires once after `delay`ms unless `delay` is `null`). |
| [`useDebouncedCallback`](#usedebouncedcallback) | hook | Returns a debounced wrapper that resets a timer on each call and invokes `callback` after `delay`ms of quiet, plus `.can |
| [`useThrottledCallback`](#usethrottledcallback) | hook | Returns a throttled wrapper (rate-limited to once per `delay`ms, via `@pyreon/ui-core`'s `throttle`) with a `.cancel()`  |
| [`useLatest`](#uselatest) | hook | Wraps `value` in a mutable `{ current }` ref object. |
| [`useKeyboard`](#usekeyboard) | hook | Registers a `keydown` (or `keyup`) listener on `options.target` (default `document`) that fires `handler` only when `eve |
| [`useScrollLock`](#usescrolllock) | hook | Lock/unlock body scroll (sets `document.body.style.overflow = "hidden"`). |
| [`useRootSize`](#userootsize) | hook | Reads the styler theme root font size (default `16`) and returns it plus `pxToRem` / `remToPx` converters. |
| [`useSpacing`](#usespacing) | hook | Returns a `spacing(multiplier)` function producing a px string. |
| [`useThemeValue`](#usethemevalue) | hook | Deep-reads a dot-path from the styler theme (e.g. |
| [`useHaptics`](#usehaptics) | hook | Imperative haptic feedback. |
| [`useShare`](#useshare) | hook | Imperative Web Share API wrapper (lowers to native `PyreonShare` under PMTC). |
| [`useLinking`](#uselinking) | hook | Imperative external-link opener. |
| [`useNotifications`](#usenotifications) | hook | Imperative LOCAL notifications (Web Notifications API; lowers to native `PyreonNotifications` under PMTC). |
| [`useImagePicker`](#useimagepicker) | hook | Pick an image from the device's photo library — PHPickerViewController (iOS), the Android Photo Picker (`PickVisualMedia |
| [`useBiometrics`](#usebiometrics) | hook | A biometric authentication gate — Face ID / Touch ID (iOS `LAContext`), BiometricPrompt (Android), feature-detected on t |

## API

### useControllableState `hook`

```ts
<T>(opts: { value: () => T | undefined; defaultValue: T; onChange?: (v: T) => void }) => [() => T, (next: T | ((prev: T) => T)) => void]
```

Canonical controlled/uncontrolled state pattern. Returns a `[getValue, setValue]` tuple where the getter reads the controlled `value()` when defined, else an internal signal, and the setter mutates the internal signal when uncontrolled and always fires `onChange`. Used by every primitive in `@pyreon/ui-primitives`. Never reimplement the `isControlled + signal + getter` shape by hand. `value` MUST be a FUNCTION so the controlled prop is read reactively; `defaultValue` is a PLAIN value (captured once as the uncontrolled initial). Controlled-vs-uncontrolled is detected once at setup from whether `value()` is defined.

**Example**

```tsx
function MyToggle(props: { checked?: boolean; defaultChecked?: boolean; onChange?: (v: boolean) => void }) {
  const [checked, setChecked] = useControllableState({
    value: () => props.checked,           // controlled — function so the signal read tracks
    defaultValue: props.defaultChecked ?? false,  // uncontrolled initial — plain value
    onChange: props.onChange,
  })
  return <button onClick={() => setChecked(!checked())}>{checked() ? 'on' : 'off'}</button>
}
```

**Common mistakes**

- Passing `value: props.checked` (not a function) — loses reactivity on prop changes; pass `value: () => props.checked`
- Passing `defaultValue` as a getter (`() => false`) — it is a plain value stored once into the internal signal; a function would be stored as the value itself
- Mutating the returned signal directly with `.set()` instead of using the returned setter — bypasses the controlled-mode / onChange handling

**See also:** `useToggle` · `useCounter` · `usePrevious`

---

### useEventListener `hook`

```ts
<K extends keyof WindowEventMap>(event: K, handler: (e: WindowEventMap[K]) => void, options?: boolean | AddEventListenerOptions, target?: () => EventTarget | null) => void
```

Register a DOM event listener with automatic cleanup on unmount. Signature is `(event, handler, options?, target?)` — event FIRST, and `target` is the optional last argument, a getter resolved ONCE at setup (defaults to `window`). Use this instead of raw `addEventListener` in primitives — never `addEventListener` / `removeEventListener` directly in component code (the cleanup is the hook's whole job). SSR-safe: no-ops on the server.

**Example**

```tsx
useEventListener('resize', () => layoutSig.set(measure()))
useEventListener('keydown', (e) => {
  if (e.key === 'Escape') setOpen(false)
})
// A specific element via the 4th (target) argument, resolved once at setup:
useEventListener('click', onDocClick, {}, () => document)
```

**Common mistakes**

- Using raw `addEventListener` instead of `useEventListener` — you lose automatic `onUnmount` cleanup
- Passing the target FIRST (`useEventListener(window, "resize", fn)`) — the signature is event-first; the target is the optional 4th argument
- Expecting the `target` getter to re-bind reactively — it is resolved ONCE at setup, so a ref that is still null then falls back to `window`; attach to a stable target or read a ref that is populated by setup time

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
(getEl: () => HTMLElement | null, options?: { active?: boolean | (() => boolean); initialFocus?: boolean | string | HTMLElement | (() => HTMLElement | null) } | boolean | (() => boolean)) => void
```

Trap Tab/Shift+Tab focus inside the element returned by `getEl()`. Required for modals / drawers / fullscreen overlays to be keyboard-accessible. The getter is read live on every Tab, so the trap is INERT while `getEl()` returns null — render the trapped element conditionally and it turns on/off with it. The optional 2nd argument arms the trap reactively WITHOUT unmounting (`active: () => isOpen()`, or the positional shorthand `useFocusTrap(getEl, () => isOpen())` — while inactive the keydown listener is removed) and moves focus INTO the container on activation (`initialFocus: true` for the first tabbable, or a selector / element / getter; default is no focus move, backward-compatible). The focusable query is spec-grade — it includes `contenteditable`, `audio`/`video[controls]`, and `details > summary`; filters `display:none` / `visibility:hidden` / `[hidden]` / `inert` / disabled / zero-size nodes (via `checkVisibility` in real browsers); and orders positive-`tabindex` first. The trap only acts while focus is actually inside its container, so nested traps do not fight. Restoring focus to the trigger on close is a SEPARATE concern — use `useFocusReturn`.

**Example**

```tsx
// Reactive arming + move focus to the first field on open.
const modalRef = signal<HTMLElement | null>(null)
useFocusTrap(() => modalRef(), { active: () => isOpen(), initialFocus: true })
useFocusReturn(() => isOpen())   // returns focus to the opener on close

// Or the single-arg form: inert while getEl() is null, no focus move.
useFocusTrap(() => modalRef())
```

**Common mistakes**

- Keeping the element permanently mounted (e.g. `display: none`) and expecting the trap to disable when hidden — either unmount it (so `getEl()` returns null) or pass `active: () => isOpen()` to disarm the listener without unmounting; visibility alone does not gate it
- Expecting the trap to MOVE focus into the container on open — by default it only cycles Tab at the edges. Pass `initialFocus: true` (or a selector / element / getter) to place focus on activation, and pair with `useFocusReturn` to restore it on close
- Expecting it to also RETURN focus to the trigger on close — that is useFocusReturn; useFocusTrap only cycles Tab within the container

**See also:** `useFocusReturn` · `useScrollLock` · `useDialog` · `useClickOutside`

---

### useFocusReturn `hook`

```ts
(isOpen: () => boolean, options?: { returnTo?: () => HTMLElement | null }) => void
```

The companion to useFocusTrap: captures the focused element (the trigger) when `isOpen()` flips true and restores focus to it when `isOpen()` flips false — so keyboard / screen-reader users return to where they were when an overlay closes, instead of the top of the page. Pass `returnTo` when the trigger may have unmounted by close time. SSR-safe (no-op on the server), self-cleaning (the watcher is removed on unmount).

**Example**

```tsx
const open = signal(false)
useFocusReturn(() => open())               // focus returns to the opener on close
useFocusTrap(() => dialogRef())            // focus is trapped while the dialog is present
```

**Common mistakes**

- Passing the open state as a plain boolean instead of a getter — `useFocusReturn(open())` reads it once and never tracks the transition; pass `() => open()`.
- Expecting it to move focus INTO the overlay on open — that is useFocusTrap / autofocus. useFocusReturn only handles the RETURN on close.

**See also:** `useFocusTrap` · `useScrollLock` · `useDialog`

---

### useBreakpoint `hook`

```ts
(breakpoints?: Record<string, number>) => () => string
```

Returns a reactive accessor for the currently active breakpoint NAME (`() => string` — e.g. `"xs"` / `"sm"` / `"md"` / `"lg"` / `"xl"`), driven by the **theme** breakpoints, not raw media queries — reads `theme.breakpoints` so swapping themes (or unit systems) Just Works. Compare the read against a name; use `useMediaQuery` for one-off arbitrary queries.

**Example**

```tsx
const bp = useBreakpoint()
{() => bp() === 'lg' || bp() === 'xl' ? <DesktopNav /> : <MobileNav />}
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
(options?: { timeout?: number }) => { copy: (text: string) => Promise<boolean>; copied: () => boolean; text: () => string }
```

`navigator.clipboard.writeText` wrapped with a reactive `copied` flag that auto-resets after `options.timeout` ms (default 2000). `copy` resolves `true` on success / `false` on failure (never throws). `text()` is the last successfully-copied string. Use the `copied` signal to flash a "Copied!" UI cue without manual timer management.

**Example**

```tsx
const { copy, copied } = useClipboard()
<button onClick={() => copy(token)}>{copied() ? 'Copied!' : 'Copy'}</button>
```

**Common mistakes**

- Passing a bare number (`useClipboard(3000)`) — the argument is an options object: `useClipboard({ timeout: 3000 })`

**See also:** `useDialog` · `useOnline`

---

### useDialog `hook`

```ts
(options?: { onClose?: () => void }) => { open: () => boolean; show: () => void; showModal: () => void; close: () => void; toggle: () => void; ref: (el: HTMLDialogElement | null) => void }
```

Native `<dialog>` element wrapper. `open` is the reactive OPEN-STATE signal (call it to read: `dialog.open()`); `show()` opens non-modal, `showModal()` opens with backdrop + focus, `close()` closes, `toggle()` flips. Wires the native `close` event so `open` stays in sync (and fires `options.onClose`) when the user presses Escape.

**Example**

```tsx
const dialog = useDialog()
<button onClick={dialog.showModal}>Open</button>
<dialog ref={dialog.ref}><button onClick={dialog.close}>Close</button></dialog>
```

**Common mistakes**

- Using `dialog.open` as an OPENER — it is the open-STATE signal, not a method; open with `dialog.show()` / `dialog.showModal()`
- Rendering the `<dialog>` behind a conditional `<Show>` — it must be in the initial render so the ref callback binds before you call `showModal()`

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
(onLoadMore: () => void | Promise<void>, opts?: { threshold?: number; loading?: () => boolean; hasMore?: () => boolean; direction?: "up" | "down" }) => { ref: (el: HTMLElement | null) => void; triggered: () => boolean }
```

`IntersectionObserver`-based infinite loading. Attach the returned `ref` to the SCROLL CONTAINER — the hook injects an invisible sentinel at the boundary; when it scrolls into view, `onLoadMore` fires. `triggered()` reflects whether the sentinel is currently visible. `loading` (skip while a load is in flight) and `hasMore` (stop once the last page is reached) are accessor guards; `threshold` is the px distance from the edge (default 100), `direction` picks the top/bottom boundary (default `down`).

**Example**

```tsx
const { ref, triggered } = useInfiniteScroll(loadNextPage, { threshold: 200, loading: () => loading(), hasMore: () => hasMore() })
<div ref={ref} style={{ overflowY: 'auto', height: '400px' }}>
  <For each={items()} by={(i) => i.id}>{(item) => <Row data={item} />}</For>
</div>
```

**Common mistakes**

- Attaching `ref` to the sentinel instead of the scroll CONTAINER — the hook creates its own sentinel; `ref` goes on the scrollable element
- A container with `overflow: hidden` and no scroll — the injected sentinel is always clipped, so IntersectionObserver never fires
- Forgetting `hasMore: () => hasMore()` — the hook keeps calling `onLoadMore` even after the last page

**See also:** `useIntersection` · `useWindowScroll`

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
<T>(source: () => T, callback: (newVal: T, oldVal: T | undefined) => void | (() => void)) => void
```

Watch-style effect that skips the initial run — tracks `source` and fires `callback(newVal, oldVal)` only when `source`'s value changes *after* mount (`oldVal` is `undefined` on the first change). Use for "save on change but not on first render" patterns where the initial value is already persisted. Note the argument order is `(source, callback)` — NOT React's `(effect, deps)`.

**Example**

```tsx
useUpdateEffect(() => value(), (val) => api.save(val))
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

### useCounter `hook`

```ts
(initial?: number, opts?: { min?: number; max?: number }) => { count: Signal<number>; inc: (d?: number) => void; dec: (d?: number) => void; set: (v: number) => void; reset: () => void }
```

Reactive numeric counter — the numeric companion to useToggle. `inc` / `dec` step by `d` (default 1), `set` assigns absolutely, `reset` returns to the initial value; every write is clamped into `[min, max]` when bounds are given (the initial value is clamped too). `count` is the reactive value signal.

**Example**

```tsx
const { count, inc, dec, reset } = useCounter(0, { min: 0, max: 10 })
<button onClick={() => dec()}>-</button><span>{count}</span><button onClick={() => inc()}>+</button>
```

**Common mistakes**

- Calling the exposed `count` signal's `.set()` directly to bypass clamping — use `set()` / `inc()` / `dec()` so `min`/`max` are enforced

**See also:** `useToggle` · `useControllableState`

---

### useWindowScroll `hook`

```ts
() => { position: () => { x: number; y: number }; scrollTo: (o: { x?: number; y?: number; behavior?: ScrollBehavior }) => void }
```

Track the window scroll offset reactively via a passive `scroll` listener (auto-removed on unmount), plus an SSR-safe imperative `scrollTo` (omitted axes keep their current value). Use for scroll-to-top buttons, scroll-progress bars, sticky-header reveal, parallax. SSR-safe: `position()` is `{ x: 0, y: 0 }` on the server.

**Example**

```tsx
const { position, scrollTo } = useWindowScroll()
<Show when={() => position().y > 400}>
  <button onClick={() => scrollTo({ y: 0, behavior: 'smooth' })}>Top</button>
</Show>
```

**See also:** `useElementSize` · `useInfiniteScroll` · `useIntersection`

---

### useDocumentVisibility `hook`

```ts
() => () => "visible" | "hidden"
```

Track the Page Visibility state (`document.visibilityState`) reactively — `"hidden"` when the tab is backgrounded/minimized, `"visible"` otherwise. Use it to pause work the user can't see (polling, video, animations, expensive timers) and resume on return. SSR-safe (returns `"visible"` on the server); the `visibilitychange` listener is removed on unmount.

**Example**

```tsx
const visibility = useDocumentVisibility()
effect(() => { visibility() === 'hidden' ? pausePolling() : resumePolling() })
```

**See also:** `useOnline` · `useIdle`

---

### useIdle `hook`

```ts
(timeoutMs?: number, opts?: { events?: readonly string[]; initialState?: boolean }) => () => boolean
```

Reactive user-idle detection — `true` once no activity event (pointer / key / scroll / wheel by default) has fired for `timeoutMs` (default 60000), back to `false` on the next interaction. Every listener and the timer are removed on unmount. Use for auto-logout, "are you still there?" prompts, presence away-status, pausing background work. SSR-safe (listeners register in `onMount`).

**Example**

```tsx
const idle = useIdle(30_000)
effect(() => { if (idle()) showAwayBanner() })
```

**Common mistakes**

- Expecting it to fire once — `idle` is a live boolean signal that flips false again on the next activity event; read it reactively

**See also:** `useDocumentVisibility` · `useInterval` · `useOnline`

---

### useToggle `hook`

```ts
useToggle(initial?: boolean) => { value: () => boolean; toggle: () => void; setTrue: () => void; setFalse: () => void }
```

Boolean signal with named controls. Returns an OBJECT (not a tuple): `value` is a signal accessor, plus `toggle` / `setTrue` / `setFalse` mutators. For a numeric counter use `useCounter`.

**Example**

```tsx
const menu = useToggle()
<button onClick={menu.toggle}>Menu</button>
<Show when={() => menu.value()}>…</Show>
```

**Common mistakes**

- Destructuring it as a tuple (`const [open, toggle] = useToggle()`) — it returns an OBJECT `{ value, toggle, setTrue, setFalse }`; destructure by name.
- Reading `value` without calling it — `value` is a signal accessor; read `value()` inside a reactive scope.

**See also:** `useCounter` · `useDialog`

---

### useHover `hook`

```ts
useHover() => { hovered: () => boolean; props: { onMouseEnter: () => void; onMouseLeave: () => void } }
```

Track hover state. Returns a `hovered` signal accessor plus `props` you SPREAD onto the target element — the hook does not auto-attach any listener.

**Example**

```tsx
const h = useHover()
<div {...h.props}>{() => h.hovered() ? 'Hovering' : 'Idle'}</div>
```

**Common mistakes**

- Forgetting to spread `props` onto the element — nothing updates without it (the hook attaches no listeners itself).
- Expecting it to fire on touch — it uses `onMouseEnter`/`onMouseLeave` only, so it does not react on touch devices.

**See also:** `useFocus` · `useEventListener`

---

### useFocus `hook`

```ts
useFocus() => { focused: () => boolean; props: { onFocus: () => void; onBlur: () => void } }
```

Track focus state. Returns a `focused` signal accessor plus `props` (onFocus/onBlur) to SPREAD onto the element — no auto-attach.

**Example**

```tsx
const f = useFocus()
<input {...f.props} />
```

**Common mistakes**

- Forgetting to spread `props` — the hook registers no listeners itself; without the spread `focused` never changes.

**See also:** `useHover` · `useFocusTrap`

---

### useMediaQuery `hook`

```ts
useMediaQuery(query: string) => () => boolean
```

Reactive `matchMedia`. Returns a `matches` signal accessor; subscribes to the media query on mount and updates on change (listener auto-removed on unmount).

**Example**

```tsx
const isWide = useMediaQuery('(min-width: 768px)')
<Show when={() => isWide()}><Sidebar /></Show>
```

**Common mistakes**

- Expecting a correct value on the FIRST render / during SSR — the signal is seeded `false` and only corrected in `onMount`, so the first render always reads `false` even if the query would match. Gate visual differences to avoid a flash.
- Reading it without calling the accessor — `useMediaQuery(q)` returns `() => boolean`; call it in a reactive scope.

**See also:** `useColorScheme` · `useReducedMotion` · `useBreakpoint`

---

### useColorScheme `hook`

```ts
useColorScheme() => () => 'light' | 'dark'
```

Reactive OS color-scheme accessor — `computed` over `(prefers-color-scheme: dark)` (wraps `useMediaQuery`). Returns `'dark'` / `'light'`.

**Example**

```tsx
const scheme = useColorScheme()
<body data-theme={() => scheme()} />
```

**Common mistakes**

- Reads `'light'` on the first render / SSR regardless of OS preference — it inherits `useMediaQuery`'s seed-then-correct-on-mount behavior. Use a pre-paint script for a flash-free initial theme.
- Returns an accessor — call `scheme()` to read.

**See also:** `useMediaQuery` · `useReducedMotion`

---

### useSizeClass `hook`

```ts
useSizeClass() => () => 'compact' | 'regular'
```

Reactive size-class accessor — `computed` over `(min-width: 600px)` (wraps `useMediaQuery`), mapping wide → `'regular'`, narrow → `'compact'` (the SwiftUI/Android size-class analog for shared multi-platform code).

**Example**

```tsx
const size = useSizeClass()
<Show when={() => size() === 'regular'}><TwoColumn /></Show>
```

**Common mistakes**

- First render / SSR is always `'compact'` (inherits `useMediaQuery`'s pre-mount `false`).
- Returns an accessor — call `size()`.

**See also:** `useMediaQuery` · `useBreakpoint`

---

### useReducedMotion `hook`

```ts
useReducedMotion() => () => boolean
```

Reactive accessor for `(prefers-reduced-motion: reduce)` (a thin `useMediaQuery` wrapper). Gate animations on it for accessibility.

**Example**

```tsx
const reduced = useReducedMotion()
<Transition enter={() => reduced() ? '' : 'fade-in'}>…</Transition>
```

**Common mistakes**

- First render / SSR reports `false` ("motion allowed") until `onMount` — inherits `useMediaQuery` seeding.
- Returns an accessor — call it.

**See also:** `useMediaQuery` · `useColorScheme`

---

### useOnline `hook`

```ts
useOnline() => () => boolean
```

Reactive network status accessor — seeded from `navigator.onLine` (or `true` on the server), updated by `online`/`offline` window events. SSR-safe (guards on `isClient`); listeners auto-removed via `onCleanup`.

**Example**

```tsx
const online = useOnline()
<Show when={() => !online()}><OfflineBanner /></Show>
```

**Common mistakes**

- Treating it as reliable connectivity — `navigator.onLine` only reflects the OS network interface, not real reachability; a captive portal or dead server still reads `true`.
- Returns an accessor — call `online()`.

**See also:** `useDocumentVisibility` · `useIdle`

---

### useIntersection `hook`

```ts
useIntersection(getEl: () => HTMLElement | null, options?: IntersectionObserverInit) => () => IntersectionObserverEntry | null
```

IntersectionObserver as a signal. On mount reads `getEl()` once and (if non-null) observes it, writing the latest entry into a signal it returns. Auto-disconnects on unmount. Returns `null` until the observer first fires.

**Example**

```tsx
let el!: HTMLElement
const entry = useIntersection(() => el)
<div ref={(e) => (el = e)}>{() => entry()?.isIntersecting ? 'visible' : 'hidden'}</div>
```

**Common mistakes**

- `getEl()` is read ONCE in `onMount` — the element is not tracked reactively, so an element that mounts LATER or changes identity will not be observed. Ensure the ref is set before mount.
- Reading the accessor before the first observation — it is `null` until the observer fires; guard with `entry()?.`.

**See also:** `useElementSize` · `useInfiniteScroll`

---

### usePrevious `hook`

```ts
usePrevious<T>(getter: () => T) => () => T | undefined
```

Track the previous value of a reactive read. Runs an `effect` over `getter()`; returns an accessor for the value from BEFORE the last change (`undefined` until the getter changes once).

**Example**

```tsx
const count = signal(0)
const prev = usePrevious(() => count())
// after count.set(5): prev() === 0
```

**Common mistakes**

- Passing a plain value instead of a getter — `usePrevious(count())` snapshots once; pass `() => count()` so the effect tracks the signal.
- Reading `prev()` on first render — it is `undefined` until the tracked value changes at least once.

**See also:** `useLatest` · `useUpdateEffect`

---

### useWindowResize `hook`

```ts
useWindowResize(debounceMs?: number) => () => { width: number; height: number }
```

Reactive window size accessor (default debounce 200ms). Seeded from `window.innerWidth/Height` (or `{0,0}` on the server); a debounced `resize` listener updates it (listener + pending timer cleaned up on unmount).

**Example**

```tsx
const size = useWindowResize()
<div>{() => size().width + '×' + size().height}</div>
```

**Common mistakes**

- Expecting real dimensions on the first render / SSR — it seeds `{ width: 0, height: 0 }` on the server and until mount.
- Returns an accessor — call `size()`.

**See also:** `useElementSize` · `useWindowScroll` · `useBreakpoint`

---

### useInterval `hook`

```ts
useInterval(callback: () => void, delay: number | null | (() => number | null)) => void
```

Declarative `setInterval`. A number sets a fixed interval, `null` PAUSES, and a getter `() => number | null` makes the delay REACTIVE (an effect restarts/pauses the timer when the returned value changes). Auto-cleared on unmount. Returns nothing.

**Example**

```tsx
const paused = signal(false)
useInterval(() => tick(), () => paused() ? null : 1000)
```

**Common mistakes**

- Passing `delay: 0` expecting a pause — use `null` to pause; `0` runs as fast as the event loop allows.
- Expecting a NUMBER delay to react to a signal — only the getter form (`() => number | null`) is reactive; a plain number is read once at setup.
- Relying on a fresh `callback` per render — the callback is captured once (Pyreon bodies run once); read reactive values INSIDE the callback.

**See also:** `useTimeout` · `useIdle`

---

### useTimeout `hook`

```ts
useTimeout(callback: () => void, delay: number | null) => { reset: () => void; clear: () => void }
```

Declarative `setTimeout` that STARTS immediately at setup (fires once after `delay`ms unless `delay` is `null`). Returns `reset` (restart with the original delay) / `clear` (stop). Auto-cleared on unmount.

**Example**

```tsx
const t = useTimeout(() => hideToast(), 3000)
<div onMouseEnter={t.clear} onMouseLeave={t.reset}>…</div>
```

**Common mistakes**

- Expecting it to be lazy — it fires ON MOUNT automatically; pass `delay: null` to disable, or call `clear()`.
- `callback` and `delay` are captured once at setup — `reset()` reuses the original delay; there is no way to change the delay after creation.

**See also:** `useInterval` · `useDebouncedValue`

---

### useDebouncedCallback `hook`

```ts
useDebouncedCallback<T extends (...args: any[]) => any>(callback: T, delay: number) => T & { cancel: () => void; flush: () => void }
```

Returns a debounced wrapper that resets a timer on each call and invokes `callback` after `delay`ms of quiet, plus `.cancel()` (drop the pending call) and `.flush()` (invoke now with the last args). Pending timer auto-cancelled on unmount.

**Example**

```tsx
const onSearch = useDebouncedCallback((q: string) => fetchResults(q), 300)
<input onInput={(e) => onSearch(e.target.value)} />
```

**Common mistakes**

- Relying on the "always latest callback" behavior the JSDoc claims — the callback is captured ONCE at setup (Pyreon component bodies run once), so read reactive values INSIDE the callback rather than expecting a new callback identity to take effect.
- Re-creating it per render in a loop — define it once at component setup; a fresh debouncer per call resets the timer every time.

**See also:** `useThrottledCallback` · `useDebouncedValue`

---

### useThrottledCallback `hook`

```ts
useThrottledCallback<T extends (...args: any[]) => any>(callback: T, delay: number) => T & { cancel: () => void }
```

Returns a throttled wrapper (rate-limited to once per `delay`ms, via `@pyreon/ui-core`'s `throttle`) with a `.cancel()` method. Auto-cancelled on unmount. Use over debounce when you want steady updates during a continuous stream (scroll, drag).

**Example**

```tsx
const onScroll = useThrottledCallback(() => updateParallax(), 16)
```

**Common mistakes**

- Same "latest callback" caveat as `useDebouncedCallback` — the callback is captured once; read reactive values inside it.
- Reaching for throttle when you want the value to settle AFTER the burst — that is debounce (`useDebouncedCallback`); throttle fires DURING the burst at a fixed rate.

**See also:** `useDebouncedCallback`

---

### useLatest `hook`

```ts
useLatest<T>(value: T) => { readonly current: T }
```

Wraps `value` in a mutable `{ current }` ref object. Does NOT auto-update — it captures once (Pyreon bodies run once); the caller must update `.current` manually or pass a reactive getter as the value.

**Example**

```tsx
const latest = useLatest(props.onSave)
// later, in a stale-closure-prone callback: latest.current?.()
```

**Common mistakes**

- Expecting `.current` to auto-track a signal — it is set once from the argument. To keep it fresh, assign `latest.current = …` in an effect, or store a getter and call `latest.current()`.

**See also:** `usePrevious`

---

### useKeyboard `hook`

```ts
useKeyboard(key: string, handler: (event: KeyboardEvent) => void, options?: { event?: 'keydown' | 'keyup'; target?: EventTarget }) => void
```

Registers a `keydown` (or `keyup`) listener on `options.target` (default `document`) that fires `handler` only when `event.key === key`. Auto-removed on unmount. For app-wide shortcuts with modifiers, prefer `@pyreon/hotkeys`.

**Example**

```tsx
useKeyboard('Escape', () => closeModal())
```

**Common mistakes**

- Expecting modifier handling — it matches `event.key` EXACTLY (no Cmd/Ctrl/Shift logic); use `@pyreon/hotkeys` for chords.
- `options` (event / target) is read once at setup — a later change to the target is not re-bound.

**See also:** `useEventListener` · `useClickOutside`

---

### useScrollLock `hook`

```ts
useScrollLock() => { lock: () => void; unlock: () => void }
```

Lock/unlock body scroll (sets `document.body.style.overflow = "hidden"`). Uses a MODULE-LEVEL reference count so concurrent locks (nested modals) compose — the saved overflow restores only when the last lock releases. SSR-safe (both no-op on the server); an unmount while still locked auto-unlocks.

**Example**

```tsx
const { lock, unlock } = useScrollLock()
onMount(() => { lock(); return unlock })
```

**Common mistakes**

- Expecting one instance to NEST — a per-instance `isLocked` guard makes repeat `lock()`/`unlock()` calls no-ops, so one instance holds at most ONE refcount unit (an extra `unlock()` can never release another component's lock); use a separate `useScrollLock()` per independently-lifecycled lock.
- Setting `body { overflow }` yourself while a lock is active — the hook restores the value captured at the 0→1 transition, clobbering your change on release.

**See also:** `useDialog` · `useClickOutside`

---

### useRootSize `hook`

```ts
useRootSize() => { rootSize: number; pxToRem: (px: number) => string; remToPx: (rem: number) => number }
```

Reads the styler theme root font size (default `16`) and returns it plus `pxToRem` / `remToPx` converters. Requires a theme context (falls back to 16 otherwise).

**Example**

```tsx
const { pxToRem } = useRootSize()
<div style={{ padding: pxToRem(24) }}>…</div>
```

**Common mistakes**

- `rootSize` is a plain number captured ONCE at call time — NOT reactive. The converters close over that snapshot, so a later whole-theme swap will not update an already-returned result (re-mount the consumer to pick up a new root size).

**See also:** `useSpacing` · `useThemeValue`

---

### useSpacing `hook`

```ts
useSpacing(base?: number) => (multiplier: number) => string
```

Returns a `spacing(multiplier)` function producing a px string. The unit is `base ?? rootSize/2` (default 8px), read from the theme via `useRootSize`.

**Example**

```tsx
const spacing = useSpacing()
<div style={{ gap: spacing(2) }}>…</div>  // "16px"
```

**Common mistakes**

- The unit is computed once from a non-reactive `rootSize` snapshot — the returned `spacing` function is static; a theme change will not affect an already-obtained function.

**See also:** `useRootSize` · `useThemeValue`

---

### useThemeValue `hook`

```ts
useThemeValue<T = unknown>(path: string) => T | undefined
```

Deep-reads a dot-path from the styler theme (e.g. `"colors.primary"`), returning the value or `undefined`. A convenience over `useTheme()` + manual traversal.

**Example**

```tsx
const primary = useThemeValue<string>('colors.primary')
```

**Common mistakes**

- Returns a PLAIN value captured once — NOT an accessor and NOT reactive; it will not update on a theme swap. For a value that tracks the theme, read `useThemeAccessor()` from `@pyreon/styler` inside a reactive scope.

**See also:** `useRootSize` · `useSpacing`

---

### useHaptics `hook`

```ts
useHaptics() => { impact: (style?: 'light' | 'medium' | 'heavy' | 'soft' | 'rigid') => void; notification: (type: 'success' | 'warning' | 'error') => void; selection: () => void }
```

Imperative haptic feedback. Fire-and-forget methods that call `navigator.vibrate` on web (mapped patterns) and lower to native `PyreonHaptics` under PMTC. `impact` defaults to `medium`.

**Example**

```tsx
const haptics = useHaptics()
<button onClick={() => { haptics.impact('light'); submit() }}>Pay</button>
```

**Common mistakes**

- Expecting feedback on desktop / unsupported browsers — it silently no-ops when `navigator.vibrate` is absent (iOS Safari has no web vibrate); the real device feedback comes from the native PMTC target.

**See also:** `useShare` · `useNotifications`

---

### useShare `hook`

```ts
useShare() => { text: (text: string) => void; url: (url: string) => void; textUrl: (text: string, url: string) => void; canShare: () => boolean }
```

Imperative Web Share API wrapper (lowers to native `PyreonShare` under PMTC). `canShare()` feature-detects `navigator.share`; the share methods no-op where it is unavailable.

**Example**

```tsx
const share = useShare()
<Show when={() => share.canShare()}>
  <button onClick={() => share.url(location.href)}>Share</button>
</Show>
```

**Common mistakes**

- Expecting to detect a user CANCEL — the rejection from `navigator.share` is swallowed (no promise is returned), so a cancelled share surfaces nothing. Gate the button on `canShare()` and treat the call as fire-and-forget.

**See also:** `useHaptics` · `useLinking`

---

### useLinking `hook`

```ts
useLinking() => { openUrl: (url: string) => void }
```

Imperative external-link opener. `openUrl` calls `window.open(url, "_blank", "noopener,noreferrer")` on web and lowers to native `PyreonLinking` under PMTC. SSR-safe.

**Example**

```tsx
const { openUrl } = useLinking()
<button onClick={() => openUrl('https://pyreon.dev')}>Docs</button>
```

**Common mistakes**

- Expecting configurable target/features — it always opens a new tab with `noopener,noreferrer` hard-coded. For in-app navigation use `@pyreon/router`, not this.

**See also:** `useShare`

---

### useNotifications `hook`

```ts
useNotifications() => { requestPermission: () => void; notify: (title: string, body: string) => void }
```

Imperative LOCAL notifications (Web Notifications API; lowers to native `PyreonNotifications` under PMTC). `notify` auto-requests permission on first use; `requestPermission` prompts ahead of time.

**Example**

```tsx
const notifications = useNotifications()
onMount(() => notifications.requestPermission())
notifications.notify('Done', 'Your export is ready')
```

**Common mistakes**

- Expecting `notify` to appear synchronously on first call — when permission is undecided it requests first and posts only AFTER the async grant (or never, if denied). Call `requestPermission()` ahead of time for immediate notifications.
- These are LOCAL notifications only — not push; there is no server/remote delivery.

**See also:** `useHaptics`

---

### useImagePicker `hook`

```ts
useImagePicker() => { pick: () => Promise<string | null>; isAvailable: () => boolean }
```

Pick an image from the device's photo library — PHPickerViewController (iOS), the Android Photo Picker (`PickVisualMedia`), a hidden file input (web). The SECOND async-result hook (after `useBiometrics`): `pick()` returns a `Promise<string | null>` you `await`, resolving a URI string or `null` when the user cancels; it never rejects. Under PMTC the async-await lowering wraps the awaiting handler in a Swift `Task { … }` / Kotlin `pyreonAsyncScope.launch { … }`. Requires NO photo-library permission on either native platform — both system pickers run out of process and hand back only the chosen asset, so there is no Info.plist usage description and no Android runtime permission to request.

**Example**

```tsx
const picker = useImagePicker()
const status = signal<'idle' | 'picked' | 'cancelled'>('idle')

<button onClick={async () => {
  const uri = await picker.pick()
  status.set(uri === null ? 'cancelled' : 'picked')
}}>Pick a photo</button>
```

**Common mistakes**

- Testing the result for TRUTHINESS (`uri ? … : …`) instead of comparing to null (`uri === null`). JS truthiness is not a native Bool — the explicit null comparison is what PMTC lowers to `uri == nil` (Swift) / `uri == null` (Kotlin), and it is also correct on the web (an empty-string URI is not a cancellation).
- Calling `picker.pick()` WITHOUT `await` inside a plain (non-async) handler — it returns a `Promise<string | null>`, not a URI. Mark the handler `async` and `await` it (PMTC wraps that async handler in a native `Task`/coroutine scope; a sync action slot cannot await).
- Treating the returned URI as a stable, persistable path. It is an opaque, platform-shaped, EPHEMERAL handle — a `file://` temp copy on iOS, a `content://` URI on Android, a `blob:` object URL on the web. Hand it to an image view or an upload; do not store it and expect it to resolve later.
- Requesting a photo-library permission before calling `pick()`. Neither platform needs one — asking for it is a policy liability (App Store / Play review scrutiny) for zero benefit, and is exactly what the out-of-process pickers exist to avoid.
- Expecting a cancellation to reject. It resolves `null`, so a `try/catch` around `pick()` will never see the cancel path — branch on the result instead.
- Forgetting to revoke the web object URL when picking repeatedly in a long-lived view. The web fallback returns `URL.createObjectURL(file)`; call `URL.revokeObjectURL(uri)` once the image is no longer displayed if you pick many times, or the blobs accumulate for the page lifetime.

**See also:** `useBiometrics` · `useShare`

---

### useBiometrics `hook`

```ts
useBiometrics() => { authenticate: (reason: string) => Promise<boolean>; isAvailable: () => boolean }
```

A biometric authentication gate — Face ID / Touch ID (iOS `LAContext`), BiometricPrompt (Android), feature-detected on the web. The FIRST @pyreon/hooks service with an ASYNC RESULT: `authenticate(reason)` returns a `Promise<boolean>` you `await`. Under PMTC this lowers to the native biometric APIs, and the async-await lowering wraps the awaiting handler in a Swift `Task { … }` / Kotlin `pyreonAsyncScope.launch { … }`. WEB v1: a real assertion is a WebAuthn ceremony (needs a server-issued challenge + a registered credential), so the web `authenticate` resolves `false` and `isAvailable` feature-detects `window.PublicKeyCredential` — native is the primary target.

**Example**

```tsx
const bio = useBiometrics()
const status = signal<'idle' | 'unlocked' | 'denied'>('idle')

<button onClick={async () => {
  const ok = await bio.authenticate('Unlock your vault')
  status.set(ok ? 'unlocked' : 'denied')
}}>Unlock</button>
```

**Common mistakes**

- Calling `bio.authenticate(...)` WITHOUT `await` inside a plain (non-async) handler — it returns a `Promise<boolean>`, not a boolean, so the gate never applies. Mark the handler `async` and `await` the result (PMTC wraps that async handler in a native `Task`/coroutine scope).
- Expecting the WEB `authenticate` to actually authenticate — v1 resolves `false` (a real WebAuthn assertion needs a server challenge + a registered credential, out of scope for a client-only hook). For web biometric auth drive the WebAuthn API with your backend; the native paths (Face ID / Touch ID / BiometricPrompt) are the real gate.
- Treating a `false` result as an error — `authenticate` never rejects; failure, cancellation, and an unavailable / unenrolled device all resolve `false`. Branch on the boolean, do not wrap it in `try/catch`.

**See also:** `useNotifications` · `useShare`

---

## Package-level notes

> **Use `useControllableState` for controlled/uncontrolled — never reimplement:** `useControllableState({ value, defaultValue, onChange })` is the canonical controlled/uncontrolled pattern. Every primitive in `@pyreon/ui-primitives` uses it. Reimplementing the `isControlled + signal + getter` shape by hand was the #1 anti-pattern across primitives before the helper landed. Pass `value` as a FUNCTION (`() => props.checked`) so the controlled prop read tracks reactively; `defaultValue` is a PLAIN value captured once as the uncontrolled initial.

> **Hooks return signals, not plain values:** Every hook returns `Signal<T>` / `Computed<T>` / accessor objects — never plain values. Read by calling: `size().width`, `bp().md`, `online()`. This is the cost of fine-grained reactivity but the reward is composition: hooks chain into `effect` / `computed` directly without re-bridging into Pyreon's reactivity graph.

> **SSR-safe by construction:** Every hook that touches a browser API (`window`, `document`, `navigator`, `IntersectionObserver`, `ResizeObserver`, `MediaQueryList`) is guarded so SSR returns a sensible default and the listener is registered inside `onMount`. Do not wrap hook calls in `if (typeof window !== "undefined")` — the hook does it for you, and your wrapper would skip the hook on the SSR-rendered shell where it should still register no-op state.

> **Auto-cleanup on unmount — never call `addEventListener` directly:** Every observer/listener/timer hook (`useEventListener`, `useClickOutside`, `useElementSize`, `useIntersection`, `useInterval`, `useTimeout`, `useIdle`, etc.) registers an `onUnmount` cleanup. In primitives, never reach for raw `addEventListener` / `removeEventListener` — use `useEventListener`. The framework lint rules `pyreon/no-raw-addeventlistener` and `pyreon/no-raw-setinterval` flag direct DOM listener / timer registration in component code.

> **`useBreakpoint` reads the theme, `useMediaQuery` is raw:** `useBreakpoint()` reads `theme.breakpoints` so swapping themes (or unit systems) Just Works — use it for layout decisions tied to the design system. `useMediaQuery("(max-width: 640px)")` is a raw media-query escape hatch — use it for one-off queries that don't correspond to a theme breakpoint (`(prefers-contrast: more)`, `(orientation: landscape)`, etc.).
