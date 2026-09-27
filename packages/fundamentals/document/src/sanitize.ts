/**
 * Shared sanitization utilities for document renderers.
 * Prevents XSS via CSS injection, XML injection, and javascript: protocol attacks.
 */

/**
 * Sanitize a CSS value — strips characters that could break out of a CSS property.
 * Blocks: semicolons, braces, angle brackets, quotes, backslashes, expressions.
 */
export function sanitizeCss(value: string | undefined): string {
  if (value == null) return ''
  // Remove anything that could break out of a CSS value
  return value
    .replace(/[;{}()<>\\'"]/g, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/url\s*\(/gi, '')
    .replace(/javascript\s*:/gi, '')
}

/**
 * Sanitize a color value — only allows hex colors, named colors, rgb/rgba, hsl/hsla.
 * Returns the value if valid, empty string if not.
 */
export function sanitizeColor(value: string | undefined): string {
  if (value == null) return ''
  const trimmed = value.trim()
  // Hex: #fff, #ffffff, #ffffffff
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return trimmed
  // Named colors (common subset)
  if (/^[a-zA-Z]{1,20}$/.test(trimmed)) return trimmed
  // rgb/rgba/hsl/hsla
  if (/^(rgb|hsl)a?\(\s*[\d.,\s%]+\)$/.test(trimmed)) return trimmed
  // transparent, inherit, currentColor — also matched by L30 named-colors regex
  // (all letters, ≤ 20 chars) so this is defense-in-depth, dead in practice.
  /* v8 ignore next — subset of named-colors regex above */
  if (/^(transparent|inherit|currentColor|initial|unset)$/i.test(trimmed)) return trimmed
  return ''
}

/**
 * Sanitize a color for XML attributes (DOCX/PPTX) — only hex without #.
 * Returns 6-char hex string or default.
 */
export function sanitizeXmlColor(value: string | undefined, fallback = '000000'): string {
  if (value == null) return fallback
  const hex = value.replace('#', '')
  if (/^[0-9a-fA-F]{3,8}$/.test(hex)) return hex
  return fallback
}

// ASCII C0 controls + DEL. Never legitimate inside a URL, and browsers /
// markdown parsers silently DROP some of them (tab, LF, CR anywhere; the
// rest at the edges) — so `java\tscript:` or `\x01javascript:` executes.
// Removed from the returned URL, not just from the probe.
// oxlint-disable-next-line no-control-regex
const CONTROL_RE = /[\x00-\x1F\x7F]/g

const NAMED_ENTITIES: Record<string, string> = {
  colon: ':',
  tab: '\t',
  newline: '\n',
  sol: '/',
  amp: '&',
  lpar: '(',
  rpar: ')',
}

/**
 * Decode the character references a consumer might decode BEFORE it
 * resolves the scheme (CommonMark decodes entities inside link
 * destinations; HTML decodes them inside attributes). Decoding to a fixed
 * point is deliberately more conservative than any single consumer —
 * `&amp;#106;` is rejected too. Used only for the scheme PROBE.
 */
function decodeEntities(value: string): string {
  let prev = ''
  let cur = value
  for (let i = 0; i < 5 && cur !== prev; i++) {
    prev = cur
    cur = cur.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (m, body: string) => {
      const b = body.toLowerCase()
      if (b.startsWith('#x')) return safeFromCodePoint(Number.parseInt(b.slice(2), 16), m)
      if (b.startsWith('#')) return safeFromCodePoint(Number.parseInt(b.slice(1), 10), m)
      return NAMED_ENTITIES[b] ?? m
    })
  }
  return cur
}

function safeFromCodePoint(cp: number, fallback: string): string {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return fallback
  return String.fromCodePoint(cp)
}

/**
 * The scheme a URL-consumer will resolve, or `null` for a relative URL.
 * Controls + whitespace are removed and entities decoded first, so every
 * obfuscation a browser or markdown parser would undo is undone here too.
 */
function urlScheme(url: string): string | null {
  const probe = decodeEntities(url).replace(CONTROL_RE, '').replace(/\s/g, '').toLowerCase()
  const m = /^([a-z][a-z0-9+.-]*):/.exec(probe)
  return m ? (m[1] as string) : null
}

const LINK_SCHEMES = new Set(['http', 'https', 'mailto', 'tel'])
const IMAGE_SCHEMES = new Set(['http', 'https'])

/**
 * Sanitize a link destination — ALLOWLIST: `http`, `https`, `mailto`,
 * `tel`, and scheme-less (relative / `#anchor` / `//host`) URLs. Anything
 * else (`javascript:`, `vbscript:`, `data:`, `file:`, custom app schemes)
 * returns `''`. Control characters are stripped from the result.
 *
 * A blocklist was used before and was bypassable by a leading C0 control
 * (`\x01javascript:`) or an entity-encoded scheme (`&#106;avascript:`,
 * which CommonMark decodes inside a link destination).
 */
export function sanitizeHref(url: string | undefined): string {
  if (url == null) return ''
  const cleaned = url.replace(CONTROL_RE, '').trim()
  if (cleaned === '') return ''
  const scheme = urlScheme(cleaned)
  if (scheme === null || LINK_SCHEMES.has(scheme)) return cleaned
  return ''
}

/**
 * Sanitize an image src — ALLOWLIST: `http`, `https`, `data:image/…`, and
 * scheme-less (relative) sources. Same obfuscation handling as
 * {@link sanitizeHref}.
 */
export function sanitizeImageSrc(src: string | undefined): string {
  if (src == null) return ''
  const cleaned = src.replace(CONTROL_RE, '').trim()
  if (cleaned === '') return ''
  const scheme = urlScheme(cleaned)
  if (scheme === null || IMAGE_SCHEMES.has(scheme)) return cleaned
  if (scheme === 'data' && /^data:image\//i.test(cleaned.replace(/\s/g, ''))) return cleaned
  return ''
}

/**
 * Make a (sanitized) URL safe as a CommonMark-family link destination
 * `[label](dest)`: percent-encode everything that can END the destination
 * or be parsed as markup inside it — whitespace, `(`, `)`, `<`, `>`, `\`.
 * `https://a.com/x) [evil](javascript:…` otherwise closes the first link
 * and opens a second whose destination was never sanitized. Percent-
 * encoding (rather than `<…>` wrapping) is used because the chat flavors
 * (Teams, Discord) do not all support the angle-bracket form.
 */
export function markdownLinkDestination(url: string): string {
  return url.replace(/[\s()<>\\]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)
}

/**
 * Longest run of consecutive backticks in `text` — a CommonMark code fence
 * must be LONGER than any run inside it, or the content closes it.
 */
export function longestBacktickRun(text: string): number {
  let max = 0
  let cur = 0
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 96) {
      cur++
      if (cur > max) max = cur
    } else cur = 0
  }
  return max
}

/**
 * For chat flavors (Slack, WhatsApp, Discord, Teams) whose ``` code blocks
 * cannot be lengthened: break every run of 3+ backticks in code CONTENT
 * with a zero-width space so it cannot close the block. Visually identical.
 */
export function breakCodeFences(text: string): string {
  return text.replace(/`{3,}/g, (run) => run.split('').join('​'))
}

/** Restrict a code-block language tag to characters that cannot break the fence line. */
export function sanitizeCodeLanguage(lang: string | undefined): string {
  if (lang == null) return ''
  return lang.replace(/[^\w+#.-]/g, '')
}

/**
 * Sanitize a style attribute value — validates it's safe CSS.
 */
export function sanitizeStyle(value: string | undefined): string {
  if (value == null) return ''
  return sanitizeCss(value)
}

/**
 * Escape the HTML/XML metacharacters `& < > "` for safe inclusion in
 * element text / double-quoted attributes. Was copy-pasted byte-
 * identically as `escapeHtml`/`escapeXml`/`esc` into 4 renderers;
 * consolidated here. (csv/runtime-server/compiler escapes are
 * intentionally separate — different algorithm/layer.)
 */
// Fast test — most document strings (prose, labels, cell values) carry no
// metacharacters, so the dominant case returns the input untouched.
// NOTE: document's entity set is `& < > "` ONLY — no `'`/&#39; (unlike
// runtime-server's escapeHtml) — so the regex must not include `'`.
const NEEDS_ESCAPE_RE = /[&<>"]/

export function escapeXml(str: string): string {
  if (!NEEDS_ESCAPE_RE.test(str)) return str
  // Dirty path: single charCode scan with lazy slicing (the canonical
  // shape from runtime-server's escapeHtml). The previous 4× chained
  // `.replace()` did 4 full scans + up to 3 intermediate strings per
  // call — paid even on clean strings.
  let out = ''
  let last = 0
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    let entity: string | null = null
    if (c === 38) entity = '&amp;'
    else if (c === 60) entity = '&lt;'
    else if (c === 62) entity = '&gt;'
    else if (c === 34) entity = '&quot;'
    if (entity !== null) {
      out += str.slice(last, i) + entity
      last = i + 1
    }
  }
  return out + str.slice(last)
}
