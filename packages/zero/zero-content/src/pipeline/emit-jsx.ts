import type { Heading } from '../types'
import type {
  Blockquote,
  Code,
  Emphasis,
  Heading as MdastHeading,
  Image as MdastImage,
  InlineCode,
  Link,
  List,
  ListItem,
  Nodes,
  Paragraph,
  Root,
  Strong,
  Text,
  ThematicBreak,
} from 'mdast'

// ─── mdast → Pyreon JSX string emitter ─────────────────────────────────────
//
// Walks an mdast tree (the AST `remark-parse` produces) and emits a
// Pyreon JSX string. Output is a `.tsx` module the Vite plugin returns
// from its `transform` hook; Pyreon's JSX compiler picks it up like
// any other component file.
//
// Design constraints:
//
//   1. **No `dangerouslySetInnerHTML`.** Every mdast node maps to a
//      real JSX element so Pyreon's compiler can apply its
//      optimizations (template hoisting, reactive binding, etc.).
//
//   2. **String emission, not VNode construction.** The output is a
//      `.tsx` source string. We emit JSX text that Pyreon's compiler
//      will then transform — same pattern Astro / Next-MDX use.
//
//   3. **Preserve heading structure for TOC.** As we walk we capture
//      level 2-3 headings into an array exported alongside `default`.
//
//   4. **Escape, don't sanitize.** Markdown content is first-party
//      (it's in the user's repo). We HTML-escape attribute values and
//      text content so JSX parses correctly, but we don't strip
//      anything.
//
// PR 2 will plug in code highlighting (Shiki) via remark; this file
// stays focused on AST → JSX. PR 3 (remark-mdx) introduces additional
// node types we'll need to handle here.

export interface EmitResult {
  /** The body JSX (children of the outer `<article>`). */
  body: string
  /** Headings collected during the walk, for the TOC export. */
  headings: Heading[]
}

/**
 * Walk an mdast root and emit a JSX string + heading metadata.
 */
export function emitJsx(root: Root): EmitResult {
  const headings: Heading[] = []
  const body = root.children.map((n) => emitNode(n as Nodes, headings)).join('')
  return { body, headings }
}

function emitNode(node: Nodes, headings: Heading[]): string {
  switch (node.type) {
    case 'heading':
      return emitHeading(node as MdastHeading, headings)
    case 'paragraph':
      return emitParagraph(node as Paragraph, headings)
    case 'text':
      return escapeJsxText((node as Text).value)
    case 'strong':
      return `<strong>${(node as Strong).children.map((c) => emitNode(c as Nodes, headings)).join('')}</strong>`
    case 'emphasis':
      return `<em>${(node as Emphasis).children.map((c) => emitNode(c as Nodes, headings)).join('')}</em>`
    case 'inlineCode':
      return `<code>${escapeJsxText((node as InlineCode).value)}</code>`
    case 'code':
      return emitCode(node as Code)
    case 'link':
      return emitLink(node as Link, headings)
    case 'list':
      return emitList(node as List, headings)
    case 'listItem':
      return emitListItem(node as ListItem, headings)
    case 'blockquote':
      return emitBlockquote(node as Blockquote, headings)
    case 'thematicBreak':
      return emitThematicBreak(node as ThematicBreak)
    case 'image':
      return emitImage(node as MdastImage)
    case 'break':
      return '<br />'
    case 'html':
      // Raw HTML in markdown. PR 3 (remark-mdx) will replace this with
      // proper JSX handling; for v1 we pass it through inside a
      // fragment so it parses. First-party content, not user input.
      return `{/* raw html */}<>${escapeJsxText((node as { value: string }).value)}</>`
    default:
      // Unknown node type — emit a comment so the build doesn't drop
      // content silently. PR 3 covers MDX-specific node types.
      return `{/* unhandled mdast node: ${node.type} */}`
  }
}

function emitHeading(node: MdastHeading, headings: Heading[]): string {
  const tag = `h${node.depth}`
  const text = mdastChildrenToText(node.children as Nodes[])
  const slug = slugify(text)
  if (node.depth >= 2 && node.depth <= 3) {
    headings.push({ level: node.depth, text, slug })
  }
  const inner = node.children.map((c) => emitNode(c as Nodes, headings)).join('')
  return `<${tag} id={${JSON.stringify(slug)}}>${inner}</${tag}>`
}

function emitParagraph(node: Paragraph, headings: Heading[]): string {
  const inner = node.children.map((c) => emitNode(c as Nodes, headings)).join('')
  return `<p>${inner}</p>`
}

function emitCode(node: Code): string {
  // Per the plan, PR 2 introduces Shiki via remark and replaces this
  // with `<CodeBlock>`-wrapped pre-highlighted HTML. For PR 1 we emit
  // a plain `<pre><code>` so codeblocks render readably without
  // syntax color.
  const lang = node.lang ?? 'text'
  const value = escapeJsxText(node.value)
  return `<pre data-lang={${JSON.stringify(lang)}}><code>${value}</code></pre>`
}

function emitLink(node: Link, headings: Heading[]): string {
  // PR 3 swaps internal links for zero's `<Link>` component. For PR 1
  // emit `<a>` for everything; preserves behavior, no router coupling
  // for the foundation PR.
  const href = node.url
  const title = node.title ?? undefined
  const inner = node.children.map((c) => emitNode(c as Nodes, headings)).join('')
  const titleAttr = title ? ` title={${JSON.stringify(title)}}` : ''
  return `<a href={${JSON.stringify(href)}}${titleAttr}>${inner}</a>`
}

function emitList(node: List, headings: Heading[]): string {
  const tag = node.ordered ? 'ol' : 'ul'
  const start = node.ordered && typeof node.start === 'number' && node.start !== 1
    ? ` start={${node.start}}`
    : ''
  const inner = node.children.map((c) => emitNode(c as Nodes, headings)).join('')
  return `<${tag}${start}>${inner}</${tag}>`
}

function emitListItem(node: ListItem, headings: Heading[]): string {
  const inner = node.children.map((c) => emitNode(c as Nodes, headings)).join('')
  // GFM task list checkbox support — comes from remark-gfm in PR 2.
  // For PR 1 we ignore `checked` (will be undefined without remark-gfm).
  const checked = (node as ListItem & { checked?: boolean | null }).checked
  if (typeof checked === 'boolean') {
    const cb = checked
      ? '<input type="checkbox" checked disabled />'
      : '<input type="checkbox" disabled />'
    return `<li>${cb}${inner}</li>`
  }
  return `<li>${inner}</li>`
}

function emitBlockquote(node: Blockquote, headings: Heading[]): string {
  const inner = node.children.map((c) => emitNode(c as Nodes, headings)).join('')
  return `<blockquote>${inner}</blockquote>`
}

function emitThematicBreak(_node: ThematicBreak): string {
  return '<hr />'
}

function emitImage(node: MdastImage): string {
  // PR 3 will swap local images for `<Image src={import(...)}>` from
  // zero. For v1 emit a plain `<img>`.
  const src = node.url
  const alt = node.alt ?? ''
  const title = node.title ?? undefined
  const titleAttr = title ? ` title={${JSON.stringify(title)}}` : ''
  return `<img src={${JSON.stringify(src)}} alt={${JSON.stringify(alt)}}${titleAttr} />`
}

/**
 * Reduce an mdast subtree to its plain-text content. Used for heading
 * slug extraction (where we need the text BEFORE inline formatting is
 * applied) and the headings export.
 */
function mdastChildrenToText(nodes: Nodes[]): string {
  let result = ''
  for (const n of nodes) {
    if (n.type === 'text' || n.type === 'inlineCode') {
      result += (n as Text | InlineCode).value
    } else if ('children' in n) {
      result += mdastChildrenToText((n as { children: Nodes[] }).children)
    }
  }
  return result
}

/**
 * GFM-style slug — lowercase, alphanumerics + hyphens. Matches the
 * conventions used by `markdown-it-anchor` so existing internal links
 * (`[link](#section-name)`) continue to resolve when content is
 * ported in PR 7.
 *
 * @internal exported for testing
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

/**
 * Escape characters that have special meaning inside JSX text content.
 *
 * JSX text is mostly relaxed — `<` and `{` need handling, the rest
 * passes through. We escape them as HTML entities so Pyreon's compiler
 * treats the content as literal text, not embedded JSX or expressions.
 *
 * @internal exported for testing
 */
export function escapeJsxText(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
}
