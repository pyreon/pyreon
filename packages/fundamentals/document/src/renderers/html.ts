import { sanitizeColor, sanitizeHref, sanitizeImageSrc, sanitizeStyle } from '../sanitize'
import type { DocChild, DocNode, DocumentRenderer, RenderOptions, TableColumn } from '../types'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function resolveColumn(col: string | TableColumn): TableColumn {
  return typeof col === 'string' ? { header: col } : col
}

function styleStr(styles: Record<string, string | number | undefined>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(styles)) {
    if (v != null && v !== '') {
      const prop = k.replace(/([A-Z])/g, '-$1').toLowerCase()
      parts.push(`${prop}:${typeof v === 'number' ? `${v}px` : v}`)
    }
  }
  return parts.length > 0 ? ` style="${parts.join(';')}"` : ''
}

function padStr(
  pad: number | [number, number] | [number, number, number, number] | undefined,
): string | undefined {
  if (pad == null) return undefined
  if (typeof pad === 'number') return `${pad}px`
  if (pad.length === 2) return `${pad[0]}px ${pad[1]}px`
  return `${pad[0]}px ${pad[1]}px ${pad[2]}px ${pad[3]}px`
}

function renderChild(child: DocChild): string {
  if (typeof child === 'string') return escapeHtml(child)
  return renderNode(child)
}

function renderChildren(children: DocChild[]): string {
  return children.map(renderChild).join('')
}

function renderNode(node: DocNode): string {
  const p = node.props

  switch (node.type) {
    case 'document': {
      const lang = (p.language as string) ?? 'en'
      const title = p.title ? `<title>${escapeHtml(p.title as string)}</title>` : ''
      return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8">${title}<meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${renderChildren(node.children)}</body></html>`
    }

    case 'page': {
      const margin = padStr(p.margin as PageMargin)
      return `<div${styleStr({ maxWidth: '800px', margin: margin ?? '0 auto', padding: margin ?? '40px' })}>${renderChildren(node.children)}</div>`
    }

    case 'section': {
      const dir = (p.direction as string) ?? 'column'
      return `<div${styleStr({
        display: dir === 'row' ? 'flex' : 'block',
        flexDirection: dir === 'row' ? 'row' : undefined,
        gap: p.gap as number | undefined,
        padding: padStr(p.padding as PageMargin),
        background: sanitizeColor(p.background as string | undefined),
        borderRadius: p.borderRadius as number | undefined,
      })}>${renderChildren(node.children)}</div>`
    }

    case 'row':
      return `<div${styleStr({ display: 'flex', gap: p.gap as number | undefined, alignItems: p.align as string | undefined })}>${renderChildren(node.children)}</div>`

    case 'column':
      return `<div${styleStr({ flex: p.width ? undefined : '1', width: p.width as string | undefined, textAlign: p.align as string | undefined })}>${renderChildren(node.children)}</div>`

    case 'heading': {
      const level = (p.level as number) ?? 1
      const tag = `h${Math.min(Math.max(level, 1), 6)}`
      return `<${tag}${styleStr({ color: sanitizeColor(p.color as string | undefined), textAlign: p.align as string | undefined })}>${renderChildren(node.children)}</${tag}>`
    }

    case 'text': {
      return `<p${styleStr({
        fontSize: p.size as number | undefined,
        color: sanitizeColor(p.color as string | undefined),
        fontWeight: p.bold ? 'bold' : undefined,
        fontStyle: p.italic ? 'italic' : undefined,
        textDecoration: p.underline ? 'underline' : p.strikethrough ? 'line-through' : undefined,
        textAlign: p.align as string | undefined,
        lineHeight: p.lineHeight as number | undefined,
      })}>${renderChildren(node.children)}</p>`
    }

    case 'link':
      return `<a href="${escapeHtml(sanitizeHref(p.href as string))}"${styleStr({ color: sanitizeColor(p.color as string | undefined) })}>${renderChildren(node.children)}</a>`

    case 'image': {
      const alignStyle =
        p.align === 'center'
          ? 'display:block;margin:0 auto'
          : p.align === 'right'
            ? 'display:block;margin-left:auto'
            : ''
      const img = `<img src="${escapeHtml(sanitizeImageSrc(p.src as string))}"${p.width ? ` width="${p.width}"` : ''}${p.height ? ` height="${p.height}"` : ''}${p.alt ? ` alt="${escapeHtml(p.alt as string)}"` : ''}${alignStyle ? ` style="${sanitizeStyle(alignStyle)}"` : ''} />`
      if (p.caption) {
        return `<figure${p.align === 'center' ? ' style="text-align:center"' : ''}>${img}<figcaption>${escapeHtml(p.caption as string)}</figcaption></figure>`
      }
      return img
    }

    case 'table': {
      const columns = ((p.columns ?? []) as (string | TableColumn)[]).map(resolveColumn)
      const rows = (p.rows ?? []) as (string | number)[][]
      const hs = p.headerStyle as
        | { background?: string; color?: string; bold?: boolean }
        | undefined
      const striped = p.striped as boolean | undefined
      const bordered = p.bordered as boolean | undefined
      const borderStyle = bordered
        ? 'border:1px solid #ddd;border-collapse:collapse;'
        : 'border-collapse:collapse;'

      let html = `<table style="width:100%;${borderStyle}">`
      if (p.caption) html += `<caption>${escapeHtml(p.caption as string)}</caption>`

      html += '<thead><tr>'
      for (const col of columns) {
        const cellBorder = bordered ? 'border:1px solid #ddd;' : ''
        const bgStyle = hs?.background ? `background:${sanitizeColor(hs.background)};` : ''
        const colorStyle = hs?.color ? `color:${sanitizeColor(hs.color)};` : ''
        const fontStyle = hs?.bold !== false ? 'font-weight:bold;' : ''
        const alignStyle = col.align ? `text-align:${col.align};` : ''
        const widthStyle = col.width
          ? `width:${typeof col.width === 'number' ? `${col.width}px` : col.width};`
          : ''
        html += `<th style="${cellBorder}${bgStyle}${colorStyle}${fontStyle}${alignStyle}${widthStyle}padding:8px">${escapeHtml(col.header)}</th>`
      }
      html += '</tr></thead>'

      html += '<tbody>'
      for (let i = 0; i < rows.length; i++) {
        const rowBg = striped && i % 2 === 1 ? ' style="background:#f9f9f9"' : ''
        html += `<tr${rowBg}>`
        for (let j = 0; j < columns.length; j++) {
          const cellBorder = bordered ? 'border:1px solid #ddd;' : ''
          const col = columns[j]
          const alignStyle = col?.align ? `text-align:${col.align};` : ''
          html += `<td style="${cellBorder}${alignStyle}padding:8px">${escapeHtml(String(rows[i]?.[j] ?? ''))}</td>`
        }
        html += '</tr>'
      }
      html += '</tbody></table>'
      return html
    }

    case 'list': {
      const tag = p.ordered ? 'ol' : 'ul'
      return `<${tag}>${renderChildren(node.children)}</${tag}>`
    }

    case 'list-item':
      return `<li>${renderChildren(node.children)}</li>`

    case 'code':
      return `<pre style="background:#f5f5f5;padding:12px;border-radius:4px;overflow-x:auto"><code>${escapeHtml(renderChildren(node.children))}</code></pre>`

    case 'divider': {
      const color = sanitizeColor((p.color as string) ?? '#ddd')
      const thickness = (p.thickness as number) ?? 1
      return `<hr style="border:none;border-top:${thickness}px solid ${color};margin:16px 0" />`
    }

    case 'page-break':
      return '<div style="page-break-after:always;break-after:page"></div>'

    case 'spacer':
      return `<div style="height:${p.height}px"></div>`

    case 'button': {
      const bg = sanitizeColor((p.background as string) ?? '#4f46e5')
      const color = sanitizeColor((p.color as string) ?? '#fff')
      const radius = (p.borderRadius as number) ?? 4
      const pad = padStr((p.padding ?? [12, 24]) as [number, number])
      const align = (p.align as string) ?? 'left'
      return `<div style="text-align:${align}"><a href="${escapeHtml(sanitizeHref(p.href as string))}" style="display:inline-block;background:${bg};color:${color};padding:${pad};border-radius:${radius}px;text-decoration:none;font-weight:bold">${renderChildren(node.children)}</a></div>`
    }

    case 'quote': {
      const borderColor = sanitizeColor((p.borderColor as string) ?? '#ddd')
      return `<blockquote style="margin:0;padding:12px 20px;border-left:4px solid ${borderColor};color:#555">${renderChildren(node.children)}</blockquote>`
    }

    default:
      return renderChildren(node.children)
  }
}

type PageMargin = number | [number, number] | [number, number, number, number]

export const htmlRenderer: DocumentRenderer = {
  async render(node: DocNode, options?: RenderOptions): Promise<string> {
    let html = renderNode(node)
    if (options?.direction === 'rtl') {
      html = html.replace('<body>', '<body dir="rtl" style="direction:rtl">')
    }
    return html
  },
}
