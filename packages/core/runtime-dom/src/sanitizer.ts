/**
 * Fallback allowlist HTML sanitizer — the default for the sanitized
 * `innerHTML` prop and `sanitizeHtml()`.
 *
 * Lives behind a registration seam (`_setDefaultSanitizer` in props.ts) so
 * apps that never use sanitized innerHTML tree-shake the ~100-tag allowlists
 * and the sanitize walker entirely. Importing this module (side effect)
 * registers it; @pyreon/vite-plugin injects the import automatically when a
 * module's source uses `innerHTML`. `dangerouslySetInnerHTML` is raw by
 * design (React semantics) and never involves this module.
 */
import { isSafeImageDataUri, isUnsafeUrl, URL_ATTRS } from '@pyreon/core'
import { _setDefaultSanitizer } from './props'

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

// Safe SVG tags allowed by the fallback sanitizer. Icons and inline
// illustrations ship as `<svg>` fragments through `innerHTML`; without these the
// allowlist replaces every SVG element with a text node and an entire icon set
// renders blank, with no error and no warning. Curated safe profile mirroring
// DOMPurify's, DELIBERATELY EXCLUDING as XSS-capable: `script`; `foreignObject`
// (embeds arbitrary HTML, reopening every HTML XSS vector); `style` (CSS
// injection); and SMIL `animate*`/`set` (the `attributeName="href"
// values="javascript:…"` vector).
// All entries LOWERCASE: `sanitizeNode` compares `tagName.toLowerCase()`, and
// the parser re-cases SVG foreign content so the DOM tagName round-trips.
const SAFE_SVG_TAGS = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'textpath',
  'tref',
  'defs',
  'clippath',
  'mask',
  'lineargradient',
  'radialgradient',
  'stop',
  'pattern',
  'image',
  'use',
  'symbol',
  'marker',
  'title',
  'desc',
  'metadata',
  'switch',
  'view',
  'filter',
  'feblend',
  'fecolormatrix',
  'fecomponenttransfer',
  'fecomposite',
  'feconvolvematrix',
  'fediffuselighting',
  'fedisplacementmap',
  'fedistantlight',
  'fedropshadow',
  'feflood',
  'fefunca',
  'fefuncb',
  'fefuncg',
  'fefuncr',
  'fegaussianblur',
  'feimage',
  'femerge',
  'femergenode',
  'femorphology',
  'feoffset',
  'fepointlight',
  'fespecularlighting',
  'fespotlight',
  'fetile',
  'feturbulence',
])

// Attributes that can carry executable code
const UNSAFE_ATTR_RE = /^on/i

/**
 * Fallback tag-stripping sanitizer for environments without the Sanitizer API.
 * Removes all tags not in SAFE_TAGS / SAFE_SVG_TAGS, strips event handler
 * attributes, and blocks javascript:/data: URLs in href/src/action attributes.
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
      // `href`/`src`/… (HTML) plus SVG's `xlink:href` — whose qualified name is
      // NOT in URL_ATTRS but whose localName IS `href`, so `<a xlink:href=
      // "javascript:…">` / `<use xlink:href>` would otherwise slip the guard.
      (URL_ATTRS.has(attr.name) || attr.localName === 'href') &&
      isUnsafeUrl(attr.value) &&
      !isSafeImageDataUri(el.tagName, attr.name, attr.value)
    ) {
      el.removeAttribute(attr.name)
    }
  }
}

// Dev-only: warn ONCE per dropped tag name so a silent strip ("my icon
// renders blank") becomes visible without flooding the console on repeated
// content. Bounded by the finite tag vocabulary; tree-shaken in production.
const _warnedDroppedTags = new Set<string>()

function sanitizeNode(node: Node): void {
  const children = Array.from(node.childNodes)
  for (const child of children) {
    if (child.nodeType !== 1) continue
    const el = child as Element
    const tag = el.tagName.toLowerCase()
    if (!SAFE_TAGS.has(tag) && !SAFE_SVG_TAGS.has(tag)) {
      if (process.env.NODE_ENV !== 'production' && !_warnedDroppedTags.has(tag)) {
        _warnedDroppedTags.add(tag)
        console.warn(
          `[Pyreon] innerHTML sanitizer dropped <${tag}> (not in the safe HTML/SVG allowlist) — ` +
            `its content was replaced with text. If this is trusted markup, pass a custom ` +
            `sanitizer via setSanitizer(), or use dangerouslySetInnerHTML to bypass sanitization.`,
        )
      }
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

/** The default sanitize pipeline (exported for direct use/testing). */
export function defaultSanitize(html: string): string {
  return fallbackSanitize(html)
}

_setDefaultSanitizer(defaultSanitize)
