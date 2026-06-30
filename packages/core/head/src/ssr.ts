import type { ComponentFn, VNode } from '@pyreon/core'
import { h, pushContext } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import type { HeadTag } from './context'
import { createHeadContext, HeadContext } from './context'

const VOID_TAGS = new Set(['meta', 'link', 'base'])

/**
 * Render a Pyreon app to an HTML fragment + a serialized <head> string.
 *
 * The returned `head` string can be injected directly into your HTML template:
 *
 * @example
 * const { html, head } = await renderWithHead(h(App, null))
 * const page = `<!DOCTYPE html>
 * <html>
 *   <head>
 *     <meta charset="UTF-8" />
 *     ${head}
 *   </head>
 *   <body><div id="app">${html}</div></body>
 * </html>`
 */
export interface RenderWithHeadResult {
  html: string
  head: string
  /** Attributes to set on the <html> element */
  htmlAttrs: Record<string, string>
  /** Attributes to set on the <body> element */
  bodyAttrs: Record<string, string>
}

export async function renderWithHead(app: VNode): Promise<RenderWithHeadResult> {
  const ctx = createHeadContext()

  // HeadInjector runs inside renderToString's ALS scope, so pushContext reaches
  // the per-request context stack rather than the module-level fallback stack.
  function HeadInjector(): VNode {
    pushContext(new Map([[HeadContext.id, ctx]]))
    return app
  }

  const html = await renderToString(h(HeadInjector as ComponentFn, null))
  const titleTemplate = ctx.resolveTitleTemplate()
  const head = serializeHead(ctx.resolve(), titleTemplate)
  return {
    html,
    head,
    htmlAttrs: ctx.resolveHtmlAttrs(),
    bodyAttrs: ctx.resolveBodyAttrs(),
  }
}

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
): string {
  let out = ''
  for (let i = 0; i < tags.length; i++) {
    if (i > 0) out += '\n  '
    out += serializeTag(tags[i] as HeadTag, titleTemplate)
  }
  return out
}

function serializeTag(tag: HeadTag, titleTemplate?: string | ((title: string) => string)): string {
  if (tag.tag === 'title') {
    const raw = tag.children || ''
    const title = titleTemplate
      ? typeof titleTemplate === 'function'
        ? titleTemplate(raw)
        : titleTemplate.replace(/%s/g, raw)
      : raw
    return `<title>${esc(title)}</title>`
  }
  // Direct concat loop over own props — avoids the `Object.entries(props)`
  // pairs-array + per-tag `.map()` closure + intermediate strings-array + join
  // that dominated per-tag serialization cost (the hot path is N <meta> tags).
  const props = tag.props as Record<string, string> | undefined
  let open = `<${tag.tag}`
  if (props) {
    for (const k in props) {
      open += ` ${k}="${esc(props[k] as string)}"`
    }
  }
  if (VOID_TAGS.has(tag.tag)) return `${open} />`
  const content = tag.children || ''
  // Escape sequences that could break out of script/style/noscript blocks:
  // 1. Closing tags like </script> — use Unicode escape in the slash
  // 2. HTML comment openers <!-- that could confuse parsers
  const body = content.replace(/<\/(script|style|noscript)/gi, '<\\/$1').replace(/<!--/g, '<\\!--')
  return `${open}>${body}</${tag.tag}>`
}

/**
 * HTML-escape `&`, `<`, `>`, `"` in a single charCode pass — faster than the
 * prior `RE.test(s) ? s.replace(RE, …)` (two regex passes on any string that
 * contains a special char) and than an unconditional `s.replace(RE, …)`.
 *
 * Clean strings (the common case) loop once and return the original with zero
 * allocation; strings needing escapes are rebuilt via slices in the same pass.
 */
function esc(s: string): string {
  let result = ''
  let start = 0
  for (let i = 0; i < s.length; i++) {
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
  if (start === 0) return s // no special chars → original, no allocation
  return start < s.length ? result + s.slice(start) : result
}
