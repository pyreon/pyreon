import { effect, signal } from '@pyreon/reactivity'
import { Fragment, h } from './h'
import { onMount } from './lifecycle'
import { createRef } from './ref'
import type { ComponentFn, Props, VNode, VNodeChild, VNodeChildAccessor } from './types'

// Dev-mode gate (bundler-agnostic, see pyreon/no-process-dev-gate).
const __DEV__ = process.env.NODE_ENV !== 'production'

/**
 * Module shape `<Defer>` accepts from `chunk()`. Mirrors `lazy()`'s
 * contract — either an ES module with `default` export, OR a raw
 * `ComponentFn` returned directly (rare; covers re-export patterns).
 */
type ChunkResult<P extends Props> = { default: ComponentFn<P> } | ComponentFn<P>

/**
 * Trigger discriminant. Exactly ONE shape is provided:
 *   - `when={() => signal()}` — load when the accessor becomes truthy
 *   - `on="visible"`         — load when the wrapper enters the viewport
 *   - `on="idle"`            — load during browser idle time
 */
type DeferTrigger = { when: () => boolean } | { on: 'visible' | 'idle' }

/**
 * Set up the `on="idle"` trigger. Returns a teardown function the
 * caller must invoke on unmount. Browser-API access is gated by
 * `typeof` checks so SSR / jsdom environments fall back to a
 * `setTimeout(1)` shim. Extracted as a standalone helper so it's
 * directly testable without going through `onMount` (core tests
 * don't run in happy-dom; runtime-dom is where the lifecycle hooks
 * live).
 *
 * @internal Exported for tests; not part of the stable public API.
 */
export function _setupIdleTrigger(startLoad: () => void): () => void {
  const ric = (
    globalThis as { requestIdleCallback?: (cb: () => void) => number }
  ).requestIdleCallback
  const cic = (
    globalThis as { cancelIdleCallback?: (id: number) => void }
  ).cancelIdleCallback
  if (typeof ric === 'function') {
    const id = ric(startLoad)
    return () => cic?.(id)
  }
  const t = setTimeout(startLoad, 1)
  return () => clearTimeout(t)
}

/**
 * Set up the `on="visible"` trigger. Observes `el` via an
 * `IntersectionObserver` and fires `startLoad` once on the first
 * intersection. If `IntersectionObserver` is unavailable (jsdom)
 * or `el` is null (SSR), falls back to loading immediately.
 *
 * Returns a teardown function — call to disconnect the observer.
 *
 * @internal Exported for tests; not part of the stable public API.
 */
export function _setupVisibleTrigger(
  el: HTMLElement | null,
  startLoad: () => void,
  rootMargin: string,
): () => void {
  if (!el || typeof IntersectionObserver === 'undefined') {
    // Observer unavailable or no DOM target — load eagerly so the
    // user still sees the component in environments where the
    // viewport-detection mechanism can't run.
    startLoad()
    return () => {}
  }
  const obs = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        startLoad()
        obs.disconnect()
      }
    },
    { rootMargin },
  )
  obs.observe(el)
  return () => obs.disconnect()
}

export type DeferProps<P extends Props> = DeferTrigger & {
  /**
   * Dynamic import to lazy-load. The literal `import('./X')` is what
   * Rolldown / Vite see when emitting chunks — using a variable here
   * defeats code splitting.
   */
  chunk: () => Promise<ChunkResult<P>>
  /**
   * Render-prop for the loaded component. Receives the resolved component
   * and returns its JSX with whatever props the parent needs to pass.
   * Optional — omitting it renders `<Comp />` with no props.
   */
  children?: (Component: ComponentFn<P>) => VNodeChild
  /** Shown while the chunk is loading. Default: `null`. */
  fallback?: VNodeChild
  /**
   * IntersectionObserver `rootMargin` for `on="visible"` mode. Default
   * `'200px'` — start loading the chunk before the wrapper is fully in
   * view so it's typically ready by the time the user scrolls to it.
   */
  rootMargin?: string
}

/**
 * Lazy-load a chunk when a trigger condition is met.
 *
 * Three trigger modes:
 *   - `when={() => signal()}` — load when condition flips truthy (modal pattern)
 *   - `on="visible"`         — load when the wrapper scrolls into view
 *   - `on="idle"`            — load during browser idle time
 *
 * The chunk fetch is fired exactly once per `Defer` instance — repeated
 * trigger firings after the chunk loads are no-ops.
 *
 * @example
 * // Signal-driven (modal):
 * <Defer chunk={() => import('./ConfirmDeleteModal')} when={open}>
 *   {Modal => <Modal onClose={() => setOpen(false)} />}
 * </Defer>
 *
 * @example
 * // Viewport-driven (below-fold):
 * <Defer chunk={() => import('./Comments')} on="visible">
 *   {Comments => <Comments postId={id} />}
 * </Defer>
 *
 * @example
 * // Idle-driven (non-critical):
 * <Defer chunk={() => import('./Analytics')} on="idle">
 *   {Dashboard => <Dashboard />}
 * </Defer>
 */
export function Defer<P extends Props>(props: DeferProps<P>): VNode {
  const Loaded = signal<ComponentFn<P> | null>(null)
  const Failed = signal<Error | null>(null)
  // Module-scope flag prevents repeat fetches when the trigger condition
  // oscillates (e.g. modal opens / closes / opens again). The chunk only
  // loads once per Defer mount.
  let loadStarted = false

  const startLoad = (): void => {
    if (loadStarted) return
    loadStarted = true
    props
      .chunk()
      .then((mod) => {
        // Accept both ES-module-default and bare ComponentFn shapes.
        const Comp =
          typeof mod === 'function'
            ? mod
            : (mod as { default: ComponentFn<P> }).default
        if (__DEV__ && typeof Comp !== 'function') {
          // oxlint-disable-next-line no-console
          console.warn(
            '[Pyreon] <Defer> chunk() resolved without a default-exported component. Make sure your module exports default.',
          )
          return
        }
        Loaded.set(Comp)
      })
      .catch((err) => {
        const wrapped = err instanceof Error ? err : new Error(String(err))
        if (__DEV__) {
          // oxlint-disable-next-line no-console
          console.error('[Pyreon] <Defer> chunk() rejected:', wrapped)
        }
        Failed.set(wrapped)
      })
  }

  // Trigger wiring — exactly one branch fires per instance.
  if ('when' in props) {
    // Signal-driven. Subscribe to the accessor; load when it transitions
    // to truthy. Repeat truthy emissions are no-ops via `loadStarted`.
    effect(() => {
      if (props.when() && !loadStarted) startLoad()
    })
  } else if (props.on === 'idle') {
    // Idle-driven. Delegated to `_setupIdleTrigger` so the browser-API
    // branching is testable as a pure function. Wrapped in onMount so
    // SSR / non-browser environments don't fire the callback at all.
    onMount(() => _setupIdleTrigger(startLoad))
  }
  // Note: `on === 'visible'` is wired below alongside the wrapper element
  // because it needs a DOM target to observe.

  // Inline accessor — type annotation deliberately omitted so the
  // inferred return type narrows to `VNodeChildAtom | VNodeChildAtom[]`
  // (what `h()`'s rest-args expect). Annotating as `VNodeChild` widens
  // to include `VNodeChildAccessor`, which can't be returned from another
  // accessor.
  const renderContent = () => {
    const err = Failed()
    if (err) throw err
    const Comp = Loaded()
    if (!Comp) return props.fallback ?? null
    return props.children ? props.children(Comp) : h(Comp as ComponentFn, {})
  }

  if ('on' in props && props.on === 'visible') {
    // Visible-mode needs a DOM target for IntersectionObserver. A
    // wrapper `<div data-pyreon-defer="visible">` carries the ref and
    // styles `display: contents` so it's transparent to layout (the
    // fallback / loaded component render as direct children of Defer's
    // parent).
    const containerRef = createRef<HTMLElement>()
    // Visible-mode trigger is wired via `_setupVisibleTrigger` so the
    // observer-construction + intersection-detection logic is
    // independently testable. onMount keeps the browser-API access
    // out of the SSR path.
    onMount(() =>
      _setupVisibleTrigger(
        containerRef.current,
        startLoad,
        props.rootMargin ?? '200px',
      ),
    )
    // Cast renderContent to VNodeChildAccessor — its inferred return type
    // is `VNodeChild` (broader than the accessor's `atom | atom[]`) because
    // `props.children` itself may return any VNodeChild. The runtime
    // unwraps nested accessors via the same mountChild path that handles
    // <Show>'s thunk shape; the type system doesn't model the unwrap so
    // the cast bridges. See <Show>'s `as unknown as VNode` for prior art.
    return h(
      'div',
      {
        'data-pyreon-defer': 'visible',
        ref: containerRef,
        style: 'display: contents',
      },
      renderContent as VNodeChildAccessor,
    )
  }

  return h(Fragment, null, renderContent as VNodeChildAccessor)
}
