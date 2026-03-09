import type { Props } from "@pyreon/core"
import { effect, batch } from "@pyreon/reactivity"

type Cleanup = () => void

/**
 * Directive function signature.
 * Receives the element and an `addCleanup` callback to register teardown logic.
 *
 * @example
 * const nFocus: Directive = (el) => { el.focus() }
 *
 * // With reactive value (via closure):
 * const nTooltip = (text: () => string): Directive => (el, addCleanup) => {
 *   const e = effect(() => { el.title = text() })
 *   addCleanup(() => e.dispose())
 * }
 *
 * // Usage:
 * h("input", { "n-focus": nFocus })
 * h("div",   { "n-tooltip": nTooltip(() => label()) })
 */
export type Directive = (el: HTMLElement, addCleanup: (fn: Cleanup) => void) => void

const __DEV__ = typeof process !== "undefined" && process.env.NODE_ENV !== "production"

/**
 * Sanitize an HTML string using the browser Sanitizer API (Chrome 105+).
 * Falls back to returning the string unchanged with a dev warning.
 */
export function sanitizeHtml(html: string): string {
  if (typeof window !== "undefined") {
    const san = (window as unknown as { Sanitizer?: new () => { sanitizeFor(tag: string, html: string): Element } }).Sanitizer
    if (san) {
      return new san().sanitizeFor("div", html).innerHTML
    }
  }
  if (__DEV__) {
    console.warn("[nova] sanitizeHtml: Sanitizer API unavailable — returning html unchanged.")
  }
  return html
}

// Matches onClick, onInput, onMouseEnter, etc.
const EVENT_RE = /^on[A-Z]/

/**
 * Apply all props to a DOM element.
 * Returns cleanup functions (for reactive props and event listeners).
 */
export function applyProps(el: Element, props: Props): Cleanup[] {
  const cleanups: Cleanup[] = []
  for (const key of Object.keys(props)) {
    if (key === "key" || key === "ref") continue
    const cleanup = applyProp(el, key, props[key])
    if (cleanup) cleanups.push(cleanup)
  }
  return cleanups
}

/**
 * Apply a single prop.
 *
 * - `onXxx` → addEventListener
 * - `() => value` (non-event function) → reactive via effect
 * - anything else → static attribute / DOM property
 */
export function applyProp(el: Element, key: string, value: unknown): Cleanup | null {
  // Event listener: onClick → "click"
  // Wrapped in batch() so multiple signal writes from one handler coalesce into one DOM update.
  if (EVENT_RE.test(key)) {
    const eventName = key[2]?.toLowerCase() + key.slice(3)
    const handler = value as EventListener
    const batched: EventListener = (e) => batch(() => handler(e))
    el.addEventListener(eventName, batched)
    return () => el.removeEventListener(eventName, batched)
  }

  // innerHTML — use Sanitizer API when available (Chrome 105+), warn in dev otherwise
  if (key === "innerHTML") {
    if (typeof (el as HTMLElement & { setHTML?: (h: string) => void }).setHTML === "function") {
      ;(el as HTMLElement & { setHTML: (h: string) => void }).setHTML(value as string)
    } else {
      if (__DEV__) {
        console.warn(
          "[nova] innerHTML: Sanitizer API unavailable — HTML is set unsanitized. " +
          "Use dangerouslySetInnerHTML with pre-sanitized content in production.",
        )
      }
      ;(el as HTMLElement).innerHTML = value as string
    }
    return null
  }
  // dangerouslySetInnerHTML — intentionally raw, developer owns sanitization (same as React)
  if (key === "dangerouslySetInnerHTML") {
    if (__DEV__) {
      console.warn("[nova] dangerouslySetInnerHTML: ensure content is sanitized before rendering.")
    }
    ;(el as HTMLElement).innerHTML = (value as { __html: string }).__html
    return null
  }

  // Custom directive: n-* keys call the directive function with (el, addCleanup)
  if (key.startsWith("n-")) {
    const directive = value as Directive
    const cleanups: Cleanup[] = []
    directive(el as HTMLElement, (fn) => cleanups.push(fn))
    return cleanups.length > 0 ? () => { for (const fn of cleanups) fn() } : null
  }

  // n-show: toggle display based on a reactive boolean
  if (key === "n-show") {
    const e = effect(() => {
      const visible = (value as () => boolean)()
      ;(el as HTMLElement).style.display = visible ? "" : "none"
    })
    return () => e.dispose()
  }

  // Reactive prop — function that returns the actual value
  if (typeof value === "function") {
    const e = effect(() => setStaticProp(el, key, (value as () => unknown)()))
    return () => e.dispose()
  }

  setStaticProp(el, key, value)
  return null
}

// Attributes that carry URLs and must be guarded against javascript:/data: injection.
const URL_ATTRS = new Set(["href", "src", "action", "formaction", "poster", "cite", "data"])
const UNSAFE_URL_RE = /^\s*(?:javascript|data):/i

function setStaticProp(el: Element, key: string, value: unknown): void {
  // Block javascript:/data: URI injection in URL-bearing attributes.
  if (URL_ATTRS.has(key) && typeof value === "string" && UNSAFE_URL_RE.test(value)) {
    if (__DEV__) console.warn(`[nova] Blocked unsafe ${key} value: "${value}"`)
    return
  }

  // class / className → always via setAttribute for consistency
  if (key === "class" || key === "className") {
    el.setAttribute("class", value == null ? "" : String(value))
    return
  }

  // style — accept string or object
  if (key === "style") {
    if (typeof value === "string") {
      ;(el as HTMLElement).style.cssText = value
    } else if (value != null && typeof value === "object") {
      Object.assign((el as HTMLElement).style, value)
    }
    return
  }

  // Null / undefined → remove
  if (value == null) {
    el.removeAttribute(key)
    return
  }

  // Boolean attributes (disabled, checked, readonly, …)
  if (typeof value === "boolean") {
    if (value) el.setAttribute(key, "")
    else el.removeAttribute(key)
    return
  }

  // DOM property (value, checked, selected, …) — prefer property over attribute
  if (key in el) {
    ;(el as unknown as Record<string, unknown>)[key] = value
    return
  }

  el.setAttribute(key, String(value))
}
