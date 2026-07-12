import type { ClassValue, Props } from '@pyreon/core'
import { cx, isSafeImageDataUri, normalizeStyleValue, toKebabCase, UNSAFE_URL_RE, URL_ATTRS } from '@pyreon/core'

import { batch, renderEffect } from '@pyreon/reactivity'
import { DELEGATED_EVENTS, delegatedPropName } from './delegate'

type Cleanup = () => void

// Dev-mode gate: see `pyreon/no-process-dev-gate` lint rule for why this
// uses `import.meta.env.DEV` instead of `typeof process !== 'undefined'`.
// Dev-time counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

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
    } else if (
      URL_ATTRS.has(attr.name) &&
      UNSAFE_URL_RE.test(attr.value) &&
      !isSafeImageDataUri(el.tagName, attr.name, attr.value)
    ) {
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
 *
 * `skipKey` excludes ONE prop from this pass — used by mountElement /
 * hydrateElement to defer `<select value>` until after children exist
 * (see `applySelectValueProp`).
 */
export function applyProps(el: Element, props: Props, skipKey?: string): Cleanup | null {
  let first: Cleanup | null = null
  let cleanups: Cleanup[] | null = null
  for (const key in props) {
    if (key === 'key' || key === 'ref' || key === 'children' || key === skipKey) continue
    // Getter-shaped descriptors are produced by `makeReactiveProps` from
    // compiler-emitted `_rp(() => signal())` wrappers. A plain
    // `props[key]` read fires the getter once at mount time and stores
    // the resolved value — breaking signal-driven reactivity. Detecting
    // the descriptor and wrapping the read in `renderEffect` here is
    // equivalent to applyProp's existing function-value branch (line 322),
    // routed through the descriptor instead of the value. Other prop
    // pipelines (`splitProps`, `mergeProps`, rocketstyle's
    // descriptor-preserving merges) keep the getter intact end-to-end;
    // this is the final consumer that closes the loop.
    const descriptor = Object.getOwnPropertyDescriptor(props, key)
    let c: Cleanup | null
    if (descriptor?.get) {
      c = renderEffect(() => applyStaticProp(el, key, (props as Record<string, unknown>)[key]))
    } else {
      c = applyProp(el, key, props[key])
    }
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
 * Deferred `<select value>` application (PZ-09) — applies the `value` prop
 * with the SAME descriptor-aware reactive dispatch `applyProps` uses, as a
 * separate POST-CHILDREN pass. `select.value` is a DOM property whose
 * assignment selects a matching <option>; assigned before the options exist
 * (the pre-fix order — applyProps ran before mountChildren) the value is
 * silently dropped and the first option stays selected. A reactive accessor
 * gets its `renderEffect` created here so the EAGER INITIAL run also sees
 * the options. mountElement / hydrateElement exclude `value` from the main
 * applyProps pass for <select> (via `skipKey`) and call this after children
 * are in place. Matches React's `postMountWrapper` / Solid's `Properties`
 * handling. `value == null` keeps applyStaticProp's removeAttribute no-op —
 * an option's own `selected` attribute is never clobbered by an absent value.
 */
export function applySelectValueProp(el: Element, props: Props): Cleanup | null {
  const descriptor = Object.getOwnPropertyDescriptor(props, 'value')
  if (descriptor?.get) {
    return renderEffect(() =>
      applyStaticProp(el, 'value', (props as Record<string, unknown>).value),
    )
  }
  return applyProp(el, 'value', props.value)
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
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('runtime.applyEvent')
  if (typeof value !== 'function') {
    // `undefined` and `null` are legitimate — conditional handler pattern:
    //   <button onClick={condition ? handler : undefined}>
    // The runtime silently bails on nullish values. Only warn for
    // actually-wrong types (strings, numbers, objects) that indicate
    // a real bug in the caller (e.g. `onClick={someSignal()}` where
    // the signal returns a value instead of a handler function).
    if (process.env.NODE_ENV !== 'production' && value != null) {
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
 * Bind ONE event handler through the CANONICAL event path
 * (`applyEventProp` — the same delegation, batching, and exact
 * `onXxx`→event-name normalization every compiler-emitted handler
 * uses). PR 2 of the partial-collapse build (open-work #1): a
 * collapsed-with-handler site (`_rsCollapseH`) re-attaches the residual
 * handlers `detectPartialCollapsibleShape` (compiler PR 1) peeled off.
 * Contract-consistent BY CONSTRUCTION — it IS `applyEventProp`, not a
 * re-implementation — so a partially-collapsed `<Button onClick=…>`
 * behaves byte-identically to the 5-layer mount it replaced (same
 * delegated-event prop slot, same `batch()` wrapping, same cleanup).
 */
export function _bindEvent(el: Element, key: string, handler: unknown): Cleanup | null {
  return applyEventProp(el, key, handler)
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
  if (process.env.NODE_ENV !== 'production' && typeof value === 'function') {
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

// `runtime.applyProp` fires for EVERY prop key, including events. `runtime.applyEvent`
// fires only for `on*` props — strict subset. Useful diagnostic ratios:
//   applyEvent / applyProp = event-handler density per element
//   applyProp - applyEvent = static / reactive attr density
// Don't subtract them and treat as disjoint.
export function applyProp(el: Element, key: string, value: unknown): Cleanup | null {
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('runtime.applyProp')
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

// Track the CSS property names an element's last-applied style object set,
// so a reactive style going from `{ color, fontSize }` to `{ color }` removes
// the stale `fontSize`. React/Vue/Solid all do this diff; previously Pyreon
// only applied new keys, leaking the removed ones onto the DOM.
const _prevStyleKeys: WeakMap<HTMLElement, Set<string>> = new WeakMap()

/**
 * Apply a style prop (string or object). Exported as `_setStyle` for the
 * compiler's template fast path so a compiled style binding normalizes
 * values identically to the `applyProp` path (string → cssText; object →
 * per-property setProperty with kebab-casing + `normalizeStyleValue`
 * number→px + stale-key removal; null → clear).
 */
export function applyStyleProp(el: HTMLElement, value: unknown): void {
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

// Exported as `_setClass` for the compiler's template class binding — the SAME
// SVG-safe normalizer the `h()` path (`applyProp`) uses, so the two paths can't
// diverge. `setAttribute('class', …)` works on BOTH HTML and SVG elements,
// whereas the compiler's old inline `el.className = …` THROWS on a real
// SVGElement (`className` there is a read-only `SVGAnimatedString`) — which is
// why flow edges rendered nothing once `_tpl` gave them the correct SVG
// namespace. Mirrors the `applyStyleProp`→`_setStyle` extraction.
export function applyClassProp(el: Element, value: unknown): void {
  const resolved = typeof value === 'string' ? value : cx(value as ClassValue)
  el.setAttribute('class', resolved || '')
}

function setStaticProp(el: Element, key: string, value: unknown): void {
  // Block javascript:/data: URI injection in URL-bearing attributes.
  if (
    URL_ATTRS.has(key) &&
    typeof value === 'string' &&
    UNSAFE_URL_RE.test(value) &&
    !isSafeImageDataUri(el.tagName, key, value)
  ) {
    if (process.env.NODE_ENV !== 'production') {
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

  // ARIA state/property attributes are STRING enums ("true"/"false"/"mixed"),
  // NOT presence-based like HTML boolean attrs. A boolean must render as its
  // literal string — `aria-checked={true}` → aria-checked="true", never the
  // presence-only `aria-checked=""` that assistive tech can't read as checked
  // (it falls back to the default → effectively unchecked). Runs BEFORE the
  // generic boolean branch (which keeps presence semantics for HTML boolean
  // attrs like `disabled`/`hidden`; `data-*` is author-defined, also presence).
  // Mirrors runtime-server's SSR serialization so hydration sees identical markup.
  if (typeof value === 'boolean' && key.charCodeAt(0) === 97 /* 'a' */ && key.startsWith('aria-')) {
    el.setAttribute(key, value ? 'true' : 'false')
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

  // `data-*` / `aria-*` are ATTRIBUTE semantics, always — including on
  // custom elements. The hyphenated-tag property branch below exists so a
  // custom element's CONSTRUCTOR picks up rich values set pre-upgrade, but
  // routing `data-name` through it sets a JS PROPERTY (`el['data-name']`)
  // that `getAttribute('data-name')` / `dataset` / CSS attribute selectors
  // / SSR-emitted HTML all disagree with. Real-world hit: the server-island
  // marker (`<pyreon-server-island data-name=…>`) carried its name in SSR
  // HTML but lost it on every client mount — the activator read
  // getAttribute(null) and silently never fetched. Matches React/Vue/Solid:
  // data-/aria- always go through setAttribute.
  if (key.startsWith('data-') || key.startsWith('aria-')) {
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
