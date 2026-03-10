import type { Props } from "@pyreon/core"
import { batch, renderEffect } from "@pyreon/reactivity"

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

// ─── Configurable sanitizer ──────────────────────────────────────────────────

export type SanitizeFn = (html: string) => string

let _customSanitizer: SanitizeFn | null = null

/**
 * Set a custom HTML sanitizer used by `innerHTML` and `sanitizeHtml()`.
 * Overrides both the Sanitizer API and the built-in fallback.
 *
 * @example
 * // With DOMPurify:
 * import DOMPurify from "dompurify"
 * setSanitizer((html) => DOMPurify.sanitize(html))
 *
 * // With sanitize-html:
 * import sanitize from "sanitize-html"
 * setSanitizer((html) => sanitize(html))
 *
 * // Reset to built-in:
 * setSanitizer(null)
 */
export function setSanitizer(fn: SanitizeFn | null): void {
  _customSanitizer = fn
}

// Safe HTML tags allowed by the fallback sanitizer (block + inline, no scripts/embeds/forms)
const SAFE_TAGS = new Set([
  "a",
  "abbr",
  "address",
  "article",
  "aside",
  "b",
  "bdi",
  "bdo",
  "blockquote",
  "br",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "details",
  "dfn",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "i",
  "ins",
  "kbd",
  "li",
  "main",
  "mark",
  "nav",
  "ol",
  "p",
  "pre",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "section",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "u",
  "ul",
  "var",
  "wbr",
])

// Attributes that can carry executable code
const UNSAFE_ATTR_RE = /^on/i

/**
 * Fallback tag-stripping sanitizer for environments without the Sanitizer API.
 * Removes all tags not in SAFE_TAGS, strips event handler attributes,
 * and blocks javascript:/data: URLs in href/src/action attributes.
 */
function fallbackSanitize(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html")
  sanitizeNode(doc.body)
  return doc.body.innerHTML
}

function sanitizeNode(node: Node): void {
  const children = Array.from(node.childNodes)
  for (const child of children) {
    if (child.nodeType === 1) {
      // Element
      const el = child as Element
      const tag = el.tagName.toLowerCase()
      if (!SAFE_TAGS.has(tag)) {
        // Replace unsafe element with its text content
        const text = document.createTextNode(el.textContent ?? "")
        node.replaceChild(text, el)
        continue
      }
      // Strip unsafe attributes
      const attrs = Array.from(el.attributes)
      for (const attr of attrs) {
        if (UNSAFE_ATTR_RE.test(attr.name)) {
          el.removeAttribute(attr.name)
        } else if (URL_ATTRS.has(attr.name) && UNSAFE_URL_RE.test(attr.value)) {
          el.removeAttribute(attr.name)
        }
      }
      sanitizeNode(el)
    }
  }
}

/**
 * Sanitize an HTML string using the browser Sanitizer API (Chrome 105+).
 * Falls back to a tag-allowlist sanitizer that strips unsafe elements and attributes.
 */
export function sanitizeHtml(html: string): string {
  // User-provided sanitizer takes priority (e.g. DOMPurify)
  if (_customSanitizer) return _customSanitizer(html)
  // Native Sanitizer API (Chrome 105+)
  if (typeof window !== "undefined") {
    const san = (
      window as unknown as {
        Sanitizer?: new () => { sanitizeFor(tag: string, html: string): Element }
      }
    ).Sanitizer
    if (san) {
      return new san().sanitizeFor("div", html).innerHTML
    }
  }
  // Fallback: DOM-based allowlist sanitizer
  if (typeof DOMParser !== "undefined") {
    return fallbackSanitize(html)
  }
  // SSR or no DOM — strip all tags as last resort
  return html.replace(/<[^>]*>/g, "")
}

// Matches onClick, onInput, onMouseEnter, etc.
const EVENT_RE = /^on[A-Z]/

/**
 * Apply all props to a DOM element.
 * Returns a single chained cleanup (or null if no props need teardown).
 * Uses for-in instead of Object.keys() to avoid allocating a keys array.
 */
export function applyProps(el: Element, props: Props): Cleanup | null {
  let cleanup: Cleanup | null = null
  for (const key in props) {
    if (key === "key" || key === "ref") continue
    const c = applyProp(el, key, props[key])
    if (c) {
      if (!cleanup) {
        cleanup = c
      } else {
        const prev = cleanup
        cleanup = () => {
          prev()
          c()
        }
      }
    }
  }
  return cleanup
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

  // innerHTML — sanitized via Sanitizer API or fallback allowlist sanitizer
  if (key === "innerHTML") {
    if (typeof (el as HTMLElement & { setHTML?: (h: string) => void }).setHTML === "function") {
      ;(el as HTMLElement & { setHTML: (h: string) => void }).setHTML(value as string)
    } else {
      ;(el as HTMLElement).innerHTML = sanitizeHtml(value as string)
    }
    return null
  }
  // dangerouslySetInnerHTML — intentionally raw, developer owns sanitization (same as React)
  if (key === "dangerouslySetInnerHTML") {
    if (__DEV__) {
      console.warn(
        "[pyreon] dangerouslySetInnerHTML: ensure content is sanitized before rendering.",
      )
    }
    ;(el as HTMLElement).innerHTML = (value as { __html: string }).__html
    return null
  }

  // Custom directive: n-* keys call the directive function with (el, addCleanup)
  if (key.startsWith("n-")) {
    const directive = value as Directive
    const cleanups: Cleanup[] = []
    directive(el as HTMLElement, (fn) => cleanups.push(fn))
    return cleanups.length > 0
      ? () => {
          for (const fn of cleanups) fn()
        }
      : null
  }

  // n-show: toggle display based on a reactive boolean
  if (key === "n-show") {
    const dispose = renderEffect(() => {
      const visible = (value as () => boolean)()
      ;(el as HTMLElement).style.display = visible ? "" : "none"
    })
    return dispose
  }

  // Reactive prop — function that returns the actual value
  // Uses renderEffect (lighter than effect — no scope registration, no WeakMap)
  // since lifecycle is managed by mountElement's cleanup array.
  if (typeof value === "function") {
    const dispose = renderEffect(() => setStaticProp(el, key, (value as () => unknown)()))
    return dispose
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
    if (__DEV__) console.warn(`[pyreon] Blocked unsafe ${key} value: "${value}"`)
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
