import { sanitizeHref } from "../sanitize"
import type { DocChild, DocNode, DocumentRenderer, RenderOptions, TableColumn } from "../types"

/**
 * WhatsApp renderer — outputs formatted text using WhatsApp's markup.
 * WhatsApp supports: *bold*, _italic_, ~strikethrough~, ```code```, > quote
 */

function resolveColumn(col: string | TableColumn): TableColumn {
  return typeof col === "string" ? { header: col } : col
}

function getTextContent(children: DocChild[]): string {
  return children
    .map((c) => (typeof c === "string" ? c : getTextContent((c as DocNode).children)))
    .join("")
}

function renderNode(node: DocNode): string {
  const p = node.props

  switch (node.type) {
    case "document":
    case "page":
    case "section":
    case "row":
    case "column":
      return node.children.map((c) => (typeof c === "string" ? c : renderNode(c))).join("")

    case "heading": {
      const text = getTextContent(node.children)
      return `*${text}*\n\n`
    }

    case "text": {
      let text = getTextContent(node.children)
      if (p.bold) text = `*${text}*`
      if (p.italic) text = `_${text}_`
      if (p.strikethrough) text = `~${text}~`
      return `${text}\n\n`
    }

    case "link": {
      const href = sanitizeHref(p.href as string)
      const text = getTextContent(node.children)
      return `${text}: ${href}\n\n`
    }

    case "image":
      // WhatsApp doesn't support inline images in text
      return ""

    case "table": {
      const columns = ((p.columns ?? []) as (string | TableColumn)[]).map(resolveColumn)
      const rows = (p.rows ?? []) as (string | number)[][]

      const header = columns.map((c) => `*${c.header}*`).join(" | ")
      const body = rows.map((row) => row.map((c) => String(c ?? "")).join(" | ")).join("\n")

      let result = `${header}\n${body}\n\n`
      if (p.caption) result = `_${p.caption}_\n${result}`
      return result
    }

    case "list": {
      const ordered = p.ordered as boolean | undefined
      return `${node.children
        .filter((c): c is DocNode => typeof c !== "string")
        .map((item, i) => {
          const prefix = ordered ? `${i + 1}.` : "•"
          return `${prefix} ${getTextContent(item.children)}`
        })
        .join("\n")}\n\n`
    }

    case "code": {
      const text = getTextContent(node.children)
      return `\`\`\`${text}\`\`\`\n\n`
    }

    case "divider":
    case "page-break":
      return "───────────\n\n"

    case "spacer":
      return "\n"

    case "button": {
      const href = sanitizeHref(p.href as string)
      const text = getTextContent(node.children)
      return `*${text}*: ${href}\n\n`
    }

    case "quote": {
      const text = getTextContent(node.children)
      return `> ${text}\n\n`
    }

    default:
      return ""
  }
}

export const whatsappRenderer: DocumentRenderer = {
  async render(node: DocNode, _options?: RenderOptions): Promise<string> {
    return renderNode(node).trim()
  },
}
