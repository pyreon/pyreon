import { renderLlmsFullSection, renderLlmsTxtLine } from '@pyreon/manifest'
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
    expect(renderLlmsTxtLine(hooksManifest)).toMatchInlineSnapshot(`"- @pyreon/hooks — 35 signal-based hooks: state (useToggle/usePrevious/useLatest/useControllableState), DOM (useEventListener/useClickOutside/useFocus/useHover/useFocusTrap/useElementSize/useWindowResize/useScrollLock/useIntersection/useInfiniteScroll), responsive (useBreakpoint/useMediaQuery/useColorScheme/useReducedMotion/useThemeValue/useSpacing/useRootSize), timing (useDebouncedValue/useDebouncedCallback/useThrottledCallback/useInterval/useTimeout/useTimeAgo), interaction (useClipboard/useDialog/useKeyboard/useOnline), composition (useMergedRef/useUpdateEffect/useIsomorphicLayoutEffect). \`useControllableState({ value, defaultValue, onChange })\` is the canonical controlled/uncontrolled pattern. Every primitive in \`@pyreon/ui-primitives\` uses it. Reimplementing the \`isControlled + signal + getter\` shape by hand was the #1 anti-pattern across primitives before the helper landed. Pass \`value\` and \`defaultValue\` as FUNCTIONS so signal reads track reactively — a plain value loses prop-driven controlled/uncontrolled detection."`)
  })

  it('renders @pyreon/hooks to its expected llms-full.txt section — full body snapshot', () => {
    expect(renderLlmsFullSection(hooksManifest)).toMatchInlineSnapshot(`
      "## @pyreon/hooks — Signal-Based Hooks

      Signal-based hooks for Pyreon — 35 reactive primitives covering state, DOM, responsive, timing, interaction, and composition. Every hook is SSR-safe (browser API access guarded), self-cleaning (registers \`onUnmount\` for listeners/observers/timers), and signal-native: hooks return \`Signal<T>\` / \`Computed<T>\` accessors, never plain values, so consumers compose with \`effect\`/\`computed\` without re-bridging. \`useControllableState\` is the canonical controlled/uncontrolled pattern used by every \`@pyreon/ui-primitives\` component — never reimplement the \`isControlled + signal + getter\` shape by hand.

      \`\`\`typescript
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
      useIsomorphicLayoutEffect(() => measure())          // useLayoutEffect on client, no-op on SSR
      \`\`\`

      > **Use \`useControllableState\` for controlled/uncontrolled — never reimplement**: \`useControllableState({ value, defaultValue, onChange })\` is the canonical controlled/uncontrolled pattern. Every primitive in \`@pyreon/ui-primitives\` uses it. Reimplementing the \`isControlled + signal + getter\` shape by hand was the #1 anti-pattern across primitives before the helper landed. Pass \`value\` and \`defaultValue\` as FUNCTIONS so signal reads track reactively — a plain value loses prop-driven controlled/uncontrolled detection.
      >
      > **Hooks return signals, not plain values**: Every hook returns \`Signal<T>\` / \`Computed<T>\` / accessor objects — never plain values. Read by calling: \`size().width\`, \`bp().md\`, \`online()\`. This is the cost of fine-grained reactivity but the reward is composition: hooks chain into \`effect\` / \`computed\` directly without re-bridging into Pyreon's reactivity graph.
      >
      > **SSR-safe by construction**: Every hook that touches a browser API (\`window\`, \`document\`, \`navigator\`, \`IntersectionObserver\`, \`ResizeObserver\`, \`MediaQueryList\`) is guarded so SSR returns a sensible default and the listener is registered inside \`onMount\`. Do not wrap hook calls in \`if (typeof window !== "undefined")\` — the hook does it for you, and your wrapper would skip the hook on the SSR-rendered shell where it should still register no-op state.
      >
      > **Auto-cleanup on unmount — never call \`addEventListener\` directly**: Every observer/listener/timer hook (\`useEventListener\`, \`useClickOutside\`, \`useElementSize\`, \`useIntersection\`, \`useInterval\`, \`useTimeout\`, etc.) registers an \`onUnmount\` cleanup. In primitives, never reach for raw \`addEventListener\` / \`removeEventListener\` — use \`useEventListener\`. The framework lint rule \`pyreon/use-pyreon-hooks\` (planned) will flag direct DOM listener registration in component code.
      >
      > **\`useBreakpoint\` reads the theme, \`useMediaQuery\` is raw**: \`useBreakpoint()\` reads \`theme.breakpoints\` so swapping themes (or unit systems) Just Works — use it for layout decisions tied to the design system. \`useMediaQuery("(max-width: 640px)")\` is a raw media-query escape hatch — use it for one-off queries that don't correspond to a theme breakpoint (\`(prefers-contrast: more)\`, \`(orientation: landscape)\`, etc.).
      "
    `)
  })
})
