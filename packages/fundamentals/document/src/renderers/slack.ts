import { sanitizeHref, sanitizeImageSrc } from '../sanitize'
import type { DocNode, DocumentRenderer, RenderOptions, TableColumn } from '../types'
import { getTextContent, imagePlaceholderText, warnUnknownNodeType } from '../nodes'

/**
 * Slack Block Kit renderer — outputs JSON that can be posted via Slack's API.
 * Maps document nodes to Slack blocks (section, header, divider, image, etc.).
 */

function resolveColumn(col: string | TableColumn): TableColumn {
  return typeof col === 'string' ? { header: col } : col
}

interface SlackBlock {
  type: string
  [key: string]: unknown
}

/**
 * Slack's documented mandatory escaping for mrkdwn text: `& < >` must be
 * HTML-entity-encoded in every text object. Without it a literal `<` in
 * user text is parsed as Slack markup — `<https://evil|label>` injects a
 * fake link and `<!channel>` pings the whole channel. These THREE are the
 * only characters Slack's API contract escapes; mrkdwn has NO escape
 * syntax for the formatting toggles (`*` `_` `~`) — a documented platform
 * limitation. plain_text fields are rendered verbatim and must NOT be
 * entity-encoded.
 */
function mrkdwnEscape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
      let text = mrkdwnEscape(getTextContent(node.children))
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
      // The LABEL is user text inside Slack's own <url|label> syntax — a
      // literal `|` or `>` in it would terminate the link early.
      const text = mrkdwnEscape(getTextContent(node.children))
      blocks.push({
        type: 'section',
        text: mrkdwn(`<${href}|${text}>`),
      })
      break
    }

    case 'image': {
      const src = sanitizeImageSrc(p.src as string)
      // Slack only supports public URLs for images. A data: URI (the
      // shape `createDocument().chart()` embeds) cannot be posted — emit
      // the alt/caption as fallback TEXT instead of silently dropping
      // (pre-fix: a report's chart vanished from the message with zero
      // signal).
      if (src.startsWith('http')) {
        blocks.push({
          type: 'image',
          image_url: src,
          alt_text: (p.alt as string) ?? 'Image',
          ...(p.caption ? { title: plainText(p.caption as string) } : {}),
        })
      } else {
        blocks.push({
          type: 'section',
          text: mrkdwn(`_${mrkdwnEscape(imagePlaceholderText(p))}_`),
        })
      }
      break
    }

    case 'table': {
      const columns = ((p.columns ?? []) as (string | TableColumn)[]).map(resolveColumn)
      const rows = (p.rows ?? []) as (string | number)[][]

      // Slack doesn't have native tables — render as formatted text.
      // Cell/caption content is user text → escape (code blocks still
      // honor entities in mrkdwn).
      const header = columns.map((c) => `*${mrkdwnEscape(c.header)}*`).join(' | ')
      const separator = columns.map(() => '---').join(' | ')
      const body = rows
        .map((row) => row.map((cell) => mrkdwnEscape(String(cell ?? ''))).join(' | '))
        .join('\n')

      let text = `${header}\n${separator}\n${body}`
      if (p.caption) text = `_${mrkdwnEscape(p.caption as string)}_\n${text}`

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
          return `${prefix} ${mrkdwnEscape(getTextContent(item.children))}`
        })
        .join('\n')
      blocks.push({
        type: 'section',
        text: mrkdwn(items),
      })
      break
    }

    // An orphan list-item (outside a <List>) degrades to its text content
    // instead of silently dropping.
    case 'list-item':
      blocks.push({
        type: 'section',
        text: mrkdwn(mrkdwnEscape(getTextContent(node.children))),
      })
      break

    case 'code': {
      const text = mrkdwnEscape(getTextContent(node.children))
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
      // No Block Kit equivalent — documented skip.
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
      const text = mrkdwnEscape(getTextContent(node.children))
      blocks.push({
        type: 'section',
        text: mrkdwn(`> ${text}`),
      })
      break
    }

    default:
      // A future NodeType must never silently drop — dev-warn by name.
      warnUnknownNodeType('slack', node.type)
      break
  }

  return blocks
}

export const slackRenderer: DocumentRenderer = {
  async render(node: DocNode, _options?: RenderOptions): Promise<string> {
    const blocks = nodeToBlocks(node)
    return JSON.stringify({ blocks }, null, 2)
  },
}
