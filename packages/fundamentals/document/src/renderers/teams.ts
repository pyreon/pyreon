import { sanitizeHref, sanitizeImageSrc } from '../sanitize'
import type { DocChild, DocNode, DocumentRenderer, RenderOptions, TableColumn } from '../types'

/**
 * Microsoft Teams renderer — outputs Adaptive Cards JSON.
 * Can be posted via Teams Webhooks, Bot Framework, or Power Automate.
 */

function resolveColumn(col: string | TableColumn): TableColumn {
  return typeof col === 'string' ? { header: col } : col
}

function getTextContent(children: DocChild[]): string {
  return children
    .map((c) => (typeof c === 'string' ? c : getTextContent((c as DocNode).children)))
    .join('')
}

interface AdaptiveElement {
  type: string
  [key: string]: unknown
}

function nodeToElements(node: DocNode): AdaptiveElement[] {
  const p = node.props
  const elements: AdaptiveElement[] = []

  switch (node.type) {
    case 'document':
    case 'page':
    case 'section':
    case 'row':
    case 'column':
      for (const child of node.children) {
        if (typeof child !== 'string') {
          elements.push(...nodeToElements(child))
        }
      }
      break

    case 'heading': {
      const level = (p.level as number) ?? 1
      const sizeMap: Record<number, string> = {
        1: 'extraLarge',
        2: 'large',
        3: 'medium',
        4: 'default',
        5: 'small',
        6: 'small',
      }
      elements.push({
        type: 'TextBlock',
        text: getTextContent(node.children),
        size: sizeMap[level] ?? 'large',
        weight: 'bolder',
        wrap: true,
      })
      break
    }

    case 'text': {
      let text = getTextContent(node.children)
      if (p.bold) text = `**${text}**`
      if (p.italic) text = `_${text}_`
      if (p.strikethrough) text = `~~${text}~~`
      elements.push({
        type: 'TextBlock',
        text,
        wrap: true,
        ...(p.color ? { color: 'default' } : {}),
        ...(p.size ? { size: (p.size as number) >= 18 ? 'large' : 'default' } : {}),
      })
      break
    }

    case 'link': {
      const href = sanitizeHref(p.href as string)
      const text = getTextContent(node.children)
      elements.push({
        type: 'TextBlock',
        text: `[${text}](${href})`,
        wrap: true,
      })
      break
    }

    case 'image': {
      const src = sanitizeImageSrc(p.src as string)
      if (src.startsWith('http')) {
        elements.push({
          type: 'Image',
          url: src,
          altText: (p.alt as string) ?? 'Image',
          size: 'large',
        })
      }
      break
    }

    case 'table': {
      const columns = ((p.columns ?? []) as (string | TableColumn)[]).map(resolveColumn)
      const rows = (p.rows ?? []) as (string | number)[][]

      // Adaptive Cards have native Table support (schema 1.5+)
      const tableColumns = columns.map((col) => ({
        type: 'Column',
        width: 'stretch',
        items: [
          {
            type: 'TextBlock',
            text: `**${col.header}**`,
            weight: 'bolder',
            wrap: true,
          },
          ...rows.map((row, i) => ({
            type: 'TextBlock',
            text: String(row[columns.indexOf(col)] ?? ''),
            wrap: true,
            separator: i === 0,
          })),
        ],
      }))

      elements.push({
        type: 'ColumnSet',
        columns: tableColumns,
      })
      break
    }

    case 'list': {
      const ordered = p.ordered as boolean | undefined
      const items = node.children
        .filter((c): c is DocNode => typeof c !== 'string')
        .map((item, i) => {
          const prefix = ordered ? `${i + 1}.` : '•'
          return `${prefix} ${getTextContent(item.children)}`
        })
        .join('\n')
      elements.push({
        type: 'TextBlock',
        text: items,
        wrap: true,
      })
      break
    }

    case 'code': {
      const text = getTextContent(node.children)
      elements.push({
        type: 'TextBlock',
        text: `\`\`\`\n${text}\n\`\`\``,
        fontType: 'monospace',
        wrap: true,
      })
      break
    }

    case 'divider':
    case 'page-break':
      elements.push({
        type: 'TextBlock',
        text: ' ',
        separator: true,
      })
      break

    case 'spacer':
      elements.push({
        type: 'TextBlock',
        text: ' ',
        spacing: 'large',
      })
      break

    case 'button': {
      elements.push({
        type: 'ActionSet',
        actions: [
          {
            type: 'Action.OpenUrl',
            title: getTextContent(node.children),
            url: sanitizeHref(p.href as string),
            style: 'positive',
          },
        ],
      })
      break
    }

    case 'quote': {
      const text = getTextContent(node.children)
      elements.push({
        type: 'Container',
        style: 'emphasis',
        items: [
          {
            type: 'TextBlock',
            text: `_${text}_`,
            wrap: true,
            isSubtle: true,
          },
        ],
      })
      break
    }
  }

  return elements
}

export const teamsRenderer: DocumentRenderer = {
  async render(node: DocNode, _options?: RenderOptions): Promise<string> {
    const body = nodeToElements(node)
    const card = {
      type: 'AdaptiveCard',
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      version: '1.5',
      body,
    }
    return JSON.stringify(card, null, 2)
  },
}
