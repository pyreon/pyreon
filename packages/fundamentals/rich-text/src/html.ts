import type { JSONContent } from '@tiptap/core'

/**
 * Engine-free HTML ⇄ ProseMirror-JSON conversion for the PRE-MOUNT window.
 *
 * The TipTap engine is lazy-loaded on mount, so before that the instance has
 * no schema to parse an HTML `content` string with. Without this, a
 * `createRichTextEditor({ content: '<p>Hello world</p>' })` reported an EMPTY
 * document until mount — `text()` was `''`, `characterCount()` / `wordCount()`
 * were 0 and `isEmpty()` was `true` for a draft that plainly has text, and
 * `html()` kept returning the config string after a pre-mount `json.set`.
 *
 * This covers the StarterKit vocabulary (paragraphs, headings, lists,
 * blockquote, code block, rule, hard break; bold/italic/strike/underline/code/
 * link marks). It is an approximation by design: on mount the real schema
 * parses the content and the signal is normalized to its output, exactly as
 * before. Unknown elements are transparent (their children are kept).
 */

const BLOCK: Record<string, (el: Element) => JSONContent> = {
  P: () => ({ type: 'paragraph' }),
  H1: () => ({ type: 'heading', attrs: { level: 1 } }),
  H2: () => ({ type: 'heading', attrs: { level: 2 } }),
  H3: () => ({ type: 'heading', attrs: { level: 3 } }),
  H4: () => ({ type: 'heading', attrs: { level: 4 } }),
  H5: () => ({ type: 'heading', attrs: { level: 5 } }),
  H6: () => ({ type: 'heading', attrs: { level: 6 } }),
  UL: () => ({ type: 'bulletList' }),
  OL: () => ({ type: 'orderedList' }),
  LI: () => ({ type: 'listItem' }),
  BLOCKQUOTE: () => ({ type: 'blockquote' }),
  PRE: () => ({ type: 'codeBlock' }),
}

type Mark = { type: string; attrs?: Record<string, unknown> }

const MARK: Record<string, (el: Element) => Mark> = {
  STRONG: () => ({ type: 'bold' }),
  B: () => ({ type: 'bold' }),
  EM: () => ({ type: 'italic' }),
  I: () => ({ type: 'italic' }),
  S: () => ({ type: 'strike' }),
  DEL: () => ({ type: 'strike' }),
  U: () => ({ type: 'underline' }),
  CODE: () => ({ type: 'code' }),
  A: (el) => ({ type: 'link', attrs: { href: el.getAttribute('href') } }),
}

/** Container blocks hold blocks; everything else holds inline content. */
const CONTAINERS = new Set(['bulletList', 'orderedList', 'listItem', 'blockquote'])

function inlineOf(node: Node, marks: Mark[], out: JSONContent[]): void {
  if (node.nodeType === 3) {
    let text = (node as Text).data.replace(/\s+/g, ' ')
    // Leading whitespace at the start of a block collapses away (as the
    // schema parser does).
    if (out.length === 0) text = text.replace(/^ /, '')
    if (text === '') return
    out.push(marks.length > 0 ? { type: 'text', text, marks: [...marks] } : { type: 'text', text })
    return
  }
  if (node.nodeType !== 1) return
  const el = node as Element
  if (el.tagName === 'BR') {
    out.push({ type: 'hardBreak' })
    return
  }
  const mark = MARK[el.tagName]?.(el)
  const next = mark ? [...marks, mark] : marks
  for (const child of el.childNodes) inlineOf(child, next, out)
}

function blocksOf(parent: Node, out: JSONContent[]): void {
  // Runs of loose inline content (text directly inside a container, or
  // inside an unknown wrapper) become an implicit paragraph — the same way
  // the schema's parser wraps them.
  let loose: JSONContent[] = []
  const flushLoose = (): void => {
    const last = loose[loose.length - 1]
    if (last?.type === 'text' && last.text === ' ') loose.pop()
    else if (last?.type === 'text' && last.text?.endsWith(' ')) last.text = last.text.trimEnd()
    if (loose.length > 0) out.push({ type: 'paragraph', content: loose })
    loose = []
  }
  for (const child of parent.childNodes) {
    if (child.nodeType === 1) {
      const el = child as Element
      if (el.tagName === 'HR') {
        flushLoose()
        out.push({ type: 'horizontalRule' })
        continue
      }
      const make = BLOCK[el.tagName]
      if (make) {
        flushLoose()
        const block = make(el)
        const content: JSONContent[] = []
        if (block.type === 'codeBlock') {
          const code = el.textContent as string
          if (code !== '') content.push({ type: 'text', text: code })
        } else if (CONTAINERS.has(block.type as string)) {
          blocksOf(el, content)
        } else {
          for (const n of el.childNodes) inlineOf(n, [], content)
          const last = content[content.length - 1]
          if (last?.type === 'text' && last.text?.endsWith(' ')) {
            last.text = last.text.trimEnd()
            if (last.text === '') content.pop()
          }
        }
        if (content.length > 0) block.content = content
        out.push(block)
        continue
      }
      if (!MARK[el.tagName] && el.tagName !== 'BR' && el.querySelector('p,h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,pre,hr')) {
        // Unknown wrapper around blocks (`<div><p>…</p></div>`) — transparent.
        flushLoose()
        blocksOf(el, out)
        continue
      }
    }
    inlineOf(child, [], loose)
  }
  flushLoose()
}

const BOUNDARY_TAGS = /^\/?(p|h[1-6]|li|blockquote|pre|div|br|hr)\b/i

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  nbsp: ' ',
}

/**
 * DOM-less fallback: a single left-to-right scan that drops tags and splits
 * on block-boundary tags. A scanner rather than a tag-stripping regex, so no
 * input can re-form a tag the stripping pass already removed.
 */
function splitBlocksWithoutDom(html: string): string[] {
  const blocks: string[] = []
  let current = ''
  let i = 0
  while (i < html.length) {
    const ch = html[i]!
    if (ch === '<') {
      const end = html.indexOf('>', i + 1)
      if (end === -1) break
      if (BOUNDARY_TAGS.test(html.slice(i + 1, end))) {
        blocks.push(current)
        current = ''
      }
      i = end + 1
      continue
    }
    if (ch === '&') {
      const end = html.indexOf(';', i + 1)
      const name = end === -1 ? undefined : ENTITIES[html.slice(i + 1, end)]
      if (name !== undefined) {
        current += name
        i = end + 1
        continue
      }
    }
    current += ch
    i++
  }
  blocks.push(current)
  return blocks
}

/**
 * Parse an HTML string into StarterKit-shaped ProseMirror JSON without the
 * engine. Uses `DOMParser` when available; on a DOM-less server it falls back
 * to a scan that splits on block boundaries (text + counts stay right; the
 * block TYPES degrade to paragraphs).
 */
export function htmlToJson(html: string): JSONContent {
  const content: JSONContent[] = []
  if (typeof DOMParser !== 'undefined') {
    const body = new DOMParser().parseFromString(html, 'text/html').body
    blocksOf(body, content)
  } else {
    for (const b of splitBlocksWithoutDom(html)) {
      const text = b.replace(/\s+/g, ' ').trim()
      if (text !== '') content.push({ type: 'paragraph', content: [{ type: 'text', text }] })
    }
  }
  return { type: 'doc', content }
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const escapeAttr = (s: string): string => escapeHtml(s).replace(/"/g, '&quot;')

const MARK_TAG: Record<string, string> = {
  bold: 'strong',
  italic: 'em',
  strike: 's',
  underline: 'u',
  code: 'code',
}

function markOpen(mark: Mark): string {
  if (mark.type === 'link') {
    const href = mark.attrs?.href
    return typeof href === 'string' ? `<a href="${escapeAttr(href)}">` : '<a>'
  }
  const tag = MARK_TAG[mark.type]
  return tag ? `<${tag}>` : ''
}

function markClose(mark: Mark): string {
  if (mark.type === 'link') return '</a>'
  const tag = MARK_TAG[mark.type]
  return tag ? `</${tag}>` : ''
}

function nodeToHtml(node: JSONContent): string {
  const inner = (): string => (node.content ?? []).map(nodeToHtml).join('')
  switch (node.type) {
    case 'text': {
      const marks = (node.marks ?? []) as Mark[]
      return (
        marks.map(markOpen).join('') +
        escapeHtml(node.text ?? '') +
        [...marks].reverse().map(markClose).join('')
      )
    }
    case 'paragraph':
      return `<p>${inner()}</p>`
    case 'heading': {
      const level = Number(node.attrs?.level) || 1
      return `<h${level}>${inner()}</h${level}>`
    }
    case 'bulletList':
      return `<ul>${inner()}</ul>`
    case 'orderedList':
      return `<ol>${inner()}</ol>`
    case 'listItem':
      return `<li>${inner()}</li>`
    case 'blockquote':
      return `<blockquote>${inner()}</blockquote>`
    case 'codeBlock':
      return `<pre><code>${inner()}</code></pre>`
    case 'horizontalRule':
      return '<hr>'
    case 'hardBreak':
      return '<br>'
    default:
      return inner()
  }
}

/**
 * Serialize StarterKit-shaped ProseMirror JSON to HTML without the engine —
 * the pre-mount `html()` source once the document is no longer the config
 * string (a pre-mount `json.set`, or JSON config content).
 */
export function jsonToHtml(doc: JSONContent): string {
  return nodeToHtml(doc)
}
