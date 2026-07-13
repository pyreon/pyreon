import { defineManifest } from '@pyreon/manifest'

/**
 * Fourth migration to the T2.1 pipeline. @pyreon/hooks ships 36
 * signal-based hooks across seven categories — too many to enumerate
 * one-by-one in api[]. Strategy: documented categories in `features`
 * + the highest-leverage hooks (those used by other Pyreon packages
 * or that wrap subtle browser-API quirks) as individual api[]
 * entries. The full list lives in the package's index.ts (typed)
 * and in the README; the manifest captures the *shape* of the
 * library, not every binding.
 */
export default defineManifest({
  name: '@pyreon/hooks',
  title: 'Signal-Based Hooks',
  tagline:
    '42 signal-based hooks: state (useToggle/useCounter/usePrevious/useLatest/useControllableState), DOM (useEventListener/useClickOutside/useFocus/useHover/useFocusTrap/useFocusReturn/useElementSize/useWindowResize/useWindowScroll/useScrollLock/useIntersection/useInfiniteScroll), responsive (useBreakpoint/useMediaQuery/useColorScheme/useReducedMotion/useThemeValue/useSpacing/useRootSize), timing (useDebouncedValue/useDebouncedCallback/useThrottledCallback/useInterval/useTimeout/useTimeAgo), interaction (useClipboard/useHaptics/useShare/useDialog/useKeyboard/useOnline/useDocumentVisibility/useIdle), data (useFetch), composition (useMergedRef/useUpdateEffect/useIsomorphicLayoutEffect)',
  description:
    'Signal-based hooks for Pyreon — 42 reactive primitives covering state, DOM, responsive, timing, interaction, data, and composition. Every hook is SSR-safe (browser API access guarded), self-cleaning (registers `onUnmount` for listeners/observers/timers), and signal-native: hooks return `Signal<T>` / `Computed<T>` accessors, never plain values, so consumers compose with `effect`/`computed` without re-bridging. `useControllableState` is the canonical controlled/uncontrolled pattern used by every `@pyreon/ui-primitives` component — never reimplement the `isControlled + signal + getter` shape by hand.',
  category: 'universal',
  longExample: `import {
  // State
  useToggle, useCounter, usePrevious, useLatest, useControllableState,
  // DOM
  useEventListener, useClickOutside, useFocus, useHover, useFocusTrap,
  useElementSize, useWindowResize, useWindowScroll, useScrollLock, useIntersection, useInfiniteScroll,
  // Responsive
  useBreakpoint, useMediaQuery, useColorScheme, useReducedMotion, useThemeValue, useSpacing, useRootSize,
  // Timing
  useDebouncedValue, useDebouncedCallback, useThrottledCallback, useInterval, useTimeout, useTimeAgo,
  // Interaction
  useClipboard, useHaptics, useShare, useDialog, useKeyboard, useOnline, useDocumentVisibility, useIdle,
  // Composition
  useMergedRef, useUpdateEffect, useIsomorphicLayoutEffect,
} from '@pyreon/hooks'

// 1. useControllableState — canonical controlled / uncontrolled pattern.
//    Every @pyreon/ui-primitives component uses it. Never reimplement
//    the \`isControlled + signal + getter\` shape by hand.
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
const motion = useReducedMotion()          // Signal<boolean> from prefers-reduced-motion

// 6. Timing — debounced/throttled signals + callbacks.
const search = signal('')
const debounced = useDebouncedValue(search, 300)   // Signal<string> — only updates after 300ms idle
const onSearch = useDebouncedCallback((q: string) => fetchResults(q), 300)
useInterval(() => poll(), 1000)            // SSR-safe, auto-cleans
const sent = useTimeAgo(message.sentAt)    // Signal<string> "5 minutes ago", auto-updates

// 7. Clipboard / dialog / online status — wraps the browser quirks.
const { copy, copied } = useClipboard()    // \`copied\` auto-resets after 2s
copy('hello')
const dialog = useDialog()                 // native <dialog>: open signal + show/showModal/close/toggle
const online = useOnline()                 // Signal<boolean>
const haptics = useHaptics()               // fire-and-forget: haptics.impact('light') / .notification('success') / .selection()
const share = useShare()                   // platform share sheet: share.text('..') / share.url('..') / share.textUrl('..', '..')

// 8. Composition primitives.
const merged = useMergedRef(localRef, props.ref)   // forward ref + capture local
useUpdateEffect(() => value(), (v) => save(v))     // watch-style (source, cb); skips first run
useIsomorphicLayoutEffect(() => measure())          // useLayoutEffect on client, no-op on SSR

// 9. More state + lifecycle.
const { count, inc, dec, reset } = useCounter(0, { min: 0, max: 10 })  // numeric counter, clamped
const { position } = useWindowScroll()     // Signal<{ x, y }> scroll offset + scrollTo()
const visibility = useDocumentVisibility()  // Signal<'visible' | 'hidden'> — pause work when hidden
const idle = useIdle(30_000)               // Signal<boolean> — true after 30s of no activity`,
  features: [
    '42 signal-based hooks across 7 categories',
    'State: useToggle, useCounter, usePrevious, useLatest, useControllableState',
    'DOM: useEventListener, useClickOutside, useFocus, useHover, useFocusTrap, useFocusReturn, useElementSize, useWindowResize, useWindowScroll, useScrollLock, useIntersection, useInfiniteScroll',
    'Responsive: useBreakpoint, useMediaQuery, useColorScheme, useReducedMotion, useThemeValue, useSpacing, useRootSize',
    'Timing: useDebouncedValue, useDebouncedCallback, useThrottledCallback, useInterval, useTimeout, useTimeAgo',
    'Interaction: useClipboard, useHaptics, useShare, useDialog, useKeyboard, useOnline, useDocumentVisibility, useIdle',
    'Data: useFetch — thin reactive JSON fetch ({ data, error, isPending, refetch }); the web half of the multiplatform useFetch contract',
    'Composition: useMergedRef, useUpdateEffect, useIsomorphicLayoutEffect',
    'Every hook is SSR-safe and auto-cleans on unmount',
    'Signal-native return shapes — compose with `effect` / `computed` without re-bridging',
  ],
  api: [
    {
      name: 'useControllableState',
      kind: 'hook',
      signature:
        '<T>(opts: { value: () => T | undefined; defaultValue: T; onChange?: (v: T) => void }) => [() => T, (next: T | ((prev: T) => T)) => void]',
      summary:
        'Canonical controlled/uncontrolled state pattern. Returns a `[getValue, setValue]` tuple where the getter reads the controlled `value()` when defined, else an internal signal, and the setter mutates the internal signal when uncontrolled and always fires `onChange`. Used by every primitive in `@pyreon/ui-primitives`. Never reimplement the `isControlled + signal + getter` shape by hand. `value` MUST be a FUNCTION so the controlled prop is read reactively; `defaultValue` is a PLAIN value (captured once as the uncontrolled initial). Controlled-vs-uncontrolled is detected once at setup from whether `value()` is defined.',
      example: `function MyToggle(props: { checked?: boolean; defaultChecked?: boolean; onChange?: (v: boolean) => void }) {
  const [checked, setChecked] = useControllableState({
    value: () => props.checked,           // controlled — function so the signal read tracks
    defaultValue: props.defaultChecked ?? false,  // uncontrolled initial — plain value
    onChange: props.onChange,
  })
  return <button onClick={() => setChecked(!checked())}>{checked() ? 'on' : 'off'}</button>
}`,
      mistakes: [
        'Passing `value: props.checked` (not a function) — loses reactivity on prop changes; pass `value: () => props.checked`',
        'Passing `defaultValue` as a getter (`() => false`) — it is a plain value stored once into the internal signal; a function would be stored as the value itself',
        'Mutating the returned signal directly with `.set()` instead of using the returned setter — bypasses the controlled-mode / onChange handling',
      ],
      seeAlso: ['useToggle', 'useCounter', 'usePrevious'],
    },
    {
      name: 'useEventListener',
      kind: 'hook',
      signature:
        '<K extends keyof WindowEventMap>(event: K, handler: (e: WindowEventMap[K]) => void, options?: boolean | AddEventListenerOptions, target?: () => EventTarget | null) => void',
      summary:
        'Register a DOM event listener with automatic cleanup on unmount. Signature is `(event, handler, options?, target?)` — event FIRST, and `target` is the optional last argument, a getter resolved ONCE at setup (defaults to `window`). Use this instead of raw `addEventListener` in primitives — never `addEventListener` / `removeEventListener` directly in component code (the cleanup is the hook\'s whole job). SSR-safe: no-ops on the server.',
      example: `useEventListener('resize', () => layoutSig.set(measure()))
useEventListener('keydown', (e) => {
  if (e.key === 'Escape') setOpen(false)
})
// A specific element via the 4th (target) argument, resolved once at setup:
useEventListener('click', onDocClick, {}, () => document)`,
      mistakes: [
        'Using raw `addEventListener` instead of `useEventListener` — you lose automatic `onUnmount` cleanup',
        'Passing the target FIRST (`useEventListener(window, "resize", fn)`) — the signature is event-first; the target is the optional 4th argument',
        'Expecting the `target` getter to re-bind reactively — it is resolved ONCE at setup, so a ref that is still null then falls back to `window`; attach to a stable target or read a ref that is populated by setup time',
      ],
      seeAlso: ['useClickOutside', 'useKeyboard'],
    },
    {
      name: 'useClickOutside',
      kind: 'hook',
      signature: '(ref: () => HTMLElement | null, handler: (e: MouseEvent) => void) => void',
      summary:
        'Fire a callback when the user clicks outside the referenced element. Foundation for click-to-dismiss popovers, dropdowns, modals. Pair with `useFocusTrap` + `useScrollLock` for the full modal package.',
      example: `useClickOutside(() => panelRef(), () => setOpen(false))`,
      mistakes: [
        'Attaching to a ref that encompasses the entire viewport — every click anywhere except the ref itself triggers the handler; use a more specific ref (the popover panel, not the whole page)',
      ],
      seeAlso: ['useFocusTrap', 'useScrollLock', 'useDialog'],
    },
    {
      name: 'useElementSize',
      kind: 'hook',
      signature: '(ref: () => HTMLElement | null) => Signal<{ width: number; height: number }>',
      summary:
        'Reactive element size via `ResizeObserver`. Returns `Signal<{ width, height }>` that updates whenever the observed element resizes. SSR-safe (returns `{ width: 0, height: 0 }` until mount).',
      example: `const size = useElementSize(() => boxRef())
effect(() => console.log('Box is', size().width, 'x', size().height))`,
      seeAlso: ['useWindowResize', 'useRootSize'],
    },
    {
      name: 'useFocusTrap',
      kind: 'hook',
      signature: '(getEl: () => HTMLElement | null) => void',
      summary:
        'Trap Tab/Shift+Tab focus inside the element returned by `getEl()`. Required for modals / drawers / fullscreen overlays to be keyboard-accessible. The getter is read live on every Tab, so the trap is INERT while `getEl()` returns null — render the trapped element conditionally (a reactive `<Show>` / accessor) and the trap turns on/off with it, no separate `active` flag needed. Restoring focus to the trigger on close is a SEPARATE concern — use `useFocusReturn`.',
      example: `// The dialog renders only while open, so getEl() is null (inert) when closed.
let dialogEl: HTMLElement | null = null
useFocusTrap(() => dialogEl)
useFocusReturn(() => isOpen())  // returns focus to the opener on close`,
      mistakes: [
        'Keeping the element permanently mounted (e.g. `display: none`) and expecting the trap to disable when hidden — the trap is gated on `getEl()` returning null, not on visibility; unmount the element (or a `<Show>`) to deactivate',
        'Expecting it to also RETURN focus to the trigger on close — that is useFocusReturn; useFocusTrap only cycles Tab within the container while it is present',
      ],
      seeAlso: ['useFocusReturn', 'useScrollLock', 'useDialog', 'useClickOutside'],
    },
    {
      name: 'useFocusReturn',
      kind: 'hook',
      signature:
        '(isOpen: () => boolean, options?: { returnTo?: () => HTMLElement | null }) => void',
      summary:
        'The companion to useFocusTrap: captures the focused element (the trigger) when `isOpen()` flips true and restores focus to it when `isOpen()` flips false — so keyboard / screen-reader users return to where they were when an overlay closes, instead of the top of the page. Pass `returnTo` when the trigger may have unmounted by close time. SSR-safe (no-op on the server), self-cleaning (the watcher is removed on unmount).',
      example: `const open = signal(false)
useFocusReturn(() => open())               // focus returns to the opener on close
useFocusTrap(() => dialogRef())            // focus is trapped while the dialog is present`,
      mistakes: [
        'Passing the open state as a plain boolean instead of a getter — `useFocusReturn(open())` reads it once and never tracks the transition; pass `() => open()`.',
        'Expecting it to move focus INTO the overlay on open — that is useFocusTrap / autofocus. useFocusReturn only handles the RETURN on close.',
      ],
      seeAlso: ['useFocusTrap', 'useScrollLock', 'useDialog'],
    },
    {
      name: 'useBreakpoint',
      kind: 'hook',
      signature: '(breakpoints?: Record<string, number>) => () => string',
      summary:
        'Returns a reactive accessor for the currently active breakpoint NAME (`() => string` — e.g. `"xs"` / `"sm"` / `"md"` / `"lg"` / `"xl"`), driven by the **theme** breakpoints, not raw media queries — reads `theme.breakpoints` so swapping themes (or unit systems) Just Works. Compare the read against a name; use `useMediaQuery` for one-off arbitrary queries.',
      example: `const bp = useBreakpoint()
{() => bp() === 'lg' || bp() === 'xl' ? <DesktopNav /> : <MobileNav />}`,
      mistakes: [
        'Using `useBreakpoint` for a one-off media query like `(prefers-contrast: more)` — `useBreakpoint` reads theme breakpoints only; use `useMediaQuery` for arbitrary media queries',
      ],
      seeAlso: ['useMediaQuery', 'useThemeValue'],
    },
    {
      name: 'useDebouncedValue',
      kind: 'hook',
      signature: '<T>(source: Signal<T> | (() => T), delayMs: number) => Signal<T>',
      summary:
        'Returns a debounced signal that only updates after `delayMs` of source-signal idle. Use for search-as-you-type, filter inputs, anywhere downstream effects shouldn\'t fire on every keystroke. The PAIR — `useDebouncedCallback` — debounces a function call instead of a value.',
      example: `const search = signal('')
const debouncedSearch = useDebouncedValue(search, 300)
effect(() => fetchResults(debouncedSearch()))`,
      mistakes: [
        'Reading the debounced signal immediately after setting the source — it still holds the OLD value during the debounce window; effects downstream of the debounced signal are correct, but imperative reads in the same tick are stale',
      ],
      seeAlso: ['useDebouncedCallback', 'useThrottledCallback'],
    },
    {
      name: 'useFetch',
      kind: 'hook',
      signature: '<T>(url: string) => { data: Signal<T | undefined>; error: Signal<unknown>; isPending: Signal<boolean>; refetch: () => void }',
      summary:
        'Thin reactive JSON fetch matching the multiplatform `useFetch<T>(url)` contract — the SAME call in a shared `.tsx` compiles to native `PyreonFetch<T>` containers on iOS (URLSession `.task {}`) and Android (`LaunchedEffect` + kotlinx-serialization) via PMTC, while this runs on web. Fires once at component setup (client only — SSR renders the not-yet-loaded state); each `refetch()` aborts the previous in-flight request so a slow stale response can never clobber a fresh one; unmount aborts too. Deliberately thinner than `@pyreon/query`: no cache, no dedup, no retries.',
      example: `type Quote = { id: number; text: string }
const quotes = useFetch<Quote[]>('/api/quotes.json')
<Show when={quotes.isPending}><Text>Loading…</Text></Show>
<For each={() => quotes.data() ?? []} by={(q) => q.id}>{(q) => <Text>{q.text}</Text>}</For>`,
      mistakes: [
        'Reading `quotes.data` without calling it in non-JSX code — the fields are Signals; `quotes.data()` reads the value. In JSX child position the bare signal works (accessor children render reactively)',
        'Expecting data during SSR — the fetch only runs client-side; server HTML renders the `undefined`-data state and the request fires after hydration',
        'Using a reactive/computed URL — v1 takes a plain string captured once (PMTC requires a string literal for native emit anyway); call `refetch()` for manual re-runs, or use `@pyreon/query` for signal-driven keys',
        'Reaching for useFetch when you need caching, request dedup, retries, or mutations — that is `@pyreon/query` (TanStack) territory; useFetch is the thin multiplatform primitive',
        'Forgetting the non-2xx contract — HTTP errors land in `error()` as `[Pyreon] useFetch <url>: HTTP <status>`, they do NOT throw',
      ],
      seeAlso: ['useOnline'],
    },
    {
      name: 'useClipboard',
      kind: 'hook',
      signature: '(options?: { timeout?: number }) => { copy: (text: string) => Promise<boolean>; copied: () => boolean; text: () => string }',
      summary:
        '`navigator.clipboard.writeText` wrapped with a reactive `copied` flag that auto-resets after `options.timeout` ms (default 2000). `copy` resolves `true` on success / `false` on failure (never throws). `text()` is the last successfully-copied string. Use the `copied` signal to flash a "Copied!" UI cue without manual timer management.',
      example: `const { copy, copied } = useClipboard()
<button onClick={() => copy(token)}>{copied() ? 'Copied!' : 'Copy'}</button>`,
      mistakes: [
        'Passing a bare number (`useClipboard(3000)`) — the argument is an options object: `useClipboard({ timeout: 3000 })`',
      ],
      seeAlso: ['useDialog', 'useOnline'],
    },
    {
      name: 'useDialog',
      kind: 'hook',
      signature: '(options?: { onClose?: () => void }) => { open: () => boolean; show: () => void; showModal: () => void; close: () => void; toggle: () => void; ref: (el: HTMLDialogElement | null) => void }',
      summary:
        'Native `<dialog>` element wrapper. `open` is the reactive OPEN-STATE signal (call it to read: `dialog.open()`); `show()` opens non-modal, `showModal()` opens with backdrop + focus, `close()` closes, `toggle()` flips. Wires the native `close` event so `open` stays in sync (and fires `options.onClose`) when the user presses Escape.',
      example: `const dialog = useDialog()
<button onClick={dialog.showModal}>Open</button>
<dialog ref={dialog.ref}><button onClick={dialog.close}>Close</button></dialog>`,
      mistakes: [
        'Using `dialog.open` as an OPENER — it is the open-STATE signal, not a method; open with `dialog.show()` / `dialog.showModal()`',
        'Rendering the `<dialog>` behind a conditional `<Show>` — it must be in the initial render so the ref callback binds before you call `showModal()`',
      ],
      seeAlso: ['useFocusTrap', 'useScrollLock'],
    },
    {
      name: 'useTimeAgo',
      kind: 'hook',
      signature: '(date: Date | (() => Date), opts?: UseTimeAgoOptions) => Signal<string>',
      summary:
        'Reactive "5 minutes ago" / "in 2 hours" relative-time string. Auto-updates on a sensible interval (every minute under an hour, every hour under a day, etc.) so the UI stays accurate without manual scheduling. Cleans up the interval on unmount.',
      example: `const sent = useTimeAgo(message.sentAt)
<span>{sent}</span>`,
      seeAlso: ['useInterval', 'useDebouncedValue'],
    },
    {
      name: 'useInfiniteScroll',
      kind: 'hook',
      signature:
        '(onLoadMore: () => void | Promise<void>, opts?: { threshold?: number; loading?: () => boolean; hasMore?: () => boolean; direction?: "up" | "down" }) => { ref: (el: HTMLElement | null) => void; triggered: () => boolean }',
      summary:
        '`IntersectionObserver`-based infinite loading. Attach the returned `ref` to the SCROLL CONTAINER — the hook injects an invisible sentinel at the boundary; when it scrolls into view, `onLoadMore` fires. `triggered()` reflects whether the sentinel is currently visible. `loading` (skip while a load is in flight) and `hasMore` (stop once the last page is reached) are accessor guards; `threshold` is the px distance from the edge (default 100), `direction` picks the top/bottom boundary (default `down`).',
      example: `const { ref, triggered } = useInfiniteScroll(loadNextPage, { threshold: 200, loading: () => loading(), hasMore: () => hasMore() })
<div ref={ref} style={{ overflowY: 'auto', height: '400px' }}>
  <For each={items()} by={(i) => i.id}>{(item) => <Row data={item} />}</For>
</div>`,
      mistakes: [
        'Attaching `ref` to the sentinel instead of the scroll CONTAINER — the hook creates its own sentinel; `ref` goes on the scrollable element',
        'A container with `overflow: hidden` and no scroll — the injected sentinel is always clipped, so IntersectionObserver never fires',
        'Forgetting `hasMore: () => hasMore()` — the hook keeps calling `onLoadMore` even after the last page',
      ],
      seeAlso: ['useIntersection', 'useWindowScroll'],
    },
    {
      name: 'useMergedRef',
      kind: 'hook',
      signature: '<T>(...refs: (Ref<T> | RefCallback<T> | null | undefined)[]) => RefCallback<T>',
      summary:
        'Combine multiple refs into a single callback ref — used when forwarding `props.ref` while also keeping a local ref to the same element. Each provided ref (callback or object) receives the element on mount and `null` on unmount.',
      example: `const localRef = ref<HTMLDivElement>()
const merged = useMergedRef(localRef, props.ref)
<div ref={merged}>...</div>`,
      seeAlso: ['useEventListener'],
    },
    {
      name: 'useUpdateEffect',
      kind: 'hook',
      signature:
        '<T>(source: () => T, callback: (newVal: T, oldVal: T | undefined) => void | (() => void)) => void',
      summary:
        'Watch-style effect that skips the initial run — tracks `source` and fires `callback(newVal, oldVal)` only when `source`\'s value changes *after* mount (`oldVal` is `undefined` on the first change). Use for "save on change but not on first render" patterns where the initial value is already persisted. Note the argument order is `(source, callback)` — NOT React\'s `(effect, deps)`.',
      example: `useUpdateEffect(() => value(), (val) => api.save(val))
// Doesn't fire on initial mount — only on subsequent value changes`,
      seeAlso: ['useIsomorphicLayoutEffect'],
    },
    {
      name: 'useIsomorphicLayoutEffect',
      kind: 'hook',
      signature: '(fn: () => void | (() => void)) => void',
      summary:
        'Runs a layout-phase effect on the client (synchronous, before paint) and a no-op on the server. Use when you need to read DOM measurements before the next paint without triggering an SSR mismatch warning.',
      example: `const ref = signal<HTMLDivElement | null>(null)
useIsomorphicLayoutEffect(() => {
  const el = ref()
  if (el) widthSig.set(el.getBoundingClientRect().width)
})`,
      seeAlso: ['useUpdateEffect', 'useElementSize'],
    },
    {
      name: 'useCounter',
      kind: 'hook',
      signature:
        '(initial?: number, opts?: { min?: number; max?: number }) => { count: Signal<number>; inc: (d?: number) => void; dec: (d?: number) => void; set: (v: number) => void; reset: () => void }',
      summary:
        'Reactive numeric counter — the numeric companion to useToggle. `inc` / `dec` step by `d` (default 1), `set` assigns absolutely, `reset` returns to the initial value; every write is clamped into `[min, max]` when bounds are given (the initial value is clamped too). `count` is the reactive value signal.',
      example: `const { count, inc, dec, reset } = useCounter(0, { min: 0, max: 10 })
<button onClick={() => dec()}>-</button><span>{count}</span><button onClick={() => inc()}>+</button>`,
      mistakes: [
        'Calling the exposed `count` signal\'s `.set()` directly to bypass clamping — use `set()` / `inc()` / `dec()` so `min`/`max` are enforced',
      ],
      seeAlso: ['useToggle', 'useControllableState'],
    },
    {
      name: 'useWindowScroll',
      kind: 'hook',
      signature:
        '() => { position: () => { x: number; y: number }; scrollTo: (o: { x?: number; y?: number; behavior?: ScrollBehavior }) => void }',
      summary:
        'Track the window scroll offset reactively via a passive `scroll` listener (auto-removed on unmount), plus an SSR-safe imperative `scrollTo` (omitted axes keep their current value). Use for scroll-to-top buttons, scroll-progress bars, sticky-header reveal, parallax. SSR-safe: `position()` is `{ x: 0, y: 0 }` on the server.',
      example: `const { position, scrollTo } = useWindowScroll()
<Show when={() => position().y > 400}>
  <button onClick={() => scrollTo({ y: 0, behavior: 'smooth' })}>Top</button>
</Show>`,
      seeAlso: ['useElementSize', 'useInfiniteScroll', 'useIntersection'],
    },
    {
      name: 'useDocumentVisibility',
      kind: 'hook',
      signature: '() => () => "visible" | "hidden"',
      summary:
        'Track the Page Visibility state (`document.visibilityState`) reactively — `"hidden"` when the tab is backgrounded/minimized, `"visible"` otherwise. Use it to pause work the user can\'t see (polling, video, animations, expensive timers) and resume on return. SSR-safe (returns `"visible"` on the server); the `visibilitychange` listener is removed on unmount.',
      example: `const visibility = useDocumentVisibility()
effect(() => { visibility() === 'hidden' ? pausePolling() : resumePolling() })`,
      seeAlso: ['useOnline', 'useIdle'],
    },
    {
      name: 'useIdle',
      kind: 'hook',
      signature:
        '(timeoutMs?: number, opts?: { events?: readonly string[]; initialState?: boolean }) => () => boolean',
      summary:
        'Reactive user-idle detection — `true` once no activity event (pointer / key / scroll / wheel by default) has fired for `timeoutMs` (default 60000), back to `false` on the next interaction. Every listener and the timer are removed on unmount. Use for auto-logout, "are you still there?" prompts, presence away-status, pausing background work. SSR-safe (listeners register in `onMount`).',
      example: `const idle = useIdle(30_000)
effect(() => { if (idle()) showAwayBanner() })`,
      mistakes: [
        'Expecting it to fire once — `idle` is a live boolean signal that flips false again on the next activity event; read it reactively',
      ],
      seeAlso: ['useDocumentVisibility', 'useInterval', 'useOnline'],
    },
  ],
  gotchas: [
    // First gotcha feeds the llms.txt teaser. Pick the most distinctive
    // foot-gun: re-implementing the controlled/uncontrolled pattern by
    // hand is the single most common mistake in primitives, and the
    // anti-patterns rule already calls it out.
    {
      label: 'Use `useControllableState` for controlled/uncontrolled — never reimplement',
      note: '`useControllableState({ value, defaultValue, onChange })` is the canonical controlled/uncontrolled pattern. Every primitive in `@pyreon/ui-primitives` uses it. Reimplementing the `isControlled + signal + getter` shape by hand was the #1 anti-pattern across primitives before the helper landed. Pass `value` as a FUNCTION (`() => props.checked`) so the controlled prop read tracks reactively; `defaultValue` is a PLAIN value captured once as the uncontrolled initial.',
    },
    {
      label: 'Hooks return signals, not plain values',
      note: 'Every hook returns `Signal<T>` / `Computed<T>` / accessor objects — never plain values. Read by calling: `size().width`, `bp().md`, `online()`. This is the cost of fine-grained reactivity but the reward is composition: hooks chain into `effect` / `computed` directly without re-bridging into Pyreon\'s reactivity graph.',
    },
    {
      label: 'SSR-safe by construction',
      note: 'Every hook that touches a browser API (`window`, `document`, `navigator`, `IntersectionObserver`, `ResizeObserver`, `MediaQueryList`) is guarded so SSR returns a sensible default and the listener is registered inside `onMount`. Do not wrap hook calls in `if (typeof window !== "undefined")` — the hook does it for you, and your wrapper would skip the hook on the SSR-rendered shell where it should still register no-op state.',
    },
    {
      label: 'Auto-cleanup on unmount — never call `addEventListener` directly',
      note: 'Every observer/listener/timer hook (`useEventListener`, `useClickOutside`, `useElementSize`, `useIntersection`, `useInterval`, `useTimeout`, `useIdle`, etc.) registers an `onUnmount` cleanup. In primitives, never reach for raw `addEventListener` / `removeEventListener` — use `useEventListener`. The framework lint rules `pyreon/no-raw-addeventlistener` and `pyreon/no-raw-setinterval` flag direct DOM listener / timer registration in component code.',
    },
    {
      label: '`useBreakpoint` reads the theme, `useMediaQuery` is raw',
      note: '`useBreakpoint()` reads `theme.breakpoints` so swapping themes (or unit systems) Just Works — use it for layout decisions tied to the design system. `useMediaQuery("(max-width: 640px)")` is a raw media-query escape hatch — use it for one-off queries that don\'t correspond to a theme breakpoint (`(prefers-contrast: more)`, `(orientation: landscape)`, etc.).',
    },
  ],
})
