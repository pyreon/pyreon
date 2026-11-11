// The string half of head rendering, kept apart from `ssr.ts` so it carries no
// `@pyreon/runtime-server` (and so no `node:async_hooks`) dependency. The
// client's adoption contract lives here too: every keyed tag is stamped with
// `data-pyreon-head="<key>"`, the attribute `dom.ts` seeds from on the first
// sync, so a hydrating client patches the server's tags instead of appending a
// second copy of each.
import { escapeJsonForScript, isEventHandlerAttr } from '@pyreon/core'
import { isHeadAttrSafe } from './attr-guard'
import { HEAD_ATTR, type HeadTag } from './context'
import { applyTitleTemplate } from './title'

const VOID_TAGS = new Set(['meta', 'link', 'base'])

/**
 * Serialize an array of resolved head tags into an HTML `<head>` fragment
 * string (the string-producing half of {@link renderWithHead}).
 *
 * Exposed for pipelines that resolve the head separately from the app render
 * (streaming SSR, custom templating, framework adapters) and for
 * apples-to-apples comparison against other head managers' `render()`.
 *
 * Uses a direct concat loop rather than `tags.map(…).join('\n  ')` — it avoids
 * the intermediate array + per-tag closure allocation, and modern engines
 * build the result as a rope (no O(n²) copying).
 *
 * @example
 * const head = serializeHead(ctx.resolve(), ctx.resolveTitleTemplate())
 * // → '<title>…</title>\n  <meta name="…" content="…" />'
 */
export function serializeHead(
  tags: HeadTag[],
  titleTemplate?: string | ((title: string) => string),
  nonce?: string,
): string {
  let out = ''
  for (let i = 0; i < tags.length; i++) {
    if (i > 0) out += '\n  '
    out += serializeTag(tags[i] as HeadTag, titleTemplate, nonce)
  }
  return out
}

function serializeTag(
  tag: HeadTag,
  titleTemplate?: string | ((title: string) => string),
  nonce?: string,
): string {
  if (tag.tag === 'title') {
    return `<title>${esc(applyTitleTemplate(tag.children || '', titleTemplate))}</title>`
  }
  // Direct concat loop over own props — avoids the `Object.entries(props)`
  // pairs-array + per-tag `.map()` closure + intermediate strings-array + join
  // that dominated per-tag serialization cost (the hot path is N <meta> tags).
  const props = tag.props as Record<string, string> | undefined
  let open = `<${tag.tag}`
  if (props) {
    for (const k in props) {
      // `<head>` is a SERIALIZER like any other, and it was the one with no
      // guards at all. Every check here is the one `@pyreon/runtime-server`'s
      // `renderProp` already ran for the same markup rendered as an element —
      // sharing the predicates from `@pyreon/core` rather than re-deriving them,
      // since two serializers with private copies is how the element renderer
      // acquired its own gaps.
      const v = props[k] as string
      if (!isHeadAttrSafe(k, v, tag.tag, isEventHandlerAttr)) continue
      open += ` ${k}="${esc(v)}"`
    }
  }
  // CSP: stamp the request nonce on inline/executable tags so a strict
  // `script-src`/`style-src 'nonce-…'` policy admits them. Only `<script>` and
  // `<style>` are nonce-eligible; a user-supplied `nonce` prop wins (skip).
  if (nonce && (tag.tag === 'script' || tag.tag === 'style') && !(props && 'nonce' in props)) {
    open += ` nonce="${esc(nonce)}"`
  }
  // The client seeds its managed set from this marker (`dom.ts`); without it,
  // hydration appended a second copy of every tag next to the server's. Last,
  // so the tag still reads as its own attributes first.
  if (typeof tag.key === 'string' && tag.key !== '') open += ` ${HEAD_ATTR}="${esc(tag.key)}"`
  if (VOID_TAGS.has(tag.tag)) return `${open} />`
  const content = tag.children || ''
  // A JSON data block (JSON-LD, speculation rules, import map, any `+json` /
  // `/json` type) is read back with `JSON.parse`, so it takes the JSON recipe:
  // every `<` becomes `\u003C`, a valid JSON escape. The generic rewrite below
  // produced `<\!--`, and `\!` is not a JSON escape — a JSON-LD block whose
  // data contained `<!--` became unparseable and its structured data was
  // silently dropped.
  if (tag.tag === 'script' && isJsonScriptType(props?.type)) {
    return `${open}>${escapeJsonForScript(content)}</${tag.tag}>`
  }
  // Script code, CSS and noscript markup: break the closing-tag and
  // comment-opener sequences without changing what the body means (`\/` and
  // `\!` are identity escapes inside JS strings and CSS).
  const body = content.replace(/<\/(script|style|noscript)/gi, '<\\/$1').replace(/<!--/g, '<\\!--')
  return `${open}>${body}</${tag.tag}>`
}

/**
 * Is this `<script type>` a JSON data block? `importmap` and
 * `speculationrules` are JSON-bodied; otherwise any MIME type whose subtype is
 * `json` or ends in `+json` (`application/ld+json`, `application/json`),
 * ignoring case and parameters.
 */
function isJsonScriptType(type: string | undefined): boolean {
  if (!type) return false
  const semi = type.indexOf(';')
  const t = (semi === -1 ? type : type.slice(0, semi)).trim().toLowerCase()
  return t === 'importmap' || t === 'speculationrules' || t.endsWith('/json') || t.endsWith('+json')
}

/** The characters `esc` rewrites. */
const ESC_RE = /[&<>"]/

/**
 * HTML-escape `&`, `<`, `>`, `"`.
 *
 * The regex `search` finds the first special character natively, then the
 * charCode loop runs only from there. A pure charCode loop from index 0 paid
 * a JS step for every character of a clean string, which is the common case
 * for head content: measured on Node 26 / Bun 1.4, 2.8x / 1.8x faster on short
 * clean strings, ~15x / ~9x on long ones, and 1.36x / 1.28x on strings that do
 * need escaping (the loop skips the clean prefix). Clean strings are returned
 * as-is, with no allocation.
 */
function esc(s: string): string {
  const first = s.search(ESC_RE)
  if (first < 0) return s
  let result = s.slice(0, first)
  let start = first
  for (let i = first; i < s.length; i++) {
    let rep: string
    switch (s.charCodeAt(i)) {
      case 38: // &
        rep = '&amp;'
        break
      case 60: // <
        rep = '&lt;'
        break
      case 62: // >
        rep = '&gt;'
        break
      case 34: // "
        rep = '&quot;'
        break
      default:
        continue
    }
    if (i > start) result += s.slice(start, i)
    result += rep
    start = i + 1
  }
  return start < s.length ? result + s.slice(start) : result
}
