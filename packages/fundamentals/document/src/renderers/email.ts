import { sanitizeColor, sanitizeHref, sanitizeImageSrc } from "../sanitize"
import type { DocChild, DocNode, DocumentRenderer, RenderOptions, TableColumn } from "../types"

/**
 * Email renderer — generates table-based HTML with inline styles
 * that works across Gmail, Outlook, Apple Mail, and other email clients.
 *
 * Key constraints:
 * - No CSS classes (Gmail strips <style> tags)
 * - Table-based layout (no flexbox/grid)
 * - All styles inline
 * - VML buttons for Outlook
 * - Max width 600px for compatibility
 */

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function resolveColumn(col: string | TableColumn): TableColumn {
  return typeof col === "string" ? { header: col } : col
}

function renderChild(child: DocChild): string {
  if (typeof child === "string") return esc(child)
  return renderNode(child)
}

function renderChildren(children: DocChild[]): string {
  return children.map(renderChild).join("")
}

function wrapInTable(content: string, style = ""): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0"${style ? ` style="${style}"` : ""}><tr><td>${content}</td></tr></table>`
}

function renderNode(node: DocNode): string {
  const p = node.props

  switch (node.type) {
    case "document": {
      const title = p.title ? `<title>${esc(p.title as string)}</title>` : ""
      const preview = p.subject
        ? `<div style="display:none;max-height:0;overflow:hidden">${esc(p.subject as string)}</div>`
        : ""
      return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${title}<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]--></head><body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,Helvetica,sans-serif">${preview}<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4"><tr><td align="center" style="padding:20px 0"><table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;max-width:600px;width:100%"><tr><td>${renderChildren(node.children)}</td></tr></table></td></tr></table></body></html>`
    }

    case "page":
      // In email, pages are just content sections
      return renderChildren(node.children)

    case "section": {
      const bg = p.background ? `background-color:${sanitizeColor(p.background as string)};` : ""
      const pad = p.padding
        ? `padding:${typeof p.padding === "number" ? `${p.padding}px` : Array.isArray(p.padding) ? (p.padding as number[]).map((v) => `${v}px`).join(" ") : "0"}`
        : "padding:0"
      const radius = p.borderRadius ? `border-radius:${p.borderRadius}px;` : ""

      if (p.direction === "row") {
        // Row layout via nested table
        const children = node.children.filter((c): c is DocNode => typeof c !== "string")
        const colWidth = Math.floor(100 / Math.max(children.length, 1))
        return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="${bg}${radius}${pad}"><tr>${children.map((child) => `<td width="${colWidth}%" valign="top" style="padding:${(p.gap as number | undefined) ? `0 ${(p.gap as number) / 2}px` : "0"}">${renderNode(child)}</td>`).join("")}</tr></table>`
      }

      return wrapInTable(renderChildren(node.children), `${bg}${radius}${pad}`)
    }

    case "row": {
      const children = node.children.filter((c): c is DocNode => typeof c !== "string")
      const gap = (p.gap as number) ?? 0
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${children.map((child) => `<td valign="top" style="padding:0 ${gap / 2}px">${renderNode(child)}</td>`).join("")}</tr></table>`
    }

    case "column":
      return renderChildren(node.children)

    case "heading": {
      const level = (p.level as number) ?? 1
      const sizes: Record<number, number> = {
        1: 28,
        2: 24,
        3: 20,
        4: 18,
        5: 16,
        6: 14,
      }
      const size = sizes[level] ?? 24
      const color = sanitizeColor((p.color as string) ?? "#000000")
      const align = (p.align as string) ?? "left"
      return `<h${level} style="margin:0 0 12px 0;font-size:${size}px;color:${color};text-align:${align};font-weight:bold;line-height:1.3">${renderChildren(node.children)}</h${level}>`
    }

    case "text": {
      const size = (p.size as number) ?? 14
      const color = sanitizeColor((p.color as string) ?? "#333333")
      const weight = p.bold ? "bold" : "normal"
      const style = p.italic ? "italic" : "normal"
      const decoration = p.underline ? "underline" : p.strikethrough ? "line-through" : "none"
      const align = (p.align as string) ?? "left"
      const lh = (p.lineHeight as number) ?? 1.5
      return `<p style="margin:0 0 12px 0;font-size:${size}px;color:${color};font-weight:${weight};font-style:${style};text-decoration:${decoration};text-align:${align};line-height:${lh}">${renderChildren(node.children)}</p>`
    }

    case "link":
      return `<a href="${esc(sanitizeHref(p.href as string))}" style="color:${sanitizeColor((p.color as string) ?? "#4f46e5")};text-decoration:underline" target="_blank">${renderChildren(node.children)}</a>`

    case "image": {
      const align = (p.align as string) ?? "left"
      const img = `<img src="${esc(sanitizeImageSrc(p.src as string))}"${p.width ? ` width="${p.width}"` : ""}${p.height ? ` height="${p.height}"` : ""} alt="${esc((p.alt as string) ?? "")}" style="display:block;outline:none;border:none;text-decoration:none${p.width ? `;max-width:${p.width}px` : ""}" />`
      if (p.caption) {
        return `<table cellpadding="0" cellspacing="0" border="0"${align === "center" ? ' align="center"' : ""}><tr><td>${img}</td></tr><tr><td style="font-size:12px;color:#666;padding-top:4px;text-align:center">${esc(p.caption as string)}</td></tr></table>`
      }
      if (align === "center") return `<div style="text-align:center">${img}</div>`
      if (align === "right") return `<div style="text-align:right">${img}</div>`
      return img
    }

    case "table": {
      const columns = ((p.columns ?? []) as (string | TableColumn)[]).map(resolveColumn)
      const rows = (p.rows ?? []) as (string | number)[][]
      const hs = p.headerStyle as
        | { background?: string; color?: string; bold?: boolean }
        | undefined
      const striped = p.striped as boolean | undefined

      let html =
        '<table width="100%" cellpadding="8" cellspacing="0" border="0" style="border-collapse:collapse">'
      if (p.caption)
        html += `<caption style="font-size:12px;color:#666;padding:8px;text-align:left">${esc(p.caption as string)}</caption>`

      html += "<tr>"
      for (const col of columns) {
        const bg = hs?.background
          ? `background-color:${sanitizeColor(hs.background)};`
          : "background-color:#f5f5f5;"
        const color = hs?.color ? `color:${sanitizeColor(hs.color)};` : ""
        const align = col.align ? `text-align:${col.align};` : ""
        const width = col.width
          ? `width:${typeof col.width === "number" ? `${col.width}px` : col.width};`
          : ""
        html += `<th style="${bg}${color}font-weight:bold;${align}${width}padding:8px;border-bottom:2px solid #ddd">${esc(col.header)}</th>`
      }
      html += "</tr>"

      for (let i = 0; i < rows.length; i++) {
        const bg = striped && i % 2 === 1 ? "background-color:#f9f9f9;" : ""
        html += "<tr>"
        for (let j = 0; j < columns.length; j++) {
          const col = columns[j]
          const align = col?.align ? `text-align:${col.align};` : ""
          html += `<td style="${bg}${align}padding:8px;border-bottom:1px solid #eee">${esc(String(rows[i]?.[j] ?? ""))}</td>`
        }
        html += "</tr>"
      }
      html += "</table>"
      return html
    }

    case "list": {
      const tag = p.ordered ? "ol" : "ul"
      return `<${tag} style="margin:0 0 12px 0;padding-left:24px">${renderChildren(node.children)}</${tag}>`
    }

    case "list-item":
      return `<li style="margin:0 0 4px 0;font-size:14px;color:#333">${renderChildren(node.children)}</li>`

    case "code":
      return `<pre style="background-color:#f5f5f5;padding:12px;border-radius:4px;font-family:Courier New,monospace;font-size:13px;color:#333;overflow-x:auto;margin:0 0 12px 0"><code>${esc(renderChildren(node.children))}</code></pre>`

    case "divider": {
      const color = sanitizeColor((p.color as string) ?? "#dddddd")
      const thickness = (p.thickness as number) ?? 1
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0"><tr><td style="border-top:${thickness}px solid ${color};font-size:0;line-height:0">&nbsp;</td></tr></table>`
    }

    case "page-break":
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0"><tr><td style="border-top:2px solid #dddddd;font-size:0;line-height:0">&nbsp;</td></tr></table>`

    case "spacer":
      return `<div style="height:${p.height}px;line-height:${p.height}px;font-size:0">&nbsp;</div>`

    case "button": {
      const bg = sanitizeColor((p.background as string) ?? "#4f46e5")
      const color = sanitizeColor((p.color as string) ?? "#ffffff")
      const radius = (p.borderRadius as number) ?? 4
      const href = esc(sanitizeHref(p.href as string))
      const text = renderChildren(node.children)
      const align = (p.align as string) ?? "left"

      // Bulletproof button — works in Outlook via VML, CSS everywhere else
      return `<div style="text-align:${align};margin:12px 0"><!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:44px;v-text-anchor:middle;width:200px" arcsize="10%" strokecolor="${bg}" fillcolor="${bg}"><w:anchorlock/><center style="color:${color};font-family:Arial,sans-serif;font-size:14px;font-weight:bold">${text}</center></v:roundrect><![endif]--><!--[if !mso]><!--><a href="${href}" style="display:inline-block;background-color:${bg};color:${color};padding:12px 24px;border-radius:${radius}px;text-decoration:none;font-weight:bold;font-size:14px;font-family:Arial,sans-serif" target="_blank">${text}</a><!--<![endif]--></div>`
    }

    case "quote": {
      const borderColor = sanitizeColor((p.borderColor as string) ?? "#dddddd")
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0"><tr><td style="border-left:4px solid ${borderColor};padding:12px 20px;color:#555555;font-style:italic">${renderChildren(node.children)}</td></tr></table>`
    }

    default:
      return renderChildren(node.children)
  }
}

export const emailRenderer: DocumentRenderer = {
  async render(node: DocNode, _options?: RenderOptions): Promise<string> {
    return renderNode(node)
  },
}
