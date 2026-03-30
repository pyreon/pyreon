import { sanitizeHref, sanitizeImageSrc } from '../sanitize'
import type { DocChild, DocNode, DocumentRenderer, RenderOptions, TableColumn } from '../types'

/**
 * Slack Block Kit renderer — outputs JSON that can be posted via Slack's API.
 * Maps document nodes to Slack blocks (section, header, divider, image, etc.).
 */

function resolveColumn(col: string | TableColumn): TableColumn {
  return typeof col === 'string' ? { header: col } : col
}

function getTextContent(children: DocChild[]): string {
  return children
    .map((c) => (typeof c === 'string' ? c : getTextContent((c as DocNode).children)))
    .join('')
}

interface SlackBlock {
  type: string
  [key: string]: unknown
}

function mrkdwn(text: string): { type: 'mrkdwn'; text: string } {
  return { type: 'mrkdwn', text }
}

function plainText(text: string): { type: 'plain_text'; text: string } {
  return { type: 'plain_text', text }
}

function nodeToBlocks(node: DocNode): SlackBlock[] {
  const p = node.props
  const blocks: SlackBlock[] = []

  switch (node.type) {
    case 'document':
    case 'page':
    case 'section':
    case 'row':
    case 'column':
      for (const child of node.children) {
        if (typeof child !== 'string') {
          blocks.push(...nodeToBlocks(child))
        }
      }
      break

    case 'heading':
      blocks.push({
        type: 'header',
        text: plainText(getTextContent(node.children)),
      })
      break

    case 'text': {
      let text = getTextContent(node.children)
      if (p.bold) text = `*${text}*`
      if (p.italic) text = `_${text}_`
      if (p.strikethrough) text = `~${text}~`
      blocks.push({
        type: 'section',
        text: mrkdwn(text),
      })
      break
    }

    case 'link': {
      const href = sanitizeHref(p.href as string)
      const text = getTextContent(node.children)
      blocks.push({
        type: 'section',
        text: mrkdwn(`<${href}|${text}>`),
      })
      break
    }

    case 'image': {
      const src = sanitizeImageSrc(p.src as string)
      // Slack only supports public URLs for images
      if (src.startsWith('http')) {
        blocks.push({
          type: 'image',
          image_url: src,
          alt_text: (p.alt as string) ?? 'Image',
          ...(p.caption ? { title: plainText(p.caption as string) } : {}),
        })
      }
      break
    }

    case 'table': {
      const columns = ((p.columns ?? []) as (string | TableColumn)[]).map(resolveColumn)
      const rows = (p.rows ?? []) as (string | number)[][]

      // Slack doesn't have native tables — render as formatted text
      const header = columns.map((c) => `*${c.header}*`).join(' | ')
      const separator = columns.map(() => '---').join(' | ')
      const body = rows.map((row) => row.map((cell) => String(cell ?? '')).join(' | ')).join('\n')

      let text = `${header}\n${separator}\n${body}`
      if (p.caption) text = `_${p.caption}_\n${text}`

      blocks.push({
        type: 'section',
        text: mrkdwn(`\`\`\`\n${text}\n\`\`\``),
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
      blocks.push({
        type: 'section',
        text: mrkdwn(items),
      })
      break
    }

    case 'code': {
      const text = getTextContent(node.children)
      const lang = (p.language as string) ?? ''
      blocks.push({
        type: 'section',
        text: mrkdwn(`\`\`\`${lang}\n${text}\n\`\`\``),
      })
      break
    }

    case 'divider':
    case 'page-break':
      blocks.push({ type: 'divider' })
      break

    case 'spacer':
      // No equivalent in Slack — skip
      break

    case 'button': {
      const href = sanitizeHref(p.href as string)
      const text = getTextContent(node.children)
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: plainText(text),
            url: href,
            style: 'primary',
          },
        ],
      })
      break
    }

    case 'quote': {
      const text = getTextContent(node.children)
      blocks.push({
        type: 'section',
        text: mrkdwn(`> ${text}`),
      })
      break
    }
  }

  return blocks
}

export const slackRenderer: DocumentRenderer = {
  async render(node: DocNode, _options?: RenderOptions): Promise<string> {
    const blocks = nodeToBlocks(node)
    return JSON.stringify({ blocks }, null, 2)
  },
}
