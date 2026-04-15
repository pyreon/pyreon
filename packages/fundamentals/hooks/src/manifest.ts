import { defineManifest } from '@pyreon/manifest'

/**
 * Fourth migration to the T2.1 pipeline. @pyreon/hooks ships 35
 * signal-based hooks across six categories — too many to enumerate
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
    '35 signal-based hooks: state (useToggle/usePrevious/useLatest/useControllableState), DOM (useEventListener/useClickOutside/useFocus/useHover/useFocusTrap/useElementSize/useWindowResize/useScrollLock/useIntersection/useInfiniteScroll), responsive (useBreakpoint/useMediaQuery/useColorScheme/useReducedMotion/useThemeValue/useSpacing/useRootSize), timing (useDebouncedValue/useDebouncedCallback/useThrottledCallback/useInterval/useTimeout/useTimeAgo), interaction (useClipboard/useDialog/useKeyboard/useOnline), composition (useMergedRef/useUpdateEffect/useIsomorphicLayoutEffect)',
  description:
    'Signal-based hooks for Pyreon — 35 reactive primitives covering state, DOM, responsive, timing, interaction, and composition. Every hook is SSR-safe (browser API access guarded), self-cleaning (registers `onUnmount` for listeners/observers/timers), and signal-native: hooks return `Signal<T>` / `Computed<T>` accessors, never plain values, so consumers compose with `effect`/`computed` without re-bridging. `useControllableState` is the canonical controlled/uncontrolled pattern used by every `@pyreon/ui-primitives` component — never reimplement the `isControlled + signal + getter` shape by hand.',
  category: 'universal',
  longExample: `import {
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
//    the \`isControlled + signal + getter\` shape by hand.
function MyToggle(props: { checked?: boolean; defaultChecked?: boolean; onChange?: (v: boolean) => void }) {
  const [checked, setChecked] = useControllableState({
    value: () => props.checked,            // controlled — function so signal reads track
    defaultValue: () => props.defaultChecked ?? false,
    onChange: props.onChange,
  })
  return <button onClick={() => setChecked(!checked())}>{() => checked() ? 'on' : 'off'}</button>
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
const { copy, copied } = useClipboard()    // \`copied\` auto-resets after 2s
copy('hello')
const dialog = useDialog()                 // native <dialog> with open/close/returnValue
const online = useOnline()                 // Signal<boolean>

// 8. Composition primitives.
const merged = useMergedRef(localRef, props.ref)   // forward ref + capture local
useUpdateEffect(() => save(value()), [value])      // skips first run (mount-only effect)
useIsomorphicLayoutEffect(() => measure())          // useLayoutEffect on client, no-op on SSR`,
  features: [
    '35 signal-based hooks across 6 categories',
    'State: useToggle, usePrevious, useLatest, useControllableState',
    'DOM: useEventListener, useClickOutside, useFocus, useHover, useFocusTrap, useElementSize, useWindowResize, useScrollLock, useIntersection, useInfiniteScroll',
    'Responsive: useBreakpoint, useMediaQuery, useColorScheme, useReducedMotion, useThemeValue, useSpacing, useRootSize',
    'Timing: useDebouncedValue, useDebouncedCallback, useThrottledCallback, useInterval, useTimeout, useTimeAgo',
    'Interaction: useClipboard, useDialog, useKeyboard, useOnline',
    'Composition: useMergedRef, useUpdateEffect, useIsomorphicLayoutEffect',
    'Every hook is SSR-safe and auto-cleans on unmount',
    'Signal-native return shapes — compose with `effect` / `computed` without re-bridging',
  ],
  api: [
    {
      name: 'useControllableState',
      kind: 'hook',
      signature:
        '<T>(opts: { value?: () => T | undefined; defaultValue: () => T; onChange?: (v: T) => void }) => [Signal<T>, (v: T) => void]',
      summary:
        'Canonical controlled/uncontrolled state pattern. Returns a `[value, setValue]` tuple where the setter respects controlled mode (calls `onChange` only if controlled, mutates internal signal if uncontrolled). Used by every primitive in `@pyreon/ui-primitives`. Never reimplement the `isControlled + signal + getter` shape by hand. `value` and `defaultValue` are FUNCTIONS so signal reads track reactively — passing a plain value loses controlled/uncontrolled detection on prop changes.',
      example: `function MyToggle(props: { checked?: boolean; defaultChecked?: boolean; onChange?: (v: boolean) => void }) {
  const [checked, setChecked] = useControllableState({
    value: () => props.checked,
    defaultValue: () => props.defaultChecked ?? false,
    onChange: props.onChange,
  })
  return <button onClick={() => setChecked(!checked())}>{() => checked() ? 'on' : 'off'}</button>
}`,
      mistakes: [
        'Passing `value: props.checked` (not a function) — loses reactivity on prop changes',
        'Mutating the returned signal directly with `.set()` instead of using the returned setter — bypasses the controlled-mode check',
      ],
      seeAlso: ['useToggle', 'usePrevious'],
    },
    {
      name: 'useEventListener',
      kind: 'hook',
      signature:
        '(target: EventTarget | (() => EventTarget | null), event: string, handler: EventListener, options?: AddEventListenerOptions) => void',
      summary:
        'Register a DOM event listener with automatic cleanup on unmount. Use this instead of raw `addEventListener` in primitives — never `addEventListener` / `removeEventListener` directly in component code (the cleanup is the hook\'s whole job). `target` may be a getter so reactive refs (`() => buttonRef()`) re-bind when the underlying element changes.',
      example: `useEventListener(window, 'resize', () => layoutSig.set(measure()))
useEventListener(() => panelRef(), 'keydown', (e) => {
  if (e.key === 'Escape') setOpen(false)
})`,
      seeAlso: ['useClickOutside', 'useKeyboard'],
    },
    {
      name: 'useClickOutside',
      kind: 'hook',
      signature: '(ref: () => HTMLElement | null, handler: (e: MouseEvent) => void) => void',
      summary:
        'Fire a callback when the user clicks outside the referenced element. Foundation for click-to-dismiss popovers, dropdowns, modals. Pair with `useFocusTrap` + `useScrollLock` for the full modal package.',
      example: `useClickOutside(() => panelRef(), () => setOpen(false))`,
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
      signature: '(ref: () => HTMLElement | null, active: () => boolean) => void',
      summary:
        'Trap Tab/Shift+Tab focus inside the referenced element while `active()` is true. Required for modals / drawers / fullscreen overlays to be keyboard-accessible. Returns focus to the previously-focused element on deactivation.',
      example: `const isOpen = signal(false)
useFocusTrap(() => modalRef(), () => isOpen())
useScrollLock(() => isOpen())`,
      seeAlso: ['useScrollLock', 'useDialog', 'useClickOutside'],
    },
    {
      name: 'useBreakpoint',
      kind: 'hook',
      signature: '() => Signal<{ xs: boolean; sm: boolean; md: boolean; lg: boolean; xl: boolean }>',
      summary:
        'Reactive breakpoint flags driven by the **theme**, not raw media queries — reads `theme.breakpoints` so swapping themes (or unit systems) Just Works. Use `useMediaQuery` for one-off arbitrary queries.',
      example: `const bp = useBreakpoint()
{() => bp().md ? <DesktopNav /> : <MobileNav />}`,
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
      seeAlso: ['useDebouncedCallback', 'useThrottledCallback'],
    },
    {
      name: 'useClipboard',
      kind: 'hook',
      signature: '(timeoutMs?: number) => { copy: (text: string) => Promise<void>; copied: Signal<boolean> }',
      summary:
        '`navigator.clipboard.writeText` wrapped with a reactive `copied` flag that auto-resets after `timeoutMs` (default 2000). Use the `copied` signal to flash a "Copied!" UI cue without manual timer management.',
      example: `const { copy, copied } = useClipboard()
<button onClick={() => copy(token)}>{() => copied() ? 'Copied!' : 'Copy'}</button>`,
      seeAlso: ['useDialog', 'useOnline'],
    },
    {
      name: 'useDialog',
      kind: 'hook',
      signature: '() => { ref: (el: HTMLDialogElement | null) => void; open: () => void; close: (returnValue?: string) => void; isOpen: Signal<boolean>; returnValue: Signal<string> }',
      summary:
        'Native `<dialog>` element wrapper with reactive `isOpen` / `returnValue` signals. Handles `showModal()` / `close()` plumbing and the `cancel`/`close` event wiring so consumers don\'t reimplement the boilerplate.',
      example: `const dialog = useDialog()
<dialog ref={dialog.ref}>...</dialog>
<button onClick={dialog.open}>Open</button>`,
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
        '(onLoadMore: () => void | Promise<void>, opts?: { rootMargin?: string; threshold?: number; enabled?: () => boolean }) => { sentinelRef: (el: HTMLElement | null) => void; isLoading: Signal<boolean> }',
      summary:
        '`IntersectionObserver`-based infinite loading. Attach the returned `sentinelRef` to a node at the bottom of the list — when it scrolls into view, `onLoadMore` fires. `isLoading` blocks re-fires until the promise resolves. `enabled` accessor lets you stop observing once you\'ve loaded the last page.',
      example: `const { sentinelRef, isLoading } = useInfiniteScroll(loadNextPage, { rootMargin: '200px', enabled: () => hasMore() })
<For each={items()} by={(i) => i.id}>{(item) => <Row data={item} />}</For>
<div ref={sentinelRef}>{() => isLoading() && 'Loading…'}</div>`,
      seeAlso: ['useIntersection'],
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
      signature: '(fn: () => void | (() => void), deps: Signal<unknown>[]) => void',
      summary:
        'Like `effect` but skips the initial run — only fires when one of the tracked signals updates *after* mount. Use for "save on change but not on first render" patterns where the initial value is already persisted.',
      example: `useUpdateEffect(() => api.save(value()), [value])
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
  ],
  gotchas: [
    // First gotcha feeds the llms.txt teaser. Pick the most distinctive
    // foot-gun: re-implementing the controlled/uncontrolled pattern by
    // hand is the single most common mistake in primitives, and the
    // anti-patterns rule already calls it out.
    {
      label: 'Use `useControllableState` for controlled/uncontrolled — never reimplement',
      note: '`useControllableState({ value, defaultValue, onChange })` is the canonical controlled/uncontrolled pattern. Every primitive in `@pyreon/ui-primitives` uses it. Reimplementing the `isControlled + signal + getter` shape by hand was the #1 anti-pattern across primitives before the helper landed. Pass `value` and `defaultValue` as FUNCTIONS so signal reads track reactively — a plain value loses prop-driven controlled/uncontrolled detection.',
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
      note: 'Every observer/listener/timer hook (`useEventListener`, `useClickOutside`, `useElementSize`, `useIntersection`, `useInterval`, `useTimeout`, etc.) registers an `onUnmount` cleanup. In primitives, never reach for raw `addEventListener` / `removeEventListener` — use `useEventListener`. The framework lint rule `pyreon/use-pyreon-hooks` (planned) will flag direct DOM listener registration in component code.',
    },
    {
      label: '`useBreakpoint` reads the theme, `useMediaQuery` is raw',
      note: '`useBreakpoint()` reads `theme.breakpoints` so swapping themes (or unit systems) Just Works — use it for layout decisions tied to the design system. `useMediaQuery("(max-width: 640px)")` is a raw media-query escape hatch — use it for one-off queries that don\'t correspond to a theme breakpoint (`(prefers-contrast: more)`, `(orientation: landscape)`, etc.).',
    },
  ],
})
