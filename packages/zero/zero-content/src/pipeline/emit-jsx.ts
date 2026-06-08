import type { Heading } from '../types'
import { escapeHtmlText } from '../_shared/html-escape'
import { parseCodeFenceMeta } from './code-meta'
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
import type {
  MdxJsxAttribute,
  MdxJsxExpressionAttribute,
  MdxJsxFlowElement,
  MdxJsxTextElement,
} from 'mdast-util-mdx-jsx'

type MdxJsxElement = MdxJsxFlowElement | MdxJsxTextElement

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
  /**
   * Callback that receives every top-of-file ESM `import` / `export`
   * statement encountered (`mdxjsEsm` nodes). The walker emits an empty
   * string in place so the markdown body's JSX output stays clean;
   * `compileMarkdown` collects them via this hook and prepends them to
   * the generated `.tsx` module's import section.
   */
  mdxEsmHoist?: (esm: string) => void
  /**
   * Callback that receives every component name (uppercase JSX tag)
   * referenced in the markdown — produced by `mdxJsxFlowElement` /
   * `mdxJsxTextElement` nodes. `compileMarkdown` uses these to emit
   * a single `import { Name1, Name2 } from 'virtual:zero-content/components'`
   * at the top of the compiled `.tsx`.
   *
   * Built-in component names (`Callout`, `CodeGroup`, `CodeBlock`)
   * are forwarded the same way; the virtual module re-exports them.
   */
  mdxComponentRef?: (name: string) => void
  /**
   * PR-H audit M16 — callback fired when the emitter encounters an
   * unhandled mdast node type. Pre-fix the emitter silently emitted a
   * JSX comment (`unhandled mdast node: X`) that vanished from
   * production builds (JSX comments tree-shake), so authors using a
   * markdown feature the pipeline did not yet handle (math nodes,
   * table cells with subtypes, future remark plugin outputs) saw
   * their content drop with no signal. The callback lets the Vite
   * plugin surface a `this.warn(...)` with file context.
   */
  onUnhandledNode?: (nodeType: string) => void
  /**
   * PR-J audit H3 — minimum heading level captured into the
   * `headings` export. Default `2` (skip the page's main `<h1>`).
   */
  headingsMinLevel?: number
  /**
   * PR-J audit H3 — maximum heading level captured. Default `6`
   * (capture everything down to `<h6>`). Pre-fix the emitter hard-
   * capped at level 3, dropping `<h4>` / `<h5>` / `<h6>` from the
   * TOC export entirely — a real authoring footgun for sections
   * that nested deeper than h3.
   */
  headingsMaxLevel?: number
  /**
   * PR-J audit L7 — used-slug set, threaded through the recursive
   * emit walk. Initialized fresh per `emitJsx` call so re-entrant
   * walks don't share state. Each heading consults + mutates it to
   * derive a unique slug; the unique slug also lands as the
   * `<h*>`'s id attribute so deep-links resolve to the right anchor
   * when several headings share text.
   */
  _usedSlugs?: Set<string>
  /**
   * Resolver for internal `[text](./foo.md)` markdown links. Receives
   * the raw `href` from the markdown source; returns the rewritten
   * URL (e.g. `/docs/foo`), or `null` to leave the link unchanged.
   *
   * PR-F audit H8 — pre-fix every `[foo](./bar.md)` link shipped to
   * production as a literal `./bar.md` href, 404-ing on every static
   * host (and confusing the in-app router on others). The plugin
   * threads a resolver here that knows about the collection map and
   * the current file's collection so relative `.md` paths rewrite to
   * route URLs.
   *
   * The resolver is called for every link, including external ones,
   * so it can defensively bail (`return null`) for absolute URLs /
   * mail-to / etc.
   */
  resolveInternalLink?: (href: string) => string | null
  /**
   * Resolver for local image `![alt](./hero.png)` references.
   * Receives the raw `src`; returns either:
   *   - a string of TSX code to splice INTO the `<Image>` JSX `src`
   *     attribute (e.g. `import('./hero.png?optimize')`), OR
   *   - `null` to emit the existing fallback `<img src={...}>`.
   *
   * PR-F audit H7 — pre-fix every local image was emitted as a plain
   * `<img>`, bypassing zero's image-optimization pipeline (auto
   * srcset, blur placeholder, lazy-loading). The plugin's default
   * resolver returns the dynamic-import-with-?optimize form for
   * relative paths; absolute / data URLs fall through to `<img>`.
   */
  resolveLocalImage?: (src: string) => string | null
}

/**
 * Walk an mdast root and emit a JSX string + heading metadata.
 * Returns a Promise because the optional `highlight` callback is async
 * (Shiki's `codeToHtml` returns a Promise).
 */
export async function emitJsx(root: Root, opts: EmitOptions = {}): Promise<EmitResult> {
  const headings: Heading[] = []
  // PR-J audit L7 — initialize the dedup set once per emit call. The
  // shared set is threaded through the walk via opts so the same
  // `_usedSlugs` reference is consulted for every heading inside one
  // markdown source.
  const walkOpts: EmitOptions = {
    ...opts,
    _usedSlugs: opts._usedSlugs ?? new Set<string>(),
  }
  const parts = await Promise.all(
    root.children.map((n) => emitNode(n as Nodes, headings, walkOpts)),
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
      return emitImage(node as MdastImage, opts)
    case 'break':
      return '<br />'
    case 'html': {
      // Raw HTML — comes from our own remark plugins (callout +
      // codegroup wrappers) OR rare hand-written HTML in markdown.
      // First-party content; pass through verbatim. Output is JSX so
      // tag-shaped content parses natively.
      const value = (node as { value: string }).value
      // Detect PascalCase JSX component references inside the raw
      // value (e.g. `<CodeGroup labels={...}>` emitted by the
      // codegroup plugin, `<Callout type="tip">` by callout) and
      // register them via `mdxComponentRef` so the upstream emit
      // pipeline adds the matching imports. Without this, the docs
      // page compiles JSX that references `CodeGroup` as a free
      // name → `ReferenceError: CodeGroup is not defined` at render
      // time, exactly the bug surfaced by the directive-syntax
      // normalization (which started actually FIRING the codegroup
      // plugin for the 87 `::: code-group` sites in the docs).
      if (opts.mdxComponentRef) {
        const componentRe = /<([A-Z][A-Za-z0-9]*)/g
        let m: RegExpExecArray | null
        const seen = new Set<string>()
        while ((m = componentRe.exec(value)) !== null) {
          const name = m[1] as string
          if (!seen.has(name)) {
            seen.add(name)
            opts.mdxComponentRef(name)
          }
        }
      }
      return value
    }
    // ─── MDX nodes (PR 3 — produced by remark-mdx) ───────────────────
    case 'mdxJsxFlowElement':
    case 'mdxJsxTextElement':
      return emitMdxJsxElement(node as MdxJsxElement, headings, opts)
    case 'mdxFlowExpression':
    case 'mdxTextExpression':
      // `{expression}` blocks in markdown — emit verbatim wrapped in
      // braces so JSX sees them as expression slots. We DON'T escape;
      // the contained code is first-party MDX.
      return `{${(node as { value: string }).value}}`
    case 'mdxjsEsm':
      // `import` / `export` ESM statements at the top of an MDX file.
      // These are hoisted to the module scope; the walker collects them
      // via the `mdxEsmHoist` opts callback and emits an empty string
      // in place. See `compileMarkdown` for the hoist wiring.
      if (opts.mdxEsmHoist) opts.mdxEsmHoist((node as { value: string }).value)
      return ''
    // ─── Tables via remark-gfm — emit standard <table> markup ────────
    // remark-gfm produces:
    //   { type: 'table', align: ['left'|'right'|'center'|null, ...],
    //     children: [<tableRow header>, <tableRow body>, ...] }
    //   { type: 'tableRow', children: [<tableCell>, ...] }
    //   { type: 'tableCell', children: [<inline>...] }
    // The first row is always the header; subsequent rows are body
    // cells. Column alignment lives on the parent `table` node — we
    // thread it down via the walker so each cell emits the matching
    // `style="text-align: X"` (the canonical mapping that prerendered
    // HTML uses for GFM table alignment).
    case 'table': {
      const { align, children } = node as {
        align?: Array<'left' | 'right' | 'center' | null>
        children: Nodes[]
      }
      // First row = thead; rest = tbody. GFM tables always have
      // exactly one header row; remark normalizes single-row tables
      // to header-only (no body) which is fine to emit as <thead>
      // alone.
      const rows = children.filter((c): c is Nodes & { type: 'tableRow' } =>
        c.type === 'tableRow',
      )
      const [headerRow, ...bodyRows] = rows
      const renderRow = async (
        row: Nodes & { type: 'tableRow' },
        isHeader: boolean,
      ): Promise<string> => {
        const cells = (row.children as Nodes[]).filter(
          (c): c is Nodes & { type: 'tableCell' } => c.type === 'tableCell',
        )
        const cellHtml = await Promise.all(
          cells.map(async (cell, colIdx) => {
            const tag = isHeader ? 'th' : 'td'
            const a = align?.[colIdx]
            const style = a ? ` style={{ textAlign: ${JSON.stringify(a)} }}` : ''
            const inner = await emitChildren(
              cell.children as Nodes[],
              headings,
              opts,
            )
            return `<${tag}${style}>${inner}</${tag}>`
          }),
        )
        return `<tr>${cellHtml.join('')}</tr>`
      }
      const head = headerRow ? `<thead>${await renderRow(headerRow, true)}</thead>` : ''
      const body = bodyRows.length > 0
        ? `<tbody>${(await Promise.all(bodyRows.map((r) => renderRow(r, false)))).join('')}</tbody>`
        : ''
      return `<table>${head}${body}</table>`
    }
    // `tableRow` / `tableCell` are only valid as children of `table`
    // and consumed inside the `table` case above. If the walker hits
    // one standalone (malformed AST), fall through to the default
    // unhandled-node branch so the issue is loud, not silent.
    // ─── PR-H audit M5 — footnotes via remark-gfm ────────────────────
    case 'footnoteReference': {
      // Reference site → `<sup><a id="..." href="#fn-..."> N </a></sup>`
      const { identifier, label } = node as {
        identifier: string
        label?: string
      }
      const display = label ?? identifier
      const id = `fnref-${slugify(identifier)}`
      const href = `#fn-${slugify(identifier)}`
      return `<sup class="footnote-ref"><a id={${JSON.stringify(id)}} href={${JSON.stringify(href)}}>${escapeJsxText(display)}</a></sup>`
    }
    case 'footnoteDefinition': {
      // Definition body → `<li id="fn-...">...<a href="#fnref-..."> ↩ </a></li>`
      // remark-gfm emits these as siblings in the document body; the
      // emit walker outputs them in source order. We wrap each
      // definition individually in <li>; a downstream CSS pass can
      // group them into an <ol class="footnotes"> if desired.
      const { identifier, children } = node as {
        identifier: string
        children: Nodes[]
      }
      const inner = await emitChildren(children, headings, opts)
      const id = `fn-${slugify(identifier)}`
      const back = `#fnref-${slugify(identifier)}`
      return `<li id={${JSON.stringify(id)}} class="footnote-definition">${inner}<a href={${JSON.stringify(back)}} class="footnote-back" aria-label="Back to reference">↩</a></li>`
    }
    default:
      // PR-H audit M16 — unknown node type. Fire the callback so the
      // Vite plugin surfaces a `this.warn(...)` with file context, AND
      // emit a visible HTML comment in the rendered output so the
      // omission is grep-able post-build (JSX braces strip in prod;
      // HTML comments survive). Authors get a signal at BOTH build
      // time (warning) and run time (DOM comment).
      opts.onUnhandledNode?.(node.type)
      return `{${JSON.stringify(`/* zero-content: unhandled mdast node "${node.type}" */`)}}`
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
  const baseSlug = slugify(text)
  // PR-J audit L7 — dedupe slugs by suffixing `-2`, `-3`, ... when a
  // page contains two headings sharing the same slugified text. Both
  // the heading's `id` attribute AND the captured `slug` field land
  // on the deduped value so deep links resolve to the right anchor.
  const usedSlugs = opts._usedSlugs ?? new Set<string>()
  const slug = dedupeSlug(baseSlug, usedSlugs)
  usedSlugs.add(slug)
  // PR-J audit H3 — capture levels 2..6 by default (was h2/h3 only).
  // Authors who needed h4+ in their TOC had no recourse; the
  // hard-coded cap dropped them silently.
  const minLevel = opts.headingsMinLevel ?? 2
  const maxLevel = opts.headingsMaxLevel ?? 6
  if (node.depth >= minLevel && node.depth <= maxLevel) {
    headings.push({ level: node.depth, text, slug })
  }
  const inner = await emitChildren(node.children as Nodes[], headings, opts)
  return `<${tag} id={${JSON.stringify(slug)}}>${inner}</${tag}>`
}

/**
 * PR-J audit L7 — suffix a slug with `-N` (`-2`, `-3`, ...) until it
 * doesn't collide with an entry in `used`. Pure — exported for testing.
 *
 * @internal exported for testing
 */
export function dedupeSlug(base: string, used: Set<string>): string {
  if (base === '' || !used.has(base)) return base
  let n = 2
  while (used.has(`${base}-${n}`)) n++
  return `${base}-${n}`
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

  // PR-H audit M1+M2+M3+M12 — parse the code-fence meta string for
  // line highlights (`{1,3-5}`), line numbers (`showLineNumbers`),
  // copy-button opt-out (`noCopy`), and filename header
  // (`filename="config.ts"`). Unknown tokens are surfaced as compile
  // warnings via the `onUnhandledNode` callback (reused — same
  // surface as the unhandled-mdast warning since both are
  // "author wrote something the pipeline could not interpret").
  const meta = parseCodeFenceMeta(node.meta)
  if (meta.unknown.length > 0 && opts.onUnhandledNode) {
    for (const u of meta.unknown) {
      opts.onUnhandledNode(`code-fence meta token "${u}"`)
    }
  }

  // PR-H audit M3 — total source line count for the copy-button hook.
  // Kept as a raw string literal on the CodeBlock; the component
  // runs `navigator.clipboard.writeText` against it.
  const rawSource = node.value
  // PR-H audit M2 — line count drives the line-number gutter.
  const lineCount = rawSource.length === 0 ? 0 : rawSource.split('\n').length

  // Common props that BOTH the highlighted + plain branches emit so
  // `<CodeBlock>` renders a consistent surface (data-lang, copy, line
  // numbers, highlights, filename).
  const sharedProps =
    ` lang={${JSON.stringify(lang)}}`
    + (meta.filename
      ? ` filename={${JSON.stringify(meta.filename)}}`
      : '')
    + (meta.showLineNumbers ? ` showLineNumbers={true}` : '')
    + (meta.highlightLines.length > 0
      ? ` highlightLines={${JSON.stringify(meta.highlightLines)}}`
      : '')
    + (meta.copyable
      ? ` source={${jsStringLiteral(rawSource)}}`
      : ` copyable={false}`)
    + ` lineCount={${lineCount}}`

  if (opts.highlight) {
    const html = await opts.highlight(rawSource, lang)
    // Embed as inner HTML on a Pyreon component wrapper so the styler /
    // copy-button can attach later. The CodeBlock component is shipped
    // as a built-in (PR 2 components/CodeBlock.tsx).
    //
    // CRITICAL: register `CodeBlock` as a component reference so
    // `compileMarkdown` adds it to the `import { ... } from
    // 'virtual:zero-content/components'` statement at the top of the
    // emitted `.tsx`. Without this, the compiled module references
    // `CodeBlock` as a free name → `ReferenceError: CodeBlock is not
    // defined` at SSG render time. Same applies to anywhere else in
    // emit-jsx that emits a built-in component tag (see `emitMdxJsx`
    // for the MDX-author-driven path, which already calls the
    // callback).
    opts.mdxComponentRef?.('CodeBlock')
    const escaped = jsStringLiteral(html)
    return `<CodeBlock${sharedProps} dangerouslySetInnerHTML={{ __html: ${escaped} }} />`
  }
  // No highlighter — emit through CodeBlock anyway so authoring features
  // (filename header, line numbers, highlights, copy button) are
  // CONSISTENT regardless of whether Shiki is enabled. The pre-formatted
  // code lands as plain `<pre><code>` HTML so the CodeBlock's
  // dangerouslySetInnerHTML hook stays the single render surface.
  // PR-H audit M12 — both branches now ship through the same component,
  // so `data-lang` is emitted in one place and stays consistent.
  opts.mdxComponentRef?.('CodeBlock')
  const plainHtml = `<pre><code>${escapeHtml(rawSource)}</code></pre>`
  const escaped = jsStringLiteral(plainHtml)
  return `<CodeBlock${sharedProps} dangerouslySetInnerHTML={{ __html: ${escaped} }} />`
}

/**
 * HTML escape for the no-highlighter fallback path.
 *
 * Thin re-export of the shared `_shared/html-escape:escapeHtmlText`
 * helper so emit-jsx + remark callout + error-overlay share one impl.
 */
const escapeHtml = escapeHtmlText

async function emitLink(
  node: Link,
  headings: Heading[],
  opts: EmitOptions,
): Promise<string> {
  // PR-F audit H8 — `[foo](./bar.md)` style links rewrite to the
  // route URL via the plugin-supplied resolver. The resolver returns
  // `null` for unrecognised shapes (absolute URLs, mailto:, etc.) so
  // we leave those as-is.
  let href = node.url
  if (opts.resolveInternalLink) {
    const rewritten = opts.resolveInternalLink(href)
    if (rewritten !== null) href = rewritten
  }
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

async function emitMdxJsxElement(
  node: MdxJsxElement,
  headings: Heading[],
  opts: EmitOptions,
): Promise<string> {
  // `name === null` is the JSX fragment `<>...</>` — emit verbatim.
  const name = node.name
  if (name && /^[A-Z]/.test(name) && opts.mdxComponentRef) {
    opts.mdxComponentRef(name)
  }
  const attrs = node.attributes
    .map((attr) => emitMdxAttribute(attr))
    .filter(Boolean)
    .join(' ')
  const attrStr = attrs ? ` ${attrs}` : ''
  if (node.children.length === 0) {
    return name ? `<${name}${attrStr} />` : `<>${attrStr}</>`
  }
  const inner = await emitChildren(node.children as Nodes[], headings, opts)
  return name
    ? `<${name}${attrStr}>${inner}</${name}>`
    : `<>${inner}</>`
}

/**
 * Convert an MDX JSX attribute into its source representation. Three
 * shapes:
 *   - `{...obj}` spread → `mdxJsxExpressionAttribute`
 *   - `name`            → `mdxJsxAttribute` with no value (boolean attr)
 *   - `name="literal"`  → `mdxJsxAttribute` with string value
 *   - `name={expr}`     → `mdxJsxAttribute` with expression value
 */
function emitMdxAttribute(attr: MdxJsxAttribute | MdxJsxExpressionAttribute): string {
  if (attr.type === 'mdxJsxExpressionAttribute') {
    return `{${attr.value}}`
  }
  const name = attr.name
  if (attr.value == null) return name
  if (typeof attr.value === 'string') {
    return `${name}=${JSON.stringify(attr.value)}`
  }
  // Expression attribute — value is `{ type: 'mdxJsxAttributeValueExpression', value: 'expr' }`
  return `${name}={${attr.value.value}}`
}

function emitImage(node: MdastImage, opts: EmitOptions): string {
  // PR-F audit H7 — local images route through zero's <Image>
  // pipeline when the plugin-supplied resolver returns a non-null
  // TSX expression. The default resolver in `plugin.ts` returns
  // `import('./hero.png?optimize')` for `./` / `../` paths; absolute
  // URLs and data URIs return `null` and fall through to `<img>`.
  const src = node.url
  const alt = node.alt ?? ''
  const title = node.title ?? undefined
  const titleAttr = title ? ` title={${JSON.stringify(title)}}` : ''
  if (opts.resolveLocalImage) {
    const expr = opts.resolveLocalImage(src)
    if (expr !== null) {
      return `<Image src={${expr}} alt={${JSON.stringify(alt)}}${titleAttr} />`
    }
  }
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
