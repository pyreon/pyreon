/**
 * Heading ids + permalinks for markdown-it — the one configuration of
 * `markdown-it-anchor` this site used, without the dependency.
 *
 * For every heading it:
 *   - derives an id from the heading's text (text + inline-code content, the
 *     way the text reads) with the caller's `slugify`, or keeps an explicit
 *     `id` attribute; a repeated id gets `-1`, `-2`, … appended, and a
 *     repeated EXPLICIT id is an error, because two anchors with one target is
 *     a broken link the author wrote;
 *   - sets `tabindex="-1"` so following the anchor moves keyboard focus there;
 *   - inserts a permalink AFTER the heading element, not inside it:
 *     `<a class="…" href="#id" aria-describedby="id">#</a>`. Outside the
 *     heading the `#` never becomes part of the heading's accessible name, and
 *     `aria-describedby` still ties the link to the heading it points at;
 *   - reports `{ slug, title }` to `onHeading`.
 *
 * The rendered HTML is byte-identical to `markdown-it-anchor@9.2.1` with
 * `permalink.linkAfterHeader({ style: 'aria-describedby' })` — verified by
 * rendering every page of the docs site both ways when this replaced it.
 */
import type { MarkdownIt } from 'markdown-it'

type Token = ReturnType<MarkdownIt['parse']>[number]

export interface HeadingAnchorOptions {
  slugify: (title: string) => string
  /** Class on the permalink `<a>`. */
  className: string
  /** The permalink's visible content (raw HTML). */
  symbol: string
  onHeading?: (token: Token, info: { slug: string; title: string }) => void
}

function headingText(children: readonly Token[] | null): string {
  let text = ''
  for (const t of children ?? []) if (t.type === 'text' || t.type === 'code_inline') text += t.content
  return text
}

export function headingAnchors(md: MarkdownIt, opts: HeadingAnchorOptions): void {
  md.core.ruler.push('heading_anchors', (state) => {
    const used = new Set<string>()
    const tokens = state.tokens
    for (let idx = 0; idx < tokens.length; idx++) {
      const token = tokens[idx]!
      if (token.type !== 'heading_open') continue

      const title = headingText(tokens[idx + 1]!.children)
      const explicit = token.attrGet('id')
      const base = explicit === null ? opts.slugify(title) : String(explicit)
      if (explicit !== null && used.has(base)) {
        throw new Error(`User defined \`id\` attribute \`${base}\` is not unique. Please fix it in your Markdown to continue.`)
      }
      let slug = base
      for (let n = 1; used.has(slug); n++) slug = `${base}-${n}`
      used.add(slug)

      token.attrSet('id', slug)
      token.attrSet('tabindex', '-1')

      const open = new state.Token('link_open', 'a', 1)
      open.attrs = [
        ['class', opts.className],
        ['href', `#${slug}`],
        ['aria-describedby', slug],
      ]
      const symbol = new state.Token('html_inline', '', 0)
      symbol.content = opts.symbol
      // heading_open, inline, heading_close — the link goes after the close.
      tokens.splice(idx + 3, 0, open, symbol, new state.Token('link_close', 'a', -1))

      opts.onHeading?.(token, { slug, title })
    }
  })
}
