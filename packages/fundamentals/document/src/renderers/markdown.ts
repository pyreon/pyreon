import { sanitizeHref, sanitizeImageSrc } from '../sanitize'
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
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>')
}

function renderChild(child: DocChild): string {
  if (typeof child === 'string') return child
  return renderNode(child)
}

function renderChildren(children: DocChild[]): string {
  return children.map(renderChild).join('')
}

function renderInline(children: DocChild[]): string {
  return children.map(renderChild).join('')
}

/**
 * Escape a string for safe inclusion in YAML frontmatter as a
 * double-quoted scalar. Backslashes and double-quotes need
 * escaping; other characters pass through.
 */
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
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
      return `[${renderInline(node.children)}](${sanitizeHref(p.href as string)})`

    case 'image': {
      const alt = (p.alt as string) ?? ''
      let md = `![${alt}](${sanitizeImageSrc(p.src as string)})`
      if (p.caption) md += `\n*${p.caption}*`
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
      if (p.caption) md = `*${p.caption}*\n\n${md}`
      return md
    }

    case 'list':
      return `${renderList(node, '')}\n\n`

    case 'list-item':
      return renderInline(node.children)

    case 'code': {
      const lang = (p.language as string) ?? ''
      const content = renderInline(node.children)
      return `\`\`\`${lang}\n${content}\n\`\`\`\n\n`
    }

    case 'divider':
      return '---\n\n'

    case 'page-break':
      return '---\n\n'

    case 'spacer':
      return '\n'

    case 'button':
      return `[${renderInline(node.children)}](${sanitizeHref(p.href as string)})\n\n`

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
