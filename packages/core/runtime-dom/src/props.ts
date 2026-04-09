import type { ClassValue, Props } from '@pyreon/core'
import { cx, normalizeStyleValue, toKebabCase } from '@pyreon/core'

import { batch, renderEffect } from '@pyreon/reactivity'
import { DELEGATED_EVENTS, delegatedPropName } from './delegate'

type Cleanup = () => void

const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'

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
  'a',
  'abbr',
  'address',
  'article',
  'aside',
  'b',
  'bdi',
  'bdo',
  'blockquote',
  'br',
  'caption',
  'cite',
  'code',
  'col',
  'colgroup',
  'dd',
  'del',
  'details',
  'dfn',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'i',
  'ins',
  'kbd',
  'li',
  'main',
  'mark',
  'nav',
  'ol',
  'p',
  'pre',
  'q',
  'rp',
  'rt',
  'ruby',
  's',
  'samp',
  'section',
  'small',
  'span',
  'strong',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'time',
  'tr',
  'u',
  'ul',
  'var',
  'wbr',
])

// Attributes that can carry executable code
const UNSAFE_ATTR_RE = /^on/i

/**
 * Fallback tag-stripping sanitizer for environments without the Sanitizer API.
 * Removes all tags not in SAFE_TAGS, strips event handler attributes,
 * and blocks javascript:/data: URLs in href/src/action attributes.
 */
function fallbackSanitize(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  sanitizeNode(doc.body)
  return doc.body.innerHTML
}

/** Strip unsafe attributes from a single element. */
function stripUnsafeAttrs(el: Element): void {
  const attrs = Array.from(el.attributes)
  for (const attr of attrs) {
    if (UNSAFE_ATTR_RE.test(attr.name)) {
      el.removeAttribute(attr.name)
    } else if (URL_ATTRS.has(attr.name) && UNSAFE_URL_RE.test(attr.value)) {
      el.removeAttribute(attr.name)
    }
  }
}

function sanitizeNode(node: Node): void {
  const children = Array.from(node.childNodes)
  for (const child of children) {
    if (child.nodeType !== 1) continue
    const el = child as Element
    const tag = el.tagName.toLowerCase()
    if (!SAFE_TAGS.has(tag)) {
      const text = document.createTextNode(el.textContent as string)
      node.replaceChild(text, el)
      continue
    }
    stripUnsafeAttrs(el)
    sanitizeNode(el)
  }
}

/**
 * Sanitize an HTML string using the browser Sanitizer API (Chrome 105+).
 * Falls back to a tag-allowlist sanitizer that strips unsafe elements and attributes.
 */
export function sanitizeHtml(html: string): string {
  // User-provided sanitizer takes priority (e.g. DOMPurify)
  if (_customSanitizer) return _customSanitizer(html)
  // DOM-based allowlist sanitizer — DOMParser is available in all browser targets.
  // sanitizeHtml is only called for innerHTML (DOM-only), so SSR fallback is not needed.
  return fallbackSanitize(html)
}

// Matches onClick, onInput, onMouseEnter, etc.
const EVENT_RE = /^on[A-Z]/

/**
 * Apply all props to a DOM element.
 * Returns a single chained cleanup (or null if no props need teardown).
 * Uses for-in instead of Object.keys() to avoid allocating a keys array.
 */
export function applyProps(el: Element, props: Props): Cleanup | null {
  let first: Cleanup | null = null
  let cleanups: Cleanup[] | null = null
  for (const key in props) {
    if (key === 'key' || key === 'ref' || key === 'children') continue
    const c = applyProp(el, key, props[key])
    if (c) {
      if (!first) {
        first = c
      } else if (!cleanups) {
        cleanups = [first, c]
      } else {
        cleanups.push(c)
      }
    }
  }
  if (cleanups)
    return () => {
      for (const c of cleanups) c()
    }
  return first
}

/**
 * Apply a single prop.
 *
 * - `onXxx` → addEventListener
 * - `() => value` (non-event function) → reactive via effect
 * - anything else → static attribute / DOM property
 */
/**
 * Bind an event handler (onClick → "click") with batching + delegation support.
 */
function applyEventProp(el: Element, key: string, value: unknown): Cleanup | null {
  if (typeof value !== 'function') {
    if (__DEV__) {
      console.warn(
        `[Pyreon] Event handler "${key}" received a non-function value (${typeof value}). ` +
          `Expected a function. Did you mean ${key}={() => ...}?`,
      )
    }
    return null
  }
  const eventName = key[2]?.toLowerCase() + key.slice(3)
  const handler = value as EventListener

  if (DELEGATED_EVENTS.has(eventName)) {
    const prop = delegatedPropName(eventName)
    ;(el as unknown as Record<string, unknown>)[prop] = (e: Event) => batch(() => handler(e))
    return () => {
      ;(el as unknown as Record<string, unknown>)[prop] = undefined
    }
  }

  const batched: EventListener = (e) => batch(() => handler(e))
  el.addEventListener(eventName, batched)
  return () => el.removeEventListener(eventName, batched)
}

export function applyProp(el: Element, key: string, value: unknown): Cleanup | null {
  // Event listener: onClick → "click"
  if (EVENT_RE.test(key)) return applyEventProp(el, key, value)

  // innerHTML — sanitized via Sanitizer API or fallback allowlist sanitizer
  if (key === 'innerHTML') {
    if (typeof (el as HTMLElement & { setHTML?: (h: string) => void }).setHTML === 'function') {
      ;(el as HTMLElement & { setHTML: (h: string) => void }).setHTML(value as string)
    } else {
      ;(el as HTMLElement).innerHTML = sanitizeHtml(value as string)
    }
    return null
  }
  // dangerouslySetInnerHTML — intentionally raw, developer owns sanitization (same as React)
  if (key === 'dangerouslySetInnerHTML') {
    if (__DEV__) {
      console.warn(
        '[Pyreon] dangerouslySetInnerHTML bypasses sanitization. Ensure the HTML is trusted.',
      )
    }
    ;(el as HTMLElement).innerHTML = (value as { __html: string }).__html
    return null
  }

  // Reactive prop — function that returns the actual value
  // Uses renderEffect (lighter than effect — no scope registration, no WeakMap)
  // since lifecycle is managed by mountElement's cleanup array.
  if (typeof value === 'function') {
    const dispose = renderEffect(() => setStaticProp(el, key, (value as () => unknown)()))
    return dispose
  }

  setStaticProp(el, key, value)
  return null
}

// Attributes that carry URLs and must be guarded against javascript:/data: injection.
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'poster', 'cite', 'data'])
const UNSAFE_URL_RE = /^\s*(?:javascript|data):/i

/** Apply a style prop (string or object). */
function applyStyleProp(el: HTMLElement, value: unknown): void {
  if (typeof value === 'string') {
    el.style.cssText = value
  } else if (value != null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    for (const k in obj) {
      const css = normalizeStyleValue(k, obj[k])
      el.style.setProperty(k.startsWith('--') ? k : toKebabCase(k), css)
    }
  }
}

function applyClassProp(el: Element, value: unknown): void {
  const resolved = typeof value === 'string' ? value : cx(value as ClassValue)
  el.setAttribute('class', resolved || '')
}

function setStaticProp(el: Element, key: string, value: unknown): void {
  // Block javascript:/data: URI injection in URL-bearing attributes.
  if (URL_ATTRS.has(key) && typeof value === 'string' && UNSAFE_URL_RE.test(value)) {
    if (__DEV__) {
      console.warn(`[Pyreon] Blocked unsafe URL in "${key}" attribute: ${value}`)
    }
    return
  }

  if (key === 'class' || key === 'className') {
    applyClassProp(el, value)
    return
  }

  if (key === 'style') {
    applyStyleProp(el as HTMLElement, value)
    return
  }

  if (value == null) {
    el.removeAttribute(key)
    return
  }

  if (typeof value === 'boolean') {
    if (value) el.setAttribute(key, '')
    else el.removeAttribute(key)
    return
  }

  // SVG and MathML elements: ALWAYS use setAttribute. Many of their
  // properties are read-only `SVGAnimated*` getters (e.g.
  // `SVGMarkerElement.refX`, `SVGMarkerElement.markerWidth`,
  // `SVGRectElement.x`, etc.). Trying `el[key] = value` on those
  // crashes with "Cannot set property X of [object Object] which has
  // only a getter". The standard React/Vue/Solid behavior is to
  // skip the property assignment optimization for non-HTML elements
  // and always go through setAttribute.
  if (el.namespaceURI && el.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
    el.setAttribute(key, String(value))
    return
  }

  if (key in el) {
    ;(el as unknown as Record<string, unknown>)[key] = value
    return
  }

  // Custom elements: set as property (element may not be upgraded yet,
  // so `key in el` missed it). Properties set before upgrade are picked
  // up when the element's constructor runs.
  const tag = el.tagName
  if (tag.includes('-')) {
    ;(el as unknown as Record<string, unknown>)[key] = value
    return
  }

  el.setAttribute(key, String(value))
}
