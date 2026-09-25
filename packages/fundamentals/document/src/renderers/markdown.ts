import {
  longestBacktickRun,
  markdownLinkDestination,
  sanitizeCodeLanguage,
  sanitizeHref,
  sanitizeImageSrc,
} from '../sanitize'
import { getTextContent } from '../nodes'
import type { DocChild, DocNode, DocumentRenderer, RenderOptions, TableColumn } from '../types'

function resolveColumn(col: string | TableColumn): TableColumn {
  return typeof col === 'string' ? { header: col } : col
}

/**
 * Escape a value for a GFM table cell. A raw `|` splits the cell — corrupting
 * the whole column structure (N pipes in a 1-column cell = N+1 apparent
 * columns) — and a newline breaks the row onto its own line, producing a
 * malformed table. Escape `\` → `\\` and `|` → `\|` (backslash first, so an
 * author-supplied `\|` survives), and collapse newlines to the GFM in-cell
 * line break `<br>` (the only line break a table cell supports).
 */
function mdTableCell(value: string): string {
  // Escape FIRST (covers `\`, `|`, raw HTML), then insert the only markup
  // we emit ourselves — the `<br>` line break.
  return mdEscapeInline(value).replace(/\r\n|\r|\n/g, '<br>')
}

/**
 * Escape user text for inline Markdown. Every ASCII character that can
 * open markup mid-line gets a CommonMark backslash escape: emphasis
 * (`*` `_` `~`), code spans (`` ` ``), links/images (`[` `]`), raw HTML and
 * autolinks (`<` `>`), entity references (`&`), table pipes (`|`), and the
 * escape character itself. Without it `<img src=x onerror=…>` in a
 * paragraph is live HTML in every renderer that allows it (GitHub strips
 * it; many static-site pipelines do not).
 */
function mdEscapeInline(text: string): string {
  return text.replace(/[\\`*_~[\]<>&|]/g, '\\$&')
}

/**
 * {@link mdEscapeInline} plus the BLOCK-level markers that only matter at
 * the start of a line: ATX headings, block quotes, list bullets, ordered
 * list numbers, setext underlines / thematic breaks, and indented code.
 */
function mdEscapeText(text: string): string {
  return mdEscapeInline(text)
    .split('\n')
    .map((line) =>
      line
        .replace(/^(\s*)([#>+=-])/, '$1\\$2')
        .replace(/^(\s*\d+)([.)])/, '$1\\$2')
        .replace(/^ {4,}/, (sp) => sp.slice(0, 3)),
    )
    .join('\n')
}

/** `[label](dest)`, or the plain escaped label when the href was rejected. */
function mdLink(label: string, href: string): string {
  return href ? `[${label}](${markdownLinkDestination(href)})` : label
}

function renderChild(child: DocChild): string {
  if (typeof child === 'string') return mdEscapeText(child)
  return renderNode(child)
}

function renderChildren(children: DocChild[]): string {
  let acc = ''
  for (const c of children) acc += renderChild(c)
  return acc
}

function renderInline(children: DocChild[]): string {
  let acc = ''
  for (const c of children) acc += renderChild(c)
  return acc
}

/**
 * Escape a string for safe inclusion in YAML frontmatter as a
 * double-quoted scalar. Backslashes and double-quotes need
 * escaping; other characters pass through.
 */
function yamlString(value: string): string {
  // Line breaks are escaped too: a raw newline followed by `---` would end
  // the frontmatter block early in the line-splitting parsers most static-
  // site generators use.
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')}"`
}

/**
 * Render a list with correct GFM nesting. A nested `<List>` inside a
 * `<ListItem>` must be indented to the CONTENT COLUMN of its parent item
 * (CommonMark/GFM: `- ` → 2 spaces, `1. ` → 3 spaces) — the previous
 * inline rendering emitted nested items as top-level `- ` lines mid-list,
 * producing malformed GFM (the nested list broke the parent list apart).
 * Each item's nested lists are split out from its inline content and
 * rendered on their own indented lines; the indent ACCUMULATES per level
 * from the parent marker's width, so deep nesting stays content-aligned.
 */
function renderList(node: DocNode, indent: string): string {
  const ordered = node.props.ordered as boolean | undefined
  return node.children
    .filter((c): c is DocNode => typeof c !== 'string')
    .map((item, i) => {
      const prefix = ordered ? `${i + 1}.` : '-'
      const nestedLists = item.children.filter(
        (c): c is DocNode => typeof c !== 'string' && c.type === 'list',
      )
      const inlineChildren = item.children.filter(
        (c) => typeof c === 'string' || c.type !== 'list',
      )
      let line = `${indent}${prefix} ${renderInline(inlineChildren)}`
      // Content column of THIS item = indent + marker + one space
      const childIndent = indent + ' '.repeat(prefix.length + 1)
      for (const sub of nestedLists) {
        line += `\n${renderList(sub, childIndent)}`
      }
      return line
    })
    .join('\n')
}

function renderNode(node: DocNode): string {
  const p = node.props

  switch (node.type) {
    case 'document': {
      // Document metadata is populated from DocDocument's
      // _documentProps via extractDocumentTree.
      // Markdown has no native metadata format, but YAML
      // frontmatter is the convention used by Jekyll, Hugo,
      // Astro, MDX, Pandoc, etc. — emit it when ANY metadata
      // field is present, omit the frontmatter block entirely
      // when none are present (so plain documents stay clean).
      const title = p.title as string | undefined
      const author = p.author as string | undefined
      const subject = p.subject as string | undefined

      if (title || author || subject) {
        const lines: string[] = ['---']
        if (title) lines.push(`title: ${yamlString(title)}`)
        if (author) lines.push(`author: ${yamlString(author)}`)
        if (subject) lines.push(`description: ${yamlString(subject)}`)
        lines.push('---', '')
        return lines.join('\n') + renderChildren(node.children)
      }

      return renderChildren(node.children)
    }

    case 'page':
      return renderChildren(node.children)

    case 'section':
      return `${renderChildren(node.children)}\n`

    case 'row':
    case 'column':
      return renderChildren(node.children)

    case 'heading': {
      const level = (p.level as number) ?? 1
      const prefix = '#'.repeat(Math.min(Math.max(level, 1), 6))
      return `${prefix} ${renderInline(node.children)}\n\n`
    }

    case 'text': {
      let text = renderInline(node.children)
      if (p.bold) text = `**${text}**`
      if (p.italic) text = `*${text}*`
      if (p.strikethrough) text = `~~${text}~~`
      return `${text}\n\n`
    }

    case 'link':
      return mdLink(renderInline(node.children), sanitizeHref(p.href as string))

    case 'image': {
      const alt = mdEscapeInline((p.alt as string) ?? '')
      const src = sanitizeImageSrc(p.src as string)
      let md = src ? `![${alt}](${markdownLinkDestination(src)})` : alt
      if (p.caption) md += `\n*${mdEscapeInline(String(p.caption))}*`
      return `${md}\n\n`
    }

    case 'table': {
      const columns = ((p.columns ?? []) as (string | TableColumn)[]).map(resolveColumn)
      const rows = (p.rows ?? []) as (string | number)[][]

      if (columns.length === 0) return ''

      // Header
      const header = `| ${columns.map((c) => mdTableCell(c.header)).join(' | ')} |`

      // Separator with alignment
      const separator = `| ${columns
        .map((c) => {
          const align = c.align ?? 'left'
          if (align === 'center') return ':---:'
          if (align === 'right') return '---:'
          return '---'
        })
        .join(' | ')} |`

      // Rows
      const body = rows
        .map((row) => `| ${row.map((cell) => mdTableCell(String(cell ?? ''))).join(' | ')} |`)
        .join('\n')

      let md = `${header}\n${separator}\n${body}\n\n`
      if (p.caption) md = `*${mdEscapeInline(String(p.caption))}*\n\n${md}`
      return md
    }

    case 'list':
      return `${renderList(node, '')}\n\n`

    case 'list-item':
      return renderInline(node.children)

    case 'code': {
      const lang = sanitizeCodeLanguage(p.language as string | undefined)
      // Verbatim content (NOT escaped); the fence is made longer than the
      // longest backtick run inside it so the content cannot close it.
      const content = getTextContent(node.children)
      const fence = '`'.repeat(Math.max(3, longestBacktickRun(content) + 1))
      return `${fence}${lang}\n${content}\n${fence}\n\n`
    }

    case 'divider':
      return '---\n\n'

    case 'page-break':
      return '---\n\n'

    case 'spacer':
      return '\n'

    case 'button':
      return `${mdLink(renderInline(node.children), sanitizeHref(p.href as string))}\n\n`

    case 'quote':
      return `> ${renderInline(node.children)}\n\n`

    default:
      return renderChildren(node.children)
  }
}

export const markdownRenderer: DocumentRenderer = {
  async render(node: DocNode, _options?: RenderOptions): Promise<string> {
    return `${renderNode(node).trim()}\n`
  },
}
