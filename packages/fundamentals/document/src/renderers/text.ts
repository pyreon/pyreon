import type { DocChild, DocNode, DocumentRenderer, RenderOptions, TableColumn } from "../types"

function resolveColumn(col: string | TableColumn): TableColumn {
  return typeof col === "string" ? { header: col } : col
}

function renderChild(child: DocChild): string {
  if (typeof child === "string") return child
  return renderNode(child)
}

function renderChildren(children: DocChild[]): string {
  return children.map(renderChild).join("")
}

function pad(str: string, width: number, align: "left" | "center" | "right" = "left"): string {
  if (str.length >= width) return str.slice(0, width)
  const diff = width - str.length
  if (align === "center") {
    const left = Math.floor(diff / 2)
    return " ".repeat(left) + str + " ".repeat(diff - left)
  }
  if (align === "right") return " ".repeat(diff) + str
  return str + " ".repeat(diff)
}

function renderNode(node: DocNode): string {
  const p = node.props

  switch (node.type) {
    case "document":
      return renderChildren(node.children)

    case "page":
      return renderChildren(node.children)

    case "section":
    case "row":
    case "column":
      return renderChildren(node.children)

    case "heading": {
      const text = renderChildren(node.children)
      const level = (p.level as number) ?? 1
      if (level === 1) return `${text.toUpperCase()}\n${"=".repeat(text.length)}\n\n`
      if (level === 2) return `${text}\n${"-".repeat(text.length)}\n\n`
      return `${text}\n\n`
    }

    case "text":
      return `${renderChildren(node.children)}\n\n`

    case "link":
      return `${renderChildren(node.children)} (${p.href})`

    case "image": {
      const alt = (p.alt as string) ?? "Image"
      const caption = p.caption ? ` — ${p.caption}` : ""
      return `[${alt}${caption}]\n\n`
    }

    case "table": {
      const columns = ((p.columns ?? []) as (string | TableColumn)[]).map(resolveColumn)
      const rows = (p.rows ?? []) as (string | number)[][]

      if (columns.length === 0) return ""

      // Calculate column widths
      const widths = columns.map((col, i) => {
        const headerLen = col.header.length
        const maxDataLen = rows.reduce((max, row) => Math.max(max, String(row[i] ?? "").length), 0)
        return Math.max(headerLen, maxDataLen, 3)
      })

      // Header
      const header = columns.map((col, i) => pad(col.header, widths[i] ?? 3, col.align)).join(" | ")
      const separator = widths.map((w) => "-".repeat(w ?? 3)).join("-+-")

      // Rows
      const body = rows
        .map((row) =>
          columns.map((col, i) => pad(String(row[i] ?? ""), widths[i] ?? 3, col.align)).join(" | "),
        )
        .join("\n")

      let result = `${header}\n${separator}\n${body}\n\n`
      if (p.caption) result = `${p.caption}\n\n${result}`
      return result
    }

    case "list": {
      const ordered = p.ordered as boolean | undefined
      return `${node.children
        .filter((c): c is DocNode => typeof c !== "string")
        .map((item, i) => {
          const prefix = ordered ? `${i + 1}.` : "*"
          return `  ${prefix} ${renderChildren(item.children)}`
        })
        .join("\n")}\n\n`
    }

    case "list-item":
      return renderChildren(node.children)

    case "code":
      return `${renderChildren(node.children)}\n\n`

    case "divider":
      return `${"─".repeat(40)}\n\n`

    case "page-break":
      return `\n${"═".repeat(40)}\n\n`

    case "spacer":
      return "\n"

    case "button":
      return `[${renderChildren(node.children)}] → ${p.href}\n\n`

    case "quote":
      return `  "${renderChildren(node.children)}"\n\n`

    default:
      return renderChildren(node.children)
  }
}

export const textRenderer: DocumentRenderer = {
  async render(node: DocNode, _options?: RenderOptions): Promise<string> {
    return `${renderNode(node).trim()}\n`
  },
}
