import type { ClassValue, Props } from '@pyreon/core'
import { cx, normalizeStyleValue, toKebabCase } from '@pyreon/core'

import { batch, renderEffect } from '@pyreon/reactivity'
import { DELEGATED_EVENTS, delegatedPropName } from './delegate'

type Cleanup = () => void

// Dev-mode gate: see `pyreon/no-process-dev-gate` lint rule for why this
// uses `import.meta.env.DEV` instead of `typeof process !== 'undefined'`.
const __DEV__ = process.env.NODE_ENV !== 'production'

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
    // `undefined` and `null` are legitimate — conditional handler pattern:
    //   <button onClick={condition ? handler : undefined}>
    // The runtime silently bails on nullish values. Only warn for
    // actually-wrong types (strings, numbers, objects) that indicate
    // a real bug in the caller (e.g. `onClick={someSignal()}` where
    // the signal returns a value instead of a handler function).
    if (__DEV__ && value != null) {
      console.warn(
        `[Pyreon] Event handler "${key}" received a non-function value (${typeof value}). ` +
          `Expected a function. Did you mean ${key}={() => ...}?`,
      )
    }
    return null
  }
  // `onPointerDown` -> `pointerdown`. Multi-word DOM event names are
  // all-lowercase (`pointerdown`, `dblclick`, `mouseover`), so we
  // lowercase the WHOLE name — not just the first letter, as a previous
  // version did. That bug silently dropped delegation for every
  // multi-word event (pointerdown/up/move, mousedown/up/move, dblclick,
  // touchstart/end/move, etc.) — the handler was attached via
  // `addEventListener('pointerDown', ...)` which never fires because
  // real events use the lowercase name.
  const eventName = (key[2]?.toLowerCase() + key.slice(3)).toLowerCase()
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

/**
 * Sink for a single prop's CALLED value (always a primitive / object /
 * `null` — never a function). Called both directly for static values and
 * from the reactive `renderEffect` for accessor-bound values.
 *
 * NOTE on architecture: extracting the special-cased sinks
 * (`innerHTML` / `dangerouslySetInnerHTML`) into this single dispatch
 * function ensures every prop kind goes through the same reactive
 * wrapping at `applyProp`'s entry. Previously each special case had its
 * own early-return branch that needed to remember to handle function
 * values; missing the dance once meant the closure was stringified and
 * set as literal text. The structural fix (one reactive-wrap, then
 * dispatch) eliminates the entire bug class.
 */
function applyStaticProp(el: Element, key: string, value: unknown): void {
  if (__DEV__ && typeof value === 'function') {
    // Defensive: function values must be unwrapped via `renderEffect`
    // before reaching here. If we see one, a NEW special-case branch
    // somewhere upstream skipped the reactive-wrapping dance — exactly
    // the bug class the structural refactor was meant to eliminate.
    console.warn(
      `[Pyreon] applyStaticProp received a function for "${key}". ` +
        `This likely means a new special-cased prop sink in applyProp() ` +
        `bypassed the reactive-wrap path. The closure would be stringified ` +
        `and set as a literal value. Verify the dispatch in applyProp().`,
    )
  }

  // innerHTML — sanitized via Sanitizer API or fallback allowlist sanitizer.
  if (key === 'innerHTML') {
    const html = String(value ?? '')
    if (typeof (el as HTMLElement & { setHTML?: (h: string) => void }).setHTML === 'function') {
      ;(el as HTMLElement & { setHTML: (h: string) => void }).setHTML(html)
    } else {
      ;(el as HTMLElement).innerHTML = sanitizeHtml(html)
    }
    return
  }

  // dangerouslySetInnerHTML — intentionally raw, developer owns sanitization
  // (same as React). The name itself is the warning — React doesn't log,
  // neither should we.
  if (key === 'dangerouslySetInnerHTML') {
    const v = value as { __html: string } | null | undefined
    ;(el as HTMLElement).innerHTML = v?.__html ?? ''
    return
  }

  setStaticProp(el, key, value)
}

export function applyProp(el: Element, key: string, value: unknown): Cleanup | null {
  // Event listener: onClick → "click"
  if (EVENT_RE.test(key)) return applyEventProp(el, key, value)

  // Reactive prop — function value is an accessor closure. The JSX compiler
  // emits `prop={someExpr(signal())}` as a `() => someExpr(signal())` thunk
  // so the prop tracks the signal automatically. We wrap in `renderEffect`
  // ONCE here, before any prop-kind dispatch, so EVERY sink gets the same
  // reactive treatment. Previously special-cased sinks (innerHTML etc.) had
  // early-return branches that bypassed this wrap and stringified the
  // closure — the bug fixed by this restructure.
  //
  // Uses renderEffect (lighter than effect — no scope registration, no
  // WeakMap) since lifecycle is managed by mountElement's cleanup array.
  if (typeof value === 'function') {
    return renderEffect(() => applyStaticProp(el, key, (value as () => unknown)()))
  }

  applyStaticProp(el, key, value)
  return null
}

// Attributes that carry URLs and must be guarded against javascript:/data: injection.
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'poster', 'cite', 'data'])
const UNSAFE_URL_RE = /^\s*(?:javascript|data):/i

// Track the CSS property names an element's last-applied style object set,
// so a reactive style going from `{ color, fontSize }` to `{ color }` removes
// the stale `fontSize`. React/Vue/Solid all do this diff; previously Pyreon
// only applied new keys, leaking the removed ones onto the DOM.
const _prevStyleKeys: WeakMap<HTMLElement, Set<string>> = new WeakMap()

/** Apply a style prop (string or object). */
function applyStyleProp(el: HTMLElement, value: unknown): void {
  if (typeof value === 'string') {
    // cssText replaces everything — drop any tracked object-mode keys.
    el.style.cssText = value
    _prevStyleKeys.delete(el)
    return
  }

  const prev = _prevStyleKeys.get(el)

  if (value == null) {
    // Explicit null/undefined: clear whatever object-mode keys we set.
    if (prev) {
      for (const propName of prev) el.style.removeProperty(propName)
      _prevStyleKeys.delete(el)
    }
    return
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const next = new Set<string>()
    for (const k in obj) {
      const propName = k.startsWith('--') ? k : toKebabCase(k)
      next.add(propName)
      const css = normalizeStyleValue(k, obj[k])
      el.style.setProperty(propName, css)
    }
    if (prev) {
      for (const propName of prev) {
        if (!next.has(propName)) el.style.removeProperty(propName)
      }
    }
    if (next.size === 0) _prevStyleKeys.delete(el)
    else _prevStyleKeys.set(el, next)
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
