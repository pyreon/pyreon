import type { Element, Nodes as HastNodes, Root as HastRoot } from 'hast'
import { toHtml } from 'hast-util-to-html'
import type { Root } from 'mdast'
import { toHast } from 'mdast-util-to-hast'
import remarkDirective from 'remark-directive'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

// ─── Markdown → standalone HTML for feed bodies ───────────────────────────
//
// An RSS `<content:encoded>` body is read outside the site: by a feed
// reader, or by an importer such as dev.to's "Publishing from RSS". It gets
// none of the site's components, CSS or router, so this renders the plain
// CommonMark + GFM document — headings, lists, tables, code blocks (without
// syntax colouring), links and images — and makes every URL absolute.
//
// Site-only constructs degrade to their content: a `:::tip` container
// becomes a `<div>` around its body, and raw HTML in the source (comments
// included) is dropped rather than passed through to someone else's page.

let _processor: ReturnType<typeof buildProcessor> | null = null

function buildProcessor() {
  return unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(remarkDirective)
}

/** Resolve a link or image URL against the page it appears on. Anchors stay
 *  page-relative to the item; `mailto:` and other schemes pass through. */
function absolutize(url: string, pageUrl: string): string {
  if (url.length === 0) return url
  try {
    return new URL(url, pageUrl).href
  } catch {
    return url
  }
}

function rewriteUrls(node: HastNodes, pageUrl: string): void {
  if (node.type === 'element') {
    const el = node as Element
    for (const attr of ['href', 'src'] as const) {
      const value = el.properties[attr]
      if (typeof value === 'string') el.properties[attr] = absolutize(value, pageUrl)
    }
  }
  if ('children' in node) {
    for (const child of node.children) rewriteUrls(child as HastNodes, pageUrl)
  }
}

/**
 * Render a markdown source (frontmatter allowed) to an HTML fragment for a
 * feed item body. `pageUrl` is the item's absolute URL; relative and
 * root-relative links and images are resolved against it.
 *
 * @internal exported for the SEO emitter + tests
 */
export function markdownToFeedHtml(source: string, pageUrl: string): string {
  _processor ??= buildProcessor()
  const mdast = _processor.runSync(_processor.parse(source)) as Root
  // Directive nodes (`:::tip`, `::name`) have no hast handler. `toHast`
  // renders an unknown node with children as a `<div>` around them, which
  // is the degradation we want; frontmatter (`yaml`) renders as nothing.
  const hast = toHast(mdast) as HastRoot
  rewriteUrls(hast, pageUrl)
  return toHtml(hast)
}
