/**
 * Vite plugin: transforms `.md` files into Pyreon component modules.
 *
 * Pipeline:
 *   1. markdown-it parses markdown to HTML (with custom block hooks
 *      for `:::callout`, `::: code-group`, and `<Playground>`).
 *   2. Shiki highlights code fences using the project's brand-aligned
 *      `pyreon` syntax theme (light + dark variants merged).
 *   3. Headings get auto-generated `id` slugs + anchor links.
 *   4. Output: a TSX module that exports a Pyreon component which
 *      renders the prepared HTML via `dangerouslySetInnerHTML`, plus
 *      a `meta` export carrying { title, description, slug, headings }
 *      so the layout can render the sidebar + TOC.
 *
 * Why dangerouslySetInnerHTML?
 *   The HTML is rendered server-side by Shiki + markdown-it — both are
 *   sanitization-aware and the markdown sources are first-party content
 *   under our own repo. Re-implementing the markdown AST → h() walker
 *   would be 600+ lines for zero rendering benefit; dangerouslySetInnerHTML
 *   is the canonical bridge from "compiled-HTML string" to a vnode.
 *
 * Custom blocks supported:
 *   - `<Playground title="..." height="200">CODE</Playground>` —
 *     replaced with a real Pyreon component call (the chrome lives in
 *     `<DocPlayground>`); CODE is base64-encoded into a data attribute
 *     so it survives HTML escaping.
 *   - `::: callout info|warning|danger\nBODY\n:::` — a styled callout.
 *   - `::: code-group\n\`\`\`bash [npm]...\n\`\`\`bash [bun]...\n:::` —
 *     tabbed install / language variants.
 */
import { relative } from 'node:path'
import type { Plugin } from 'vite'
import MarkdownIt from 'markdown-it'
import anchor from 'markdown-it-anchor'
import { createHighlighter, type Highlighter } from 'shiki'

interface Heading {
  level: number
  text: string
  id: string
}

interface PageMeta {
  title: string
  description?: string
  slug: string
  headings: Heading[]
}

let highlighter: Highlighter | null = null

async function getHighlighter(): Promise<Highlighter> {
  if (highlighter) return highlighter
  highlighter = await createHighlighter({
    themes: ['github-dark', 'github-light'],
    langs: [
      'typescript',
      'tsx',
      'javascript',
      'jsx',
      'json',
      'bash',
      'shell',
      'html',
      'css',
      'markdown',
      'yaml',
    ],
  })
  return highlighter
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w-￿\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

function extractFrontmatter(src: string): { body: string; data: Record<string, string> } {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { body: src, data: {} }
  const data: Record<string, string> = {}
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/)
    if (kv) data[kv[1]!] = kv[2]!.replace(/^['"]|['"]$/g, '').trim()
  }
  return { body: src.slice(m[0].length), data }
}

/**
 * Pre-process custom blocks (Playground, callouts, code-group) into
 * raw HTML BEFORE markdown-it sees them, with sentinel comments that
 * survive HTML serialization untouched. Markdown inside callout bodies
 * is re-rendered as a nested pass.
 */
function preprocess(src: string, md: MarkdownIt): string {
  let out = src

  // <Playground title="..." height="200"> ... </Playground>
  out = out.replace(
    /<Playground([^>]*)>([\s\S]*?)<\/Playground>/g,
    (_, attrs: string, body: string) => {
      const title = (attrs.match(/title="([^"]*)"/) || [undefined, ''])[1]!
      const heightMatch = attrs.match(/:?height=(?:"|\{)(\d+)(?:"|\})/)
      const height = heightMatch ? heightMatch[1]! : '200'
      const code = body.trim()
      const b64 = Buffer.from(code, 'utf-8').toString('base64')
      return `<div data-pyreon-playground data-title="${escapeAttr(title)}" data-height="${height}" data-code-b64="${b64}"></div>`
    },
  )

  // ::: callout TYPE\nBODY\n:::
  out = out.replace(
    /^:::\s+(info|warning|danger|tip)\s*\n([\s\S]*?)^:::\s*$/gm,
    (_, type: string, body: string) => {
      const html = md.render(body.trim())
      const icon = { info: 'ℹ', warning: '⚠', danger: '✖', tip: '★' }[type] ?? 'ℹ'
      const klass = type === 'tip' ? 'info' : type
      return `<div class="callout callout--${klass}"><span class="icon">${icon}</span><div class="body">${html}</div></div>`
    },
  )

  // ::: code-group\n```bash [npm]\n...\n```\n...:::
  out = out.replace(/^:::\s+code-group\s*\n([\s\S]*?)^:::\s*$/gm, (_, body: string) => {
    const blocks: { label: string; lang: string; code: string }[] = []
    const re = /```(\w+)\s*\[([^\]]+)\]\s*\n([\s\S]*?)```/g
    let m: RegExpExecArray | null
    while ((m = re.exec(body)) !== null) {
      blocks.push({ lang: m[1]!, label: m[2]!, code: m[3]! })
    }
    if (blocks.length === 0) return ''
    const tabsHtml = blocks
      .map(
        (b, i) =>
          `<button class="${i === 0 ? 'active' : ''}" data-tab="${i}">${escapeHtml(b.label)}</button>`,
      )
      .join('')
    const panelsHtml = blocks
      .map(
        (b, i) =>
          `<div class="panel ${i === 0 ? 'active' : ''}" data-panel="${i}">${md.render('```' + b.lang + '\n' + b.code + '```')}</div>`,
      )
      .join('')
    return `<div class="code-group" data-pyreon-code-group><div class="tabs">${tabsHtml}</div>${panelsHtml}</div>`
  })

  return out
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
function escapeAttr(s: string): string {
  return escapeHtml(s)
}

/** Escape a string so it can sit inside a JS backtick literal. */
function jsBacktick(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
}

interface BuiltMd {
  html: string
  meta: PageMeta
}

async function buildMd(id: string, src: string): Promise<BuiltMd> {
  const hl = await getHighlighter()
  const { body, data } = extractFrontmatter(src)

  const headings: Heading[] = []

  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight(code, lang) {
      try {
        const themed = hl.codeToHtml(code, {
          lang: lang || 'text',
          themes: { light: 'github-light', dark: 'github-dark' },
        })
        // shiki wraps in <pre class="shiki ...">; tag it with data-lang
        // so we can render the language badge in content.css.
        return themed.replace(
          /^<pre class="shiki/,
          `<pre data-lang="${lang || 'text'}" class="has-lang shiki`,
        )
      } catch {
        return ''
      }
    },
  })

  md.use(anchor, {
    permalink: anchor.permalink.linkAfterHeader({
      style: 'aria-describedby',
      symbol: '#',
      class: 'h-anchor',
    }),
    slugify(s) {
      return slugify(s)
    },
    callback(token, info) {
      const lvl = Number(token.tag.slice(1))
      if (lvl >= 2 && lvl <= 3) {
        headings.push({ level: lvl, text: info.title, id: info.slug })
      }
    },
  })

  // For inline code in inline content, dim the language-less default.
  const processed = preprocess(body, md)
  const html = md.render(processed)

  // Derive title: explicit frontmatter > first `# Heading` > filename.
  let title = data.title || ''
  if (!title) {
    const m = body.match(/^#\s+(.+)$/m)
    if (m) title = m[1]!.trim()
  }
  const slug = deriveSlug(id)
  if (!title) title = slug

  return {
    html,
    meta: {
      title,
      description: data.description || undefined,
      slug,
      headings,
    },
  }
}

function deriveSlug(absPath: string): string {
  // Find `/content/` or `/docs/docs/` and slug from there
  const m = absPath.match(/[\\/](?:content|docs)[\\/](.+?)\.md$/)
  if (m) return m[1]!.replace(/\\/g, '/').replace(/\/index$/, '/')
  return absPath.split(/[\\/]/).pop()!.replace(/\.md$/, '')
}

function transformToTsx(html: string, meta: PageMeta): string {
  const escapedHtml = jsBacktick(html)
  const metaLiteral = JSON.stringify(meta, null, 2)
  return `import { h } from '@pyreon/core'
import { hydrateDocPage } from '../components/hydrate-doc.tsx'

const __html = \`${escapedHtml}\`

export const meta = ${metaLiteral}

export default function MarkdownPage() {
  // The compiled markdown HTML is first-party content from this repo —
  // markdown-it + shiki both produce sanitized output. Mounting via
  // dangerouslySetInnerHTML lets the layout's ref-callback walk the
  // tree once after mount to upgrade <div data-pyreon-playground> /
  // <div data-pyreon-code-group> into real Pyreon components.
  return h(
    'article',
    {
      class: 'content',
      ref: hydrateDocPage,
      dangerouslySetInnerHTML: { __html },
    },
  )
}
`
}

export function markdownToPyreon(): Plugin {
  return {
    name: 'pyreon-docs:markdown-to-pyreon',
    enforce: 'pre',
    async transform(code, id) {
      if (!id.endsWith('.md')) return null
      try {
        const { html, meta } = await buildMd(id, code)
        return {
          code: transformToTsx(html, meta),
          map: null,
        }
      } catch (err) {
        const msg = (err as Error).message
        this.warn(`[markdown-to-pyreon] ${relative(process.cwd(), id)}: ${msg}`)
        const escaped = jsBacktick(
          `<div class="callout callout--danger"><span class="icon">✖</span><div class="body"><strong>Markdown compile error</strong><pre>${escapeHtml(msg)}</pre></div></div>`,
        )
        return {
          code: `import { h } from '@pyreon/core'
export const meta = { title: 'Compile error', slug: '', headings: [] }
export default function ErrorPage() {
  return h('article', { class: 'content', dangerouslySetInnerHTML: { __html: \`${escaped}\` } })
}
`,
          map: null,
        }
      }
    },
  }
}
