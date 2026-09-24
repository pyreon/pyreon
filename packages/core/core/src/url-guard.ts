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
 * Event-handler CONTENT attributes, lowercase — the spelling that is
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
 *
 * VOCABULARY — the set is a UNION, not one language's list. It was HTML-only,
 * which made it exactly 36 names short of what one shipping engine exposes, and
 * every one of those was a live sink on the paths below: SVG's SMIL handlers
 * (`onbegin`/`onend`/`onrepeat`) and the vendor-legacy ones Chromium still
 * compiles (`onmousewheel`, `onwebkit*`, `onbeforecopy`, `onsearch`, …) are as
 * executable as `onclick`. So the members come from three vocabularies:
 *
 *   1. HTML — the GlobalEventHandlers / Window-reflecting set.
 *   2. SVG — SMIL animation events plus the SVG 1.1 graphical/document events
 *      (`onactivate`, `onzoom`) Chromium no longer exposes but other engines
 *      and older content still carry.
 *   3. Vendor/legacy still live in a shipping engine (`-webkit-`/`-moz-`
 *      prefixed, `ondragexit`, `onoverflow`/`onunderflow`).
 *
 * A hand-maintained list of a moving target rots, so it is RATCHETED rather
 * than trusted: `event-handler-vocabulary.browser.test.tsx` enumerates every
 * `on*` IDL handler a real Chromium exposes on HTML, SVG and Window prototypes
 * and fails if any is missing here. A new browser handler reds that gate
 * instead of silently becoming an unguarded sink.
 */
export const EVENT_HANDLER_ATTRS = new Set([
  'onabort', 'onactivate', 'onafterprint', 'onanimationcancel', 'onanimationend',
  'onanimationiteration', 'onanimationstart', 'onappinstalled', 'onauxclick', 'onbeforecopy',
  'onbeforecut', 'onbeforeinput', 'onbeforeinstallprompt', 'onbeforematch', 'onbeforepaste',
  'onbeforeprint', 'onbeforetoggle', 'onbeforeunload', 'onbeforexrselect', 'onbegin', 'onblur',
  'oncancel', 'oncanplay', 'oncanplaythrough', 'onchange', 'onclick', 'onclose', 'oncommand',
  'oncontentvisibilityautostatechange', 'oncontextlost', 'oncontextmenu', 'oncontextrestored',
  'oncopy', 'oncuechange', 'oncut', 'ondblclick', 'ondevicemotion', 'ondeviceorientation',
  'ondeviceorientationabsolute', 'ondrag', 'ondragend', 'ondragenter', 'ondragexit', 'ondragleave',
  'ondragover', 'ondragstart', 'ondrop', 'ondurationchange', 'onemptied', 'onencrypted', 'onend',
  'onended', 'onenterpictureinpicture', 'onerror', 'onfocus', 'onfocusin', 'onfocusout',
  'onformdata', 'onfullscreenchange', 'onfullscreenerror', 'ongamepadconnected',
  'ongamepaddisconnected', 'ongotpointercapture', 'onhashchange', 'oninput', 'oninvalid',
  'onkeydown', 'onkeypress', 'onkeyup', 'onlanguagechange', 'onleavepictureinpicture', 'onload',
  'onloadeddata', 'onloadedmetadata', 'onloadstart', 'onlostpointercapture', 'onmessage',
  'onmessageerror', 'onmousedown', 'onmouseenter', 'onmouseleave', 'onmousemove', 'onmouseout',
  'onmouseover', 'onmouseup', 'onmousewheel', 'onmozfullscreenchange', 'onmozfullscreenerror',
  'onoffline', 'ononline', 'onoverflow', 'onpagehide', 'onpagereveal', 'onpageshow', 'onpageswap',
  'onpaste', 'onpause', 'onplay', 'onplaying', 'onpointercancel', 'onpointerdown',
  'onpointerenter', 'onpointerleave', 'onpointermove', 'onpointerout', 'onpointerover',
  'onpointerrawupdate', 'onpointerup', 'onpopstate', 'onprogress', 'onratechange',
  'onrejectionhandled', 'onrepeat', 'onreset', 'onresize', 'onscroll', 'onscrollend',
  'onscrollsnapchange', 'onscrollsnapchanging', 'onsearch', 'onsecuritypolicyviolation',
  'onseeked', 'onseeking', 'onselect', 'onselectionchange', 'onselectstart', 'onslotchange',
  'onstalled', 'onstorage', 'onsubmit', 'onsuspend', 'ontimeupdate', 'ontoggle', 'ontouchcancel',
  'ontouchend', 'ontouchmove', 'ontouchstart', 'ontransitioncancel', 'ontransitionend',
  'ontransitionrun', 'ontransitionstart', 'onunderflow', 'onunhandledrejection', 'onunload',
  'onvolumechange', 'onwaiting', 'onwaitingforkey', 'onwebkitanimationend',
  'onwebkitanimationiteration', 'onwebkitanimationstart', 'onwebkitfullscreenchange',
  'onwebkitfullscreenerror', 'onwebkittransitionend', 'onwheel', 'onzoom',
])

/**
 * Is `key` an event-handler prop/attribute that must never be written as a
 * content attribute?
 *
 * ONE predicate for every sink, for the reason this function exists at all: the
 * refusal used to live as an open-coded charCode probe in SSR's
 * `renderPropSkipped` and NOWHERE else, so it guarded exactly one cell of a
 * (renderer x namespace x vocabulary) matrix. The client `h()` path wrote
 * `onclick` as a live attribute on any SVG/MathML element (its foreign-namespace
 * branch returns before every later check), the compiled template sink
 * (`_setAttr`) wrote it on plain HTML too *and* INVOKED a function-valued one,
 * and the compiled SSR sink (`_ssrAttrGen`) serialized it. Measured in real
 * Chromium, all three executed the attribute's script.
 *
 * BOTH spellings, deliberately:
 *  - camelCase (`onClick`) is Pyreon's own prop spelling, and `setAttribute`
 *    LOWERCASES a qualified name on an HTML element — so writing one as an
 *    attribute produces a live `onclick`. It never reaches an attribute sink on
 *    the happy path (`applyProp` routes it to `applyEventProp` first), but the
 *    getter-shaped descriptor path bypasses that routing, so the shape alone is
 *    enough to refuse.
 *  - lowercase is HTML/SVG's spelling, where only the REAL handler names are
 *    executable markup — `once`, `onyx` and `only` are ordinary attributes and
 *    must still render, which is why this consults a name set.
 */
export function isEventHandlerAttr(key: string): boolean {
  // charCode probe, no regex machinery per prop — this runs for every attribute
  // on every element on both renderers.
  if (key.length <= 2) return false
  if (key.charCodeAt(0) !== 111 /* 'o' */ || key.charCodeAt(1) !== 110 /* 'n' */) return false
  const c = key.charCodeAt(2)
  if (c >= 65 && c <= 90) return true
  return c >= 97 && c <= 122 && EVENT_HANDLER_ATTRS.has(key)
}

/**
 * The CLIENT form of `isEventHandlerAttr`: asks the ELEMENT which lowercase
 * names are handlers instead of consulting `EVENT_HANDLER_ATTRS`.
 *
 * A content attribute `onfoo` is only compiled into a handler when the
 * element's own interface defines the `onfoo` event-handler IDL attribute, so
 * `key in el` is the engine's exact answer for that element — every namespace
 * (HTML, SVG, MathML), vendor-legacy names, and names no hand-kept list has
 * caught up with. camelCase (`onClick`) is refused exactly as
 * `isEventHandlerAttr` refuses it: `setAttribute` lowercases a qualified name on
 * an HTML element, so writing one would produce a live handler.
 *
 * Why a second predicate rather than the list everywhere: the ~160-name list is
 * the single largest item a client bundle pays for (~0.8 KB gzipped), and the
 * browser already holds the authoritative answer. SSR has no element to ask, so
 * it keeps the list, which `event-handler-vocabulary.browser.test.tsx` ratchets
 * as a superset of Chromium's names — so SSR only ever refuses MORE.
 */
export function isElementEventHandlerAttr(el: Element, key: string): boolean {
  if (key.length <= 2 || key.charCodeAt(0) !== 111 /* o */ || key.charCodeAt(1) !== 110 /* n */)
    return false
  const c = key.charCodeAt(2)
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122 && key in el)
}

/**
 * Characters that cannot appear in an attribute NAME without breaking out of
 * the attribute list — whitespace, `/`, `>`, `=`, quotes, `<`, and the C0/DEL
 * controls. A name containing one of these lets a spread of a user-keyed object
 * inject SIBLING attributes: `{ 'name x="y" onload': 'z' }` serializes as
 * `<meta name x="y" onload="z">`, i.e. two attributes the author never wrote,
 * one of them a handler.
 *
 * Here rather than in each serializer because there are two of them —
 * `@pyreon/runtime-server`'s `toAttrName` and `@pyreon/head`'s `serializeTag` —
 * and only the first had it. Same reason `URL_ATTRS` lives here: a guard
 * duplicated per renderer is a guard that drifts, and the one that drifted was
 * the one nobody remembered existed.
 */
// oxlint-disable-next-line no-control-regex
export const UNSAFE_ATTR_NAME_RE = /[\s/>="'<\u0000-\u001F\u007F]/

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
/**
 * Strip every ASCII control and space, ANYWHERE in the string, before the
 * scheme test.
 *
 * This is not defensive tidying — it is what the browser does. The URL parser
 * removes tab and newline from the whole input and trims leading C0-or-space
 * before resolving a scheme, so `java\tscript:alert(1)`,
 * `java\nscript:alert(1)` and `\x01javascript:alert(1)` are all LIVE script
 * URLs. `UNSAFE_URL_RE` tolerates leading `\s*` only, so every one of them
 * read as safe and was emitted verbatim on all four render paths.
 *
 * The repo already knew this in two places and neither was this one:
 * `@pyreon/router`'s `redirect.ts` implements both WHATWG steps, and
 * `@pyreon/lint`'s `no-script-url` rule strips exactly this range with a
 * comment naming `java\tscript:` as the bypass. So the STATIC rule, which only
 * ever sees literals a developer typed, was strictly stronger than the RUNTIME
 * guard, which sees attacker-controlled values.
 *
 * Only the DECISION is normalized; the emitted value is untouched.
 */
// oxlint-disable-next-line no-control-regex
const URL_SCHEME_NOISE_RE = /[\u0000-\u0020]/g

export function isUnsafeUrl(url: string): boolean {
  const c = url.charCodeAt(0)
  // The fast path stays sound under normalization: stripping only removes
  // chars <= 32, so if the FIRST char is printable ASCII and not j/J/d/D it is
  // still the first char afterwards, and the string still cannot be
  // `javascript:`/`data:`. Normalizing costs nothing for the common case.
  if (c > 32 && c < 127 && (c | 32) !== 106 && (c | 32) !== 100) return false
  return UNSAFE_URL_RE.test(url) || UNSAFE_URL_RE.test(url.replace(URL_SCHEME_NOISE_RE, ''))
}

// A `data:image/...` URI on an image-source attribute renders as a static,
// non-executing image — the framework's own imagePlugin ships exactly these as
// blur/color placeholders (`data:image/webp;base64,…`, `data:image/svg+xml,…`).
// Those contexts are safe, so the guard allows them while still blocking
// `data:text/html` on <iframe>/<object>/<embed>, `javascript:` everywhere, and
// scripted SVG.
// `srcset` is deliberately NOT here. It was, and the entry was DEAD: this set is
// only ever consulted from `isSafeImageDataUri`, which every caller reaches
// through `isUrlAttr`/`URL_ATTRS` — and `srcset` is not in `URL_ATTRS`, so no
// value with that key ever arrived. Finishing the wiring rather than deleting it
// was considered and rejected on the merits: a `srcset` value is a CANDIDATE
// LIST (`a.png 1x, b.png 2x`), so guarding it means splitting candidates rather
// than testing the string, and neither `javascript:` nor a scripted SVG executes
// from an image-candidate slot. If `srcset` is ever added to `URL_ATTRS`, add it
// back here at the same time — the candidate split is the prerequisite.
const IMAGE_SRC_ATTRS = new Set(['src', 'poster'])
const IMAGE_CONTEXT_TAGS = new Set(['img', 'source', 'video'])
// Raster image data URIs can never carry executable content — always safe.
const SAFE_RASTER_DATA_RE =
  /^\s*data:image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)\s*[;,]/i
const SVG_DATA_RE = /^\s*data:image\/svg\+xml\s*[;,]/i
// SVG loaded via <img> is sandboxed (scripts don't run), but we still reject
// SVGs carrying <script> or on*= handlers — defense in depth, and safe if the
// URI ever reaches a script-executing context.
// The separator before an `on*=` handler is `[\s/"']`, not `\s`. Requiring
// whitespace let two payloads through, both verified live against a real
// Chromium `DOMParser` in the HTML mode this check exists to defend
// ("safe if the URI ever reaches a script-executing context"):
//
//   <svg xmlns="…"/onload="alert(1)"/>      slash separator      -> was ALLOWED
//   <svg xmlns="…"/**/onload="alert(1)"/>   comment separator    -> was ALLOWED
//   <svg xmlns="…"onload="alert(1)"/>       NO separator at all  -> was ALLOWED
//
// The third is the one a separator-shaped mental model misses entirely: after a
// quoted attribute value the tokenizer is in after-attribute-value-quoted, and
// on anything other than whitespace / `/` / `>` it emits a parse error and
// RECOVERS into before-attribute-name — so the closing quote is itself a
// separator. Measured verdicts (`hasAttribute('onload')` after parsing):
// space/newline/tab/formfeed/`/`/`//`/`/**/`/quote-adjacent all LIVE, only `>`
// inert (the tag has already closed, so it is text).
const SVG_SCRIPT_RE = /<\s*script\b|[\s/"']on[a-z-]+\s*=/i

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
