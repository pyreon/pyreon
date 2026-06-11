import type { Ref, VNodeChild } from '@pyreon/core'
import { createRef, onMount, onUnmount } from '@pyreon/core'
import { isServer, signal } from '@pyreon/reactivity'
import { useIntersectionObserver } from './utils/use-intersection-observer'

// ─── Script optimization component ─────────────────────────────────────────
//
// <Script> provides optimized third-party script loading:
// - Defer loading until after hydration
// - Load on idle (requestIdleCallback)
// - Load on interaction (click, scroll, etc.)
// - Load on viewport entry
//
// Three levels of API (mirrors @pyreon/zero/link and @pyreon/zero/image):
//
// 1. useScript(props)   — composable returning load-state signals + sentinel ref
// 2. createScript(Comp) — HOC wrapping any component with script load behavior
// 3. Script             — default sentinel-or-null component (built on createScript)

export interface ScriptProps {
  /** Script source URL. */
  src: string
  /** Loading strategy. Default: "afterHydration" */
  strategy?: ScriptStrategy
  /** Inline script content (alternative to src). */
  children?: string
  /** Script id for deduplication. */
  id?: string
  /** Async attribute. Default: true */
  async?: boolean
  /** onLoad callback — fires when the `<script>` finishes loading. */
  onLoad?: () => void
  /** onError callback — fires when the `<script>` fails to load. */
  onError?: (error: Error) => void
}

export type ScriptStrategy =
  | 'beforeHydration'
  | 'afterHydration'
  | 'onIdle'
  | 'onInteraction'
  | 'onViewport'

/** Return type of {@link useScript}. */
export interface UseScriptReturn {
  /** Ref — attach to the sentinel element for `onViewport` strategy. Undefined for other strategies. */
  sentinelRef: Ref<HTMLElement> | undefined
  /** Whether the script has finished loading (onLoad fired). */
  loaded: () => boolean
  /** Whether the script load failed (onError fired). */
  errored: () => boolean
  /** Whether the script is in the strategy state machine awaiting a trigger (idle/interaction/viewport). */
  pending: () => boolean
  /** Whether the consumer needs to render a sentinel element (only true for `onViewport`). */
  needsSentinel: boolean
  /** Imperatively trigger the script load. Already invoked automatically by the strategy. */
  load: () => void
}

/** Props passed to a custom component via {@link createScript}. */
export interface ScriptRenderProps {
  /** Ref — attach to whatever sentinel element you render (only matters for `onViewport`). */
  sentinelRef: Ref<HTMLElement> | undefined
  /** Whether the script is in viewport-wait mode (true → render a sentinel; false → render null). */
  needsSentinel: boolean
  /** Whether the script has finished loading (onLoad fired). */
  loaded: () => boolean
  /** Whether the script load failed (onError fired). */
  errored: () => boolean
  /** Whether the script is in the strategy state machine awaiting a trigger. */
  pending: () => boolean
}

/**
 * Composable that provides all script loading behavior — strategy state
 * machine (afterHydration / onIdle / onInteraction / onViewport),
 * deduplication, load/error tracking.
 *
 * Returns reactive signals (`loaded`, `errored`, `pending`) so consumers
 * can render loading indicators, retry buttons, or analytics-readiness
 * gates without re-implementing the strategy machine.
 *
 * @example
 * function MyScript(props: ScriptProps) {
 *   const s = useScript(props)
 *   return (
 *     <>
 *       {() => s.loaded() ? <Analytics /> : <Skeleton />}
 *       {() => s.needsSentinel && <div ref={s.sentinelRef} style="width:0;height:0" />}
 *     </>
 *   )
 * }
 */
export function useScript(props: ScriptProps): UseScriptReturn {
  const strategy = props.strategy ?? 'afterHydration'
  const loaded = signal(false)
  const errored = signal(false)
  const pending = signal(strategy !== 'beforeHydration' && strategy !== 'afterHydration')
  const sentinelRef = strategy === 'onViewport' ? createRef<HTMLElement>() : undefined

  function loadScript() {
    // Only invoked from `onMount` or strategy triggers — explicit guard
    // documents the SSR-safety contract at the callsite (the rule can't
    // AST-trace the indirect call).
    if (isServer) return
    // Deduplication — short-circuit if a script with the same id exists.
    if (props.id && document.getElementById(props.id)) {
      loaded.set(true)
      pending.set(false)
      return
    }

    const script = document.createElement('script')
    if (props.src) script.src = props.src
    if (props.id) script.id = props.id
    script.async = props.async !== false

    script.onload = () => {
      loaded.set(true)
      pending.set(false)
      props.onLoad?.()
    }
    script.onerror = () => {
      errored.set(true)
      pending.set(false)
      props.onError?.(new Error(`Failed to load: ${props.src}`))
    }

    if (props.children && !props.src) {
      script.textContent = props.children
      // Inline scripts have no async load event — mark loaded synchronously
      // post-append so consumers can react. setTimeout 0 keeps the order
      // (DOM append → script body executes → next microtask → signals update).
      setTimeout(() => {
        loaded.set(true)
        pending.set(false)
      }, 0)
    }

    document.head.appendChild(script)
  }

  onMount(() => {
    switch (strategy) {
      case 'beforeHydration':
        // Already in HTML — do nothing.
        loaded.set(true)
        pending.set(false)
        break

      case 'afterHydration':
        // Load immediately after mount (hydration is complete).
        loadScript()
        break

      case 'onIdle':
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => loadScript(), { timeout: 5000 })
        } else {
          setTimeout(loadScript, 200)
        }
        break

      case 'onInteraction': {
        const events = ['click', 'scroll', 'keydown', 'touchstart']
        function handler() {
          for (const e of events) document.removeEventListener(e, handler)
          loadScript()
        }
        for (const e of events) {
          document.addEventListener(e, handler, { once: true, passive: true })
        }
        onUnmount(() => {
          for (const e of events) document.removeEventListener(e, handler)
        })
        break
      }

      case 'onViewport':
        // Handled below via useIntersectionObserver on the sentinel ref.
        break
    }
    return undefined
  })

  if (strategy === 'onViewport') {
    useIntersectionObserver(
      () => sentinelRef!.current ?? undefined,
      () => loadScript(),
    )
  }

  return {
    sentinelRef,
    loaded,
    errored,
    pending,
    needsSentinel: strategy === 'onViewport',
    load: loadScript,
  }
}

/**
 * Higher-order component that wraps any component with script load behavior.
 *
 * The wrapped component receives {@link ScriptRenderProps} with the sentinel
 * ref, load-state signals, and a `needsSentinel` flag. Use this when you want
 * to render a loading indicator, retry button, or custom analytics-readiness
 * gate around the script load.
 *
 * @example
 * // Script with a loading indicator
 * const TrackedScript = createScript((props) => (
 *   <>
 *     {() => props.pending() && <Spinner />}
 *     {() => props.errored() && <button onClick={() => location.reload()}>Retry</button>}
 *     {props.needsSentinel && <div ref={props.sentinelRef} style="width:0;height:0" />}
 *   </>
 * ))
 *
 * <TrackedScript src="/analytics.js" strategy="onIdle" />
 */
export function createScript(
  Component: (p: ScriptRenderProps) => any,
): (props: ScriptProps) => any {
  return function WrappedScript(props: ScriptProps) {
    const s = useScript(props)
    return (
      <Component
        sentinelRef={s.sentinelRef}
        needsSentinel={s.needsSentinel}
        loaded={s.loaded}
        errored={s.errored}
        pending={s.pending}
      />
    )
  }
}

/**
 * Default optimized script component. Renders a 0×0 sentinel `<div>` for the
 * `onViewport` strategy (so IntersectionObserver has an element to observe),
 * `null` for every other strategy.
 *
 * @example
 * // Load analytics after page is interactive
 * <Script src="https://analytics.example.com/script.js" strategy="onIdle" />
 *
 * // Load chat widget when user scrolls
 * <Script src="/chat-widget.js" strategy="onViewport" />
 *
 * // Inline script with deferred execution
 * <Script strategy="afterHydration">
 *   {`console.log("App hydrated!")`}
 * </Script>
 */
export const Script: (props: ScriptProps) => VNodeChild = createScript((props) => {
  if (!props.needsSentinel) return null
  return <div ref={props.sentinelRef} style="width:0;height:0;overflow:hidden" />
})
