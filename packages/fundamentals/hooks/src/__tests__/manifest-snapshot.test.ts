import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import hooksManifest from '../manifest'

// Snapshot of the exact rendered llms.txt line + llms-full.txt section
// for @pyreon/hooks. Mirrors the flow / query / form references so a
// manifest edit surfaces as a failing inline snapshot locally (fast)
// in addition to the CI `Docs Sync` gate.
//
// Update intentionally via `bun run test -- -u` after a deliberate
// manifest change.

describe('gen-docs — hooks snapshot', () => {
  it('renders @pyreon/hooks to its expected llms.txt bullet', () => {
    expect(renderLlmsTxtLine(hooksManifest)).toMatchInlineSnapshot(`"- @pyreon/hooks — 46 signal-based hooks: state (useToggle/useCounter/usePrevious/useLatest/useControllableState), DOM (useEventListener/useClickOutside/useFocus/useHover/useFocusTrap/useFocusReturn/useElementSize/useWindowResize/useWindowScroll/useScrollLock/useIntersection/useInfiniteScroll), responsive (useBreakpoint/useMediaQuery/useColorScheme/useSizeClass/useReducedMotion), timing (useDebouncedValue/useDebouncedCallback/useThrottledCallback/useInterval/useTimeout/useTimeAgo), interaction (useClipboard/useHaptics/useShare/useLinking/useNotifications/useBiometrics/useImagePicker/useFilePicker/useDialog/useKeyboard/useOnline/useAppState/useDocumentVisibility/useIdle), data (useFetch), composition (useMergedRef/useUpdateEffect/useIsomorphicLayoutEffect). \`useControllableState({ value, defaultValue, onChange })\` is the canonical controlled/uncontrolled pattern. Every primitive in \`@pyreon/ui-primitives\` uses it. Reimplementing the \`isControlled + signal + getter\` shape by hand was the #1 anti-pattern across primitives before the helper landed. Pass \`value\` as a FUNCTION (\`() => props.checked\`) so the controlled prop read tracks reactively; \`defaultValue\` is a PLAIN value captured once as the uncontrolled initial."`)
  })

  it('renders @pyreon/hooks to its expected llms-full.txt section — full body snapshot', () => {
    expect(renderLlmsFullSection(hooksManifest)).toMatchInlineSnapshot(`
      "## @pyreon/hooks — Signal-Based Hooks

      Signal-based hooks for Pyreon — 46 reactive primitives covering state, DOM, responsive, timing, interaction, data, and composition. Every hook is SSR-safe (browser API access guarded), self-cleaning (registers \`onUnmount\` for listeners/observers/timers), and signal-native: hooks return \`Signal<T>\` / \`Computed<T>\` accessors, never plain values, so consumers compose with \`effect\`/\`computed\` without re-bridging. \`useControllableState\` is the canonical controlled/uncontrolled pattern used by every \`@pyreon/ui-primitives\` component — never reimplement the \`isControlled + signal + getter\` shape by hand.

      \`\`\`typescript
      import {
        // State
        useToggle, useCounter, usePrevious, useLatest, useControllableState,
        // DOM
        useEventListener, useClickOutside, useFocus, useHover, useFocusTrap,
        useElementSize, useWindowResize, useWindowScroll, useScrollLock, useIntersection, useInfiniteScroll,
        // Responsive
        useBreakpoint, useMediaQuery, useColorScheme, useSizeClass, useReducedMotion,
        // Timing
        useDebouncedValue, useDebouncedCallback, useThrottledCallback, useInterval, useTimeout, useTimeAgo,
        // Interaction
        useClipboard, useHaptics, useShare, useLinking, useNotifications, useBiometrics, useDialog, useKeyboard, useOnline, useDocumentVisibility, useIdle,
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
      const sizeClass = useSizeClass()           // () => 'compact' | 'regular' — SwiftUI/Compose size-class analog (min-width: 600px)
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
      \`\`\`

      > **Use \`useControllableState\` for controlled/uncontrolled — never reimplement**: \`useControllableState({ value, defaultValue, onChange })\` is the canonical controlled/uncontrolled pattern. Every primitive in \`@pyreon/ui-primitives\` uses it. Reimplementing the \`isControlled + signal + getter\` shape by hand was the #1 anti-pattern across primitives before the helper landed. Pass \`value\` as a FUNCTION (\`() => props.checked\`) so the controlled prop read tracks reactively; \`defaultValue\` is a PLAIN value captured once as the uncontrolled initial.
      >
      > **Hooks return signals, not plain values**: Every hook returns \`Signal<T>\` / \`Computed<T>\` / accessor objects — never plain values. Read by calling: \`size().width\`, \`bp().md\`, \`online()\`. This is the cost of fine-grained reactivity but the reward is composition: hooks chain into \`effect\` / \`computed\` directly without re-bridging into Pyreon's reactivity graph.
      >
      > **SSR-safe by construction**: Every hook that touches a browser API (\`window\`, \`document\`, \`navigator\`, \`IntersectionObserver\`, \`ResizeObserver\`, \`MediaQueryList\`) is guarded so SSR returns a sensible default and the listener is registered inside \`onMount\`. Do not wrap hook calls in \`if (typeof window !== "undefined")\` — the hook does it for you, and your wrapper would skip the hook on the SSR-rendered shell where it should still register no-op state.
      >
      > **Auto-cleanup on unmount — never call \`addEventListener\` directly**: Every observer/listener/timer hook (\`useEventListener\`, \`useClickOutside\`, \`useElementSize\`, \`useIntersection\`, \`useInterval\`, \`useTimeout\`, \`useIdle\`, etc.) registers an \`onUnmount\` cleanup. In primitives, never reach for raw \`addEventListener\` / \`removeEventListener\` — use \`useEventListener\`. The framework lint rules \`pyreon/no-raw-addeventlistener\` and \`pyreon/no-raw-setinterval\` flag direct DOM listener / timer registration in component code.
      >
      > **\`useBreakpoint\` reads the theme, \`useMediaQuery\` is raw**: \`useBreakpoint()\` reads \`theme.breakpoints\` so swapping themes (or unit systems) Just Works — use it for layout decisions tied to the design system. \`useMediaQuery("(max-width: 640px)")\` is a raw media-query escape hatch — use it for one-off queries that don't correspond to a theme breakpoint (\`(prefers-contrast: more)\`, \`(orientation: landscape)\`, etc.).
      "
    `)
  })

  it('renders @pyreon/hooks to MCP api-reference entries — one per api[] item', () => {
    const record = renderApiReferenceEntries(hooksManifest)
    expect(Object.keys(record).length).toBe(45)
    // The 25 previously-undocumented hooks are now in api[].
    expect(Object.keys(record)).toContain('hooks/useToggle')
    expect(Object.keys(record)).toContain('hooks/useBiometrics')
    expect(Object.keys(record)).toContain('hooks/useImagePicker')
    expect(Object.keys(record)).toContain('hooks/useFilePicker')
    expect(Object.keys(record)).toContain('hooks/useMediaQuery')
    expect(Object.keys(record)).toContain('hooks/useScrollLock')
    expect(Object.keys(record)).toContain('hooks/useIntersection')
    expect(Object.keys(record)).toContain('hooks/useControllableState')
    expect(Object.keys(record)).toContain('hooks/useFocusReturn')
    expect(Object.keys(record)).toContain('hooks/useFetch')
    expect(Object.keys(record)).toContain('hooks/useEventListener')
    expect(Object.keys(record)).toContain('hooks/useFocusTrap')
    expect(Object.keys(record)).toContain('hooks/useInfiniteScroll')
    expect(Object.keys(record)).toContain('hooks/useIsomorphicLayoutEffect')
    expect(Object.keys(record)).toContain('hooks/useCounter')
    expect(Object.keys(record)).toContain('hooks/useWindowScroll')
    expect(Object.keys(record)).toContain('hooks/useDocumentVisibility')
    expect(Object.keys(record)).toContain('hooks/useIdle')

    const ctrl = record['hooks/useControllableState']!
    expect(ctrl.mistakes?.split('\n').length).toBe(3)
    expect(ctrl.notes).toContain('controlled/uncontrolled')

    const focusTrap = record['hooks/useFocusTrap']!
    expect(focusTrap.mistakes?.split('\n').length).toBe(3)

    const infinite = record['hooks/useInfiniteScroll']!
    expect(infinite.mistakes?.split('\n').length).toBe(3)
    expect(infinite.notes).toContain('IntersectionObserver')
  })
})
