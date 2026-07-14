import type { DocNode, DocumentRenderer, OutputFormat, RenderOptions, RenderResult } from './types'

// ─── Renderer Registry ──────────────────────────────────────────────────────

const renderers = new Map<string, DocumentRenderer | (() => Promise<DocumentRenderer>)>()

/**
 * Register a custom renderer for a format.
 *
 * @example
 * ```ts
 * registerRenderer('thermal', {
 *   render(node, options) {
 *     // Walk nodes → ESC/POS commands
 *     return escPosBuffer
 *   },
 * })
 *
 * await render(receipt, 'thermal')
 * ```
 */
export function registerRenderer(
  format: string,
  renderer: DocumentRenderer | (() => Promise<DocumentRenderer>),
): void {
  renderers.set(format, renderer)
}

/**
 * Remove a registered renderer.
 */
export function unregisterRenderer(format: string): void {
  renderers.delete(format)
}

// ─── Built-in Renderer Loaders ──────────────────────────────────────────────

// Built-in renderers are registered lazily — only loaded when first used.

registerRenderer('html', () => import('./renderers/html').then((m) => m.htmlRenderer))

registerRenderer('email', () => import('./renderers/email').then((m) => m.emailRenderer))

registerRenderer('md', () => import('./renderers/markdown').then((m) => m.markdownRenderer))

registerRenderer('text', () => import('./renderers/text').then((m) => m.textRenderer))

registerRenderer('csv', () => import('./renderers/csv').then((m) => m.csvRenderer))

registerRenderer('pdf', () => import('./renderers/pdf').then((m) => m.pdfRenderer))

registerRenderer('docx', () => import('./renderers/docx').then((m) => m.docxRenderer))

registerRenderer('xlsx', () => import('./renderers/xlsx').then((m) => m.xlsxRenderer))

registerRenderer('pptx', () => import('./renderers/pptx').then((m) => m.pptxRenderer))

registerRenderer('slack', () => import('./renderers/slack').then((m) => m.slackRenderer))

registerRenderer('svg', () => import('./renderers/svg').then((m) => m.svgRenderer))

registerRenderer('teams', () => import('./renderers/teams').then((m) => m.teamsRenderer))

registerRenderer('discord', () => import('./renderers/discord').then((m) => m.discordRenderer))

registerRenderer('telegram', () => import('./renderers/telegram').then((m) => m.telegramRenderer))

registerRenderer('notion', () => import('./renderers/notion').then((m) => m.notionRenderer))

registerRenderer('confluence', () =>
  import('./renderers/confluence').then((m) => m.confluenceRenderer),
)

registerRenderer('whatsapp', () => import('./renderers/whatsapp').then((m) => m.whatsappRenderer))

registerRenderer('google-chat', () =>
  import('./renderers/google-chat').then((m) => m.googleChatRenderer),
)

registerRenderer('json', () => import('./renderers/json').then((m) => m.jsonRenderer))

registerRenderer('jsonl', () => import('./renderers/json').then((m) => m.jsonlRenderer))

// ─── Render Function ────────────────────────────────────────────────────────

async function resolveRenderer(format: string): Promise<DocumentRenderer> {
  const entry = renderers.get(format)
  if (!entry) {
    throw new Error(
      `[@pyreon/document] No renderer registered for format '${format}'. Available: ${[...renderers.keys()].join(', ')}`,
    )
  }

  if (typeof entry === 'function') {
    const renderer = await entry()
    // Cache the resolved renderer so we don't re-import
    renderers.set(format, renderer)
    return renderer
  }

  return entry
}

/**
 * Resolve a possibly-relative image `src` against `baseUrl`. Already-absolute
 * sources (http/https/protocol-relative/`data:`/`blob:`/etc.) are returned
 * unchanged; only sources that can't parse as a standalone URL (i.e. relative
 * paths like `./logo.png`, `logo.png`, `/logo.png`) get resolved.
 */
function resolveAgainstBase(src: string, baseUrl: string): string {
  if (src.length === 0) return src
  try {
    new URL(src) // standalone-parseable → already absolute
    return src
  } catch {
    try {
      return new URL(src, baseUrl).href
    } catch {
      return src // unparseable even with a base → leave untouched
    }
  }
}

/**
 * Walk the node tree and rewrite relative `image` sources against `baseUrl`.
 * Immutable: returns the SAME node reference when nothing changed (so an
 * all-absolute tree, or one with no images, round-trips without allocation).
 */
function applyBaseUrl(node: DocNode, baseUrl: string): DocNode {
  let changed = false
  const children = node.children.map((c) => {
    if (typeof c === 'string') return c
    const next = applyBaseUrl(c, baseUrl)
    if (next !== c) changed = true
    return next
  })
  let props = node.props
  if (node.type === 'image' && typeof node.props.src === 'string') {
    const resolved = resolveAgainstBase(node.props.src, baseUrl)
    if (resolved !== node.props.src) {
      props = { ...node.props, src: resolved }
      changed = true
    }
  }
  return changed ? { ...node, props, children } : node
}

/**
 * Render a document node tree to the specified format.
 *
 * @example
 * ```tsx
 * const doc = <Document title="Report"><Page>...</Page></Document>
 *
 * const html = await render(doc, 'html')    // → HTML string
 * const pdf = await render(doc, 'pdf')      // → PDF Uint8Array
 * const docx = await render(doc, 'docx')    // → DOCX Uint8Array
 * const email = await render(doc, 'email')  // → email-safe HTML string
 * const md = await render(doc, 'md')        // → Markdown string
 * ```
 *
 * When `options.baseUrl` is set, relative image `src` values are resolved
 * against it before rendering — so `<Image src="./logo.png" />` rendered with
 * `{ baseUrl: 'https://cdn.example.com/assets/' }` emits the absolute URL in
 * every output format.
 */
export async function render(
  node: DocNode,
  format: OutputFormat | string,
  options?: RenderOptions,
): Promise<RenderResult> {
  const renderer = await resolveRenderer(format)
  const resolved = options?.baseUrl ? applyBaseUrl(node, options.baseUrl) : node
  return renderer.render(resolved, options)
}

/** @internal For testing — reset renderer registry to defaults. */
export function _resetRenderers(): void {
  renderers.clear()
  // Re-register built-in lazy loaders
  registerRenderer('html', () => import('./renderers/html').then((m) => m.htmlRenderer))
  registerRenderer('email', () => import('./renderers/email').then((m) => m.emailRenderer))
  registerRenderer('md', () => import('./renderers/markdown').then((m) => m.markdownRenderer))
  registerRenderer('text', () => import('./renderers/text').then((m) => m.textRenderer))
  registerRenderer('csv', () => import('./renderers/csv').then((m) => m.csvRenderer))
  registerRenderer('pdf', () => import('./renderers/pdf').then((m) => m.pdfRenderer))
  registerRenderer('docx', () => import('./renderers/docx').then((m) => m.docxRenderer))
  registerRenderer('xlsx', () => import('./renderers/xlsx').then((m) => m.xlsxRenderer))
  registerRenderer('pptx', () => import('./renderers/pptx').then((m) => m.pptxRenderer))
  registerRenderer('slack', () => import('./renderers/slack').then((m) => m.slackRenderer))
  registerRenderer('svg', () => import('./renderers/svg').then((m) => m.svgRenderer))
  registerRenderer('teams', () => import('./renderers/teams').then((m) => m.teamsRenderer))
  registerRenderer('discord', () => import('./renderers/discord').then((m) => m.discordRenderer))
  registerRenderer('telegram', () => import('./renderers/telegram').then((m) => m.telegramRenderer))
  registerRenderer('notion', () => import('./renderers/notion').then((m) => m.notionRenderer))
  registerRenderer('confluence', () =>
    import('./renderers/confluence').then((m) => m.confluenceRenderer),
  )
  registerRenderer('whatsapp', () => import('./renderers/whatsapp').then((m) => m.whatsappRenderer))
  registerRenderer('google-chat', () =>
    import('./renderers/google-chat').then((m) => m.googleChatRenderer),
  )
  registerRenderer('json', () => import('./renderers/json').then((m) => m.jsonRenderer))
  registerRenderer('jsonl', () => import('./renderers/json').then((m) => m.jsonlRenderer))
}
