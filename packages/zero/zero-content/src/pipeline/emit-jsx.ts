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

export interface EmitOptions {
  /**
   * Optional code highlighter — receives the raw code string + lang,
   * returns a pre-highlighted HTML string (typically a `<pre>...</pre>`).
   * The emitter wraps it via `dangerouslySetInnerHTML` since Shiki's
   * output is build-time HTML, not Pyreon JSX.
   *
   * Without this option, code blocks render as plain `<pre><code>`
   * (PR 1 behavior).
   */
  highlight?: (code: string, lang: string | undefined) => Promise<string>
}

/**
 * Walk an mdast root and emit a JSX string + heading metadata.
 * Returns a Promise because the optional `highlight` callback is async
 * (Shiki's `codeToHtml` returns a Promise).
 */
export async function emitJsx(root: Root, opts: EmitOptions = {}): Promise<EmitResult> {
  const headings: Heading[] = []
  const parts = await Promise.all(
    root.children.map((n) => emitNode(n as Nodes, headings, opts)),
  )
  return { body: parts.join(''), headings }
}

async function emitNode(
  node: Nodes,
  headings: Heading[],
  opts: EmitOptions,
): Promise<string> {
  switch (node.type) {
    case 'heading':
      return emitHeading(node as MdastHeading, headings, opts)
    case 'paragraph':
      return emitParagraph(node as Paragraph, headings, opts)
    case 'text':
      return escapeJsxText((node as Text).value)
    case 'strong': {
      const inner = await emitChildren((node as Strong).children as Nodes[], headings, opts)
      return `<strong>${inner}</strong>`
    }
    case 'emphasis': {
      const inner = await emitChildren((node as Emphasis).children as Nodes[], headings, opts)
      return `<em>${inner}</em>`
    }
    case 'inlineCode':
      return `<code>${escapeJsxText((node as InlineCode).value)}</code>`
    case 'code':
      return emitCode(node as Code, opts)
    case 'link':
      return emitLink(node as Link, headings, opts)
    case 'list':
      return emitList(node as List, headings, opts)
    case 'listItem':
      return emitListItem(node as ListItem, headings, opts)
    case 'blockquote':
      return emitBlockquote(node as Blockquote, headings, opts)
    case 'thematicBreak':
      return emitThematicBreak(node as ThematicBreak)
    case 'image':
      return emitImage(node as MdastImage)
    case 'break':
      return '<br />'
    case 'html':
      // Raw HTML — comes from our own remark plugins (callout +
      // codegroup wrappers) OR rare hand-written HTML in markdown.
      // First-party content; pass through verbatim. Output is JSX so
      // tag-shaped content parses natively.
      return (node as { value: string }).value
    default:
      // Unknown node type — emit a comment so the build doesn't drop
      // content silently. PR 3 covers MDX-specific node types.
      return `{/* unhandled mdast node: ${node.type} */}`
  }
}

async function emitChildren(
  nodes: Nodes[],
  headings: Heading[],
  opts: EmitOptions,
): Promise<string> {
  const parts = await Promise.all(nodes.map((n) => emitNode(n, headings, opts)))
  return parts.join('')
}

async function emitHeading(
  node: MdastHeading,
  headings: Heading[],
  opts: EmitOptions,
): Promise<string> {
  const tag = `h${node.depth}`
  const text = mdastChildrenToText(node.children as Nodes[])
  const slug = slugify(text)
  if (node.depth >= 2 && node.depth <= 3) {
    headings.push({ level: node.depth, text, slug })
  }
  const inner = await emitChildren(node.children as Nodes[], headings, opts)
  return `<${tag} id={${JSON.stringify(slug)}}>${inner}</${tag}>`
}

async function emitParagraph(
  node: Paragraph,
  headings: Heading[],
  opts: EmitOptions,
): Promise<string> {
  const inner = await emitChildren(node.children as Nodes[], headings, opts)
  return `<p>${inner}</p>`
}

async function emitCode(node: Code, opts: EmitOptions): Promise<string> {
  // When a highlighter is supplied (PR 2 wires Shiki via parse.ts),
  // delegate to it. Shiki emits a full `<pre class="shiki">...</pre>`
  // HTML string with both light + dark themes; we wrap in a Pyreon
  // <CodeBlock> via dangerouslySetInnerHTML (the only place where
  // dangerouslySetInnerHTML is acceptable — Shiki output is build-time
  // HTML, not user input, and re-walking it through emit-jsx would
  // throw away all the precomputed coloring).
  const lang = node.lang ?? 'text'
  if (opts.highlight) {
    const html = await opts.highlight(node.value, lang)
    // Embed as inner HTML on a Pyreon component wrapper so the styler /
    // copy-button can attach later. The CodeBlock component is shipped
    // as a built-in (PR 2 components/CodeBlock.tsx).
    const escaped = jsStringLiteral(html)
    return `<CodeBlock lang={${JSON.stringify(lang)}} dangerouslySetInnerHTML={{ __html: ${escaped} }} />`
  }
  // No highlighter — emit a plain `<pre><code>` (matches PR 1 behavior).
  const value = escapeJsxText(node.value)
  return `<pre data-lang={${JSON.stringify(lang)}}><code>${value}</code></pre>`
}

async function emitLink(
  node: Link,
  headings: Heading[],
  opts: EmitOptions,
): Promise<string> {
  // PR 3 swaps internal links for zero's `<Link>` component. For PR 2
  // we still emit `<a>` for everything; the link-rewriter remark plugin
  // lands in PR 3 alongside MDX integration.
  const href = node.url
  const title = node.title ?? undefined
  const inner = await emitChildren(node.children as Nodes[], headings, opts)
  const titleAttr = title ? ` title={${JSON.stringify(title)}}` : ''
  return `<a href={${JSON.stringify(href)}}${titleAttr}>${inner}</a>`
}

async function emitList(
  node: List,
  headings: Heading[],
  opts: EmitOptions,
): Promise<string> {
  const tag = node.ordered ? 'ol' : 'ul'
  const start = node.ordered && typeof node.start === 'number' && node.start !== 1
    ? ` start={${node.start}}`
    : ''
  const inner = await emitChildren(node.children as Nodes[], headings, opts)
  return `<${tag}${start}>${inner}</${tag}>`
}

async function emitListItem(
  node: ListItem,
  headings: Heading[],
  opts: EmitOptions,
): Promise<string> {
  const inner = await emitChildren(node.children as Nodes[], headings, opts)
  // GFM task list checkbox support — comes from remark-gfm in PR 2.
  const checked = (node as ListItem & { checked?: boolean | null }).checked
  if (typeof checked === 'boolean') {
    const cb = checked
      ? '<input type="checkbox" checked disabled />'
      : '<input type="checkbox" disabled />'
    return `<li>${cb}${inner}</li>`
  }
  return `<li>${inner}</li>`
}

async function emitBlockquote(
  node: Blockquote,
  headings: Heading[],
  opts: EmitOptions,
): Promise<string> {
  const inner = await emitChildren(node.children as Nodes[], headings, opts)
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

/**
 * Escape a string for safe embedding inside a JS double-quoted string
 * literal. Used for the `dangerouslySetInnerHTML` payload (Shiki's
 * pre-highlighted HTML) where JSX text-escape would mangle the HTML
 * tags.
 *
 * @internal exported for testing
 */
export function jsStringLiteral(input: string): string {
  return `"${input
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/[\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16))}"`
}
