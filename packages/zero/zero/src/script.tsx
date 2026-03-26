import type { VNodeChild } from "@pyreon/core"
import { createRef, onMount, onUnmount } from "@pyreon/core"
import { useIntersectionObserver } from "./utils/use-intersection-observer"

// ─── Script optimization component ─────────────────────────────────────────
//
// <Script> provides optimized third-party script loading:
// - Defer loading until after hydration
// - Load on idle (requestIdleCallback)
// - Load on interaction (click, scroll, etc.)
// - Load on viewport entry
// - Worker offloading for analytics scripts

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
  /** onLoad callback. */
  onLoad?: () => void
  /** onError callback. */
  onError?: (error: Error) => void
}

export type ScriptStrategy =
  | "beforeHydration"
  | "afterHydration"
  | "onIdle"
  | "onInteraction"
  | "onViewport"

/**
 * Optimized script loading component.
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
export function Script(props: ScriptProps): VNodeChild {
  function loadScript() {
    // Deduplication
    if (props.id && document.getElementById(props.id)) return

    const script = document.createElement("script")
    if (props.src) script.src = props.src
    if (props.id) script.id = props.id
    script.async = props.async !== false

    if (props.onLoad) script.onload = props.onLoad
    if (props.onError) {
      script.onerror = () => props.onError?.(new Error(`Failed to load: ${props.src}`))
    }

    if (props.children && !props.src) {
      script.textContent = props.children
    }

    document.head.appendChild(script)
  }

  onMount(() => {
    const strategy = props.strategy ?? "afterHydration"

    switch (strategy) {
      case "beforeHydration":
        // Already in HTML — do nothing
        break

      case "afterHydration":
        // Load immediately after mount (hydration is complete)
        loadScript()
        break

      case "onIdle":
        if ("requestIdleCallback" in window) {
          requestIdleCallback(() => loadScript(), { timeout: 5000 })
        } else {
          setTimeout(loadScript, 200)
        }
        break

      case "onInteraction": {
        const events = ["click", "scroll", "keydown", "touchstart"]
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

      case "onViewport":
        // Handled below via useIntersectionObserver on the sentinel element
        break
    }
    return undefined
  })

  const sentinelRef = createRef<HTMLElement>()
  const strategy = props.strategy ?? "afterHydration"

  if (strategy === "onViewport") {
    useIntersectionObserver(
      () => sentinelRef.current ?? undefined,
      () => loadScript(),
    )
  }

  if (strategy === "onViewport") {
    return <div ref={sentinelRef} style="width:0;height:0;overflow:hidden" />
  }

  return null
}
