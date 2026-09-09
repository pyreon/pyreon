// URL-attribute injection guard — single source of truth shared by BOTH
// renderers: `@pyreon/runtime-dom`'s client `setStaticProp` + DOMParser
// sanitizer, AND `@pyreon/runtime-server`'s SSR `renderProp`. Keeping the
// logic in one place is deliberate: the placeholder-stripping bug
// (`data:image/*` allowed on the client but stripped from SSG static HTML)
// was caused by the two renderers carrying independent copies that drifted.
// Pure string logic, zero deps — runs identically in the browser and Node.

/**
 * URL-bearing attributes guarded against `javascript:` / `data:` injection.
 * `xlink:href` is SVG's URL attribute — its qualified name is not `href`, so a
 * plain `href` check misses `<a xlink:href="javascript:…">` inside inline SVG
 * (clickable in every browser). The DOMParser sanitizer already guards it by
 * `localName`; listing it here gives the h(), compiled-template and SSR
 * renderers the same verdict from the same set.
 */
export const URL_ATTRS = new Set([
  'href',
  'src',
  'action',
  'formaction',
  'poster',
  'cite',
  'data',
  'xlink:href',
])

/**
 * Is this prop a URL-bearing attribute, under EITHER spelling?
 *
 * `URL_ATTRS` holds ATTRIBUTE names, but every guard call site is handed the
 * JSX PROP name — and for `formaction` the two differ. `formAction` is an
 * advertised typed prop (`jsx-runtime.ts`), so the idiomatic TSX spelling was
 * the one that missed the set, while the lowercase spelling nobody writes was
 * guarded. Measured before this fix:
 *
 *   <button formAction="javascript:alert(1)">  ->  formaction="javascript:alert(1)"
 *   <button formaction="javascript:alert(1)">  ->  (blocked)
 *
 * and `formaction` overrides `<form action>`, which is in the set precisely
 * because `javascript:` executes on submit. Same shape as the `xlink:href`
 * drift: a guard keyed on one spelling of a thing that has several. Resolve
 * the name before asking, in ONE place, so no call site can key on the wrong
 * one again.
 */
export function isUrlAttr(key: string): boolean {
  if (URL_ATTRS.has(key)) return true
  // Only pay the lowercase when the key could differ — a camelCase alias is
  // the only way to miss, and almost every prop is already lowercase.
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i)
    if (c >= 65 && c <= 90) return URL_ATTRS.has(key.toLowerCase())
  }
  return false
}

/**
 * HTML event-handler CONTENT attributes, lowercase — the spelling that is
 * executable markup rather than a Pyreon prop.
 *
 * Pyreon documents the camelCase form (`onClick`), and the SSR skip used to
 * require an uppercase third character. So the LOWERCASE spelling — the one
 * that is a real inline handler — fell straight through and was serialized:
 *
 *   h('div', { onclick: 'alert(1)' })           -> <div onclick="alert(1)">
 *   h('img', { src: 'x', onerror: 'alert(1)' })  -> <img src="x" onerror="alert(1)">
 *
 * live in the server-rendered HTML, which the browser runs before any framework
 * code. The reachable vector is a spread of a user-keyed object — verbatim the
 * threat model `UNSAFE_ATTR_NAME_RE` already documents, and invisible to it
 * because `onclick` contains no breakout character.
 *
 * A NAME SET rather than `/^on[a-z]/`, deliberately. The broad regex also eats
 * `once` and `onyx`, which are not handlers and which an existing spec asserts
 * must still render — an attribute that merely starts with "on" is ordinary
 * data. So: every real handler name is refused, an unknown `on*` name is kept.
 * Adding a name can only ever refuse more; the cost of a missing one is this
 * bug, so err toward listing it.
 */
export const EVENT_HANDLER_ATTRS = new Set([
  'onabort', 'onafterprint', 'onanimationcancel', 'onanimationend', 'onanimationiteration',
  'onanimationstart', 'onauxclick', 'onbeforeinput', 'onbeforematch', 'onbeforeprint',
  'onbeforetoggle', 'onbeforeunload', 'onblur', 'oncancel', 'oncanplay', 'oncanplaythrough',
  'onchange', 'onclick', 'onclose', 'oncontextlost', 'oncontextmenu', 'oncontextrestored',
  'oncopy', 'oncuechange', 'oncut', 'ondblclick', 'ondrag', 'ondragend', 'ondragenter',
  'ondragleave', 'ondragover', 'ondragstart', 'ondrop', 'ondurationchange', 'onemptied',
  'onended', 'onerror', 'onfocus', 'onfocusin', 'onfocusout', 'onformdata',
  'ongotpointercapture', 'onhashchange', 'oninput', 'oninvalid', 'onkeydown', 'onkeypress',
  'onkeyup', 'onlanguagechange', 'onload', 'onloadeddata', 'onloadedmetadata', 'onloadstart',
  'onlostpointercapture', 'onmessage', 'onmessageerror', 'onmousedown', 'onmouseenter',
  'onmouseleave', 'onmousemove', 'onmouseout', 'onmouseover', 'onmouseup', 'onoffline',
  'ononline', 'onpagehide', 'onpageshow', 'onpaste', 'onpause', 'onplay', 'onplaying',
  'onpointercancel', 'onpointerdown', 'onpointerenter', 'onpointerleave', 'onpointermove',
  'onpointerout', 'onpointerover', 'onpointerrawupdate', 'onpointerup', 'onpopstate',
  'onprogress', 'onratechange', 'onrejectionhandled', 'onreset', 'onresize', 'onscroll',
  'onscrollend', 'onsecuritypolicyviolation', 'onseeked', 'onseeking', 'onselect',
  'onslotchange', 'onstalled', 'onstorage', 'onsubmit', 'onsuspend', 'ontimeupdate',
  'ontoggle', 'ontouchcancel', 'ontouchend', 'ontouchmove', 'ontouchstart',
  'ontransitioncancel', 'ontransitionend', 'ontransitionrun', 'ontransitionstart',
  'onunhandledrejection', 'onunload', 'onvolumechange', 'onwaiting', 'onwheel',
])

/** Matches the `javascript:` / `data:` URI prefixes the guard rejects by default. */
export const UNSAFE_URL_RE = /^\s*(?:javascript|data):/i

/**
 * True iff `url` is a `javascript:` / `data:` URI (after optional leading
 * whitespace) — i.e. `UNSAFE_URL_RE.test(url)`, but with a `charCodeAt(0)`
 * fast path that skips the regex for the overwhelmingly-common safe case.
 *
 * PROVABLY equivalent to the regex: a `^\s*(?:javascript|data):` match needs
 * the first non-whitespace char to be `j`/`J` (javascript) or `d`/`D` (data).
 * A first char in printable ASCII (33–126) is NOT whitespace, so `\s*` matches
 * nothing and the match must begin at index 0 — impossible unless that char is
 * `j`/`J`/`d`/`D`. So a printable-ASCII first char that isn't one of those is
 * DEFINITELY safe, no regex needed (`http…`→`h`, `/…`, `#…`, `mailto:`→`m`, …).
 *
 * Conservative on the margins (correctness > a few ns): anything ≤32 (ASCII
 * whitespace/controls — leading whitespace the regex can skip) OR ≥127 (may be
 * UNICODE whitespace like ` `, which `\s` matches) OR `j`/`J`/`d`/`D`
 * falls through to the authoritative regex. `''` → `charCodeAt(0)` is `NaN`,
 * fails `> 32`, hits the regex → `false` (matches the regex). `(c | 32)`
 * lowercases an ASCII letter; within 33–126 only `j`/`J`→106 and `d`/`D`→100.
 *
 * SECURITY: `javascript:`, `JavaScript:`, `  javascript:`, `\tdata:`,
 * ` javascript:`, `data:text/html` all still reach — and are still
 * rejected by — the regex. Additive; the guard's behavior is unchanged.
 */
export function isUnsafeUrl(url: string): boolean {
  const c = url.charCodeAt(0)
  if (c > 32 && c < 127 && (c | 32) !== 106 && (c | 32) !== 100) return false
  return UNSAFE_URL_RE.test(url)
}

// A `data:image/...` URI on an image-source attribute renders as a static,
// non-executing image — the framework's own imagePlugin ships exactly these as
// blur/color placeholders (`data:image/webp;base64,…`, `data:image/svg+xml,…`).
// Those contexts are safe, so the guard allows them while still blocking
// `data:text/html` on <iframe>/<object>/<embed>, `javascript:` everywhere, and
// scripted SVG.
const IMAGE_SRC_ATTRS = new Set(['src', 'srcset', 'poster'])
const IMAGE_CONTEXT_TAGS = new Set(['img', 'source', 'video'])
// Raster image data URIs can never carry executable content — always safe.
const SAFE_RASTER_DATA_RE =
  /^\s*data:image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)\s*[;,]/i
const SVG_DATA_RE = /^\s*data:image\/svg\+xml\s*[;,]/i
// SVG loaded via <img> is sandboxed (scripts don't run), but we still reject
// SVGs carrying <script> or on*= handlers — defense in depth, and safe if the
// URI ever reaches a script-executing context.
const SVG_SCRIPT_RE = /<\s*script\b|\son[a-z-]+\s*=/i

/**
 * True when `value` is an image `data:` URI on an image-source attribute
 * (`src` / `srcset` / `poster`) of an image-context element
 * (`<img>` / `<source>` / `<video>`) and therefore safe to write/emit despite
 * the guarded `data:` prefix.
 *
 * `tagName` is matched case-insensitively, so callers may pass either the DOM
 * `Element.tagName` (uppercase, `@pyreon/runtime-dom`) or a raw JSX tag string
 * (lowercase, `@pyreon/runtime-server`).
 *
 * Raster types (png/jpeg/webp/…) can't execute. SVG is allowed only when it
 * carries no `<script>` / `on*=` handlers (base64 and url-encoded payloads are
 * decoded and scanned; malformed payloads are treated as unsafe). Every other
 * `data:` URI — and any `data:` on a navigable/executing element (iframe,
 * object, anchor, …) — stays blocked.
 *
 * @internal Shared by `@pyreon/runtime-dom` + `@pyreon/runtime-server`.
 */
export function isSafeImageDataUri(tagName: string, key: string, value: string): boolean {
  if (!IMAGE_SRC_ATTRS.has(key) || !IMAGE_CONTEXT_TAGS.has(tagName.toLowerCase())) return false
  if (SAFE_RASTER_DATA_RE.test(value)) return true
  if (SVG_DATA_RE.test(value)) return !svgDataUriHasScript(value)
  return false
}

/** Decode an `image/svg+xml` data URI payload and test for executable content. */
function svgDataUriHasScript(value: string): boolean {
  const comma = value.indexOf(',')
  if (comma === -1) return true // malformed — treat as unsafe
  const isBase64 = /;base64/i.test(value.slice(0, comma))
  let payload = value.slice(comma + 1)
  if (isBase64) {
    try {
      payload = atob(payload)
    } catch {
      return true // undecodable base64 — treat as unsafe
    }
  } else {
    try {
      payload = decodeURIComponent(payload)
    } catch {
      // FAIL CLOSED, like the base64 branch two lines up.
      //
      // Keeping the raw still-encoded payload and scanning that was a bypass:
      // `SVG_SCRIPT_RE` matches `<script` and ` on…=`, neither of which appears
      // in `%3Cscript%3E`. So a single trailing `%` — enough to make
      // `decodeURIComponent` throw, and nothing else — took a payload from
      // BLOCKED to ALLOWED:
      //
      //   data:image/svg+xml,%3Cscript%3Ealert(1)%3C/script%3E   → blocked
      //   data:image/svg+xml,%3Cscript%3Ealert(1)%3C/script%3E%  → allowed
      //
      // The two branches disagreeing was the whole defect, and this function's
      // own docstring already promised the base64 branch's behaviour for both
      // ("malformed payloads are treated as unsafe").
      return true
    }
  }
  return SVG_SCRIPT_RE.test(payload)
}
