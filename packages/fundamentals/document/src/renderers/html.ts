import { escapeXml as escapeHtml, sanitizeColor, sanitizeHref, sanitizeImageSrc, sanitizeStyle } from '../sanitize'
import type {
  DocChild,
  DocNode,
  DocumentRenderer,
  RenderOptions,
  ResolvedStyles,
  TableColumn,
} from '../types'

function resolveColumn(col: string | TableColumn): TableColumn {
  return typeof col === 'string' ? { header: col } : col
}

/** Raw `prop:value` declarations (no attribute wrapper) — see styleStr. */
function styleDecls(styles: Record<string, string | number | undefined>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(styles)) {
    if (v != null && v !== '') {
      const prop = k.replace(/([A-Z])/g, '-$1').toLowerCase()
      // String values can be document-author / CMS controlled (column
      // `width`, `align`, `gap`, …) and land inside a `style="…"`
      // attribute. Without sanitization `width: 'x"><script>…'` breaks
      // out of the attribute → XSS in the produced HTML (emailed /
      // served). Route every string value through the same `sanitizeCss`
      // the rest of this renderer uses (strips `" < > ; ( )` + css
      // injection vectors). Numbers are structurally safe.
      const safeV = typeof v === 'number' ? `${v}px` : sanitizeStyle(v)
      if (safeV !== '') parts.push(`${prop}:${safeV}`)
    }
  }
  return parts.join(';')
}

function styleStr(styles: Record<string, string | number | undefined>): string {
  const decls = styleDecls(styles)
  return decls.length > 0 ? ` style="${decls}"` : ''
}

/**
 * Map a node's resolved styles (`node.styles` from @pyreon/connector-document's
 * rocketstyle resolution, overridden by `options.styles[node.type]` — the
 * per-node-type override map) to CSS declarations for the emitted element.
 * Only the CSS-mappable ResolvedStyles subset is emitted; unitless values
 * (fontWeight, lineHeight, opacity) are stringified so the number→px rule
 * in styleDecls doesn't corrupt them. Colors run through sanitizeColor,
 * strings through the styleDecls sanitizer.
 */
function resolvedCssRecord(
  node: DocNode,
  opts?: RenderOptions,
): Record<string, string | number | undefined> {
  const override = opts?.styles?.[node.type]
  if (node.styles == null && override == null) return {}
  const src: ResolvedStyles = { ...node.styles, ...override }
  const rec: Record<string, string | number | undefined> = {}
  if (src.color != null) rec.color = sanitizeColor(src.color)
  if (src.backgroundColor != null) rec.backgroundColor = sanitizeColor(src.backgroundColor)
  if (src.fontSize != null) rec.fontSize = src.fontSize
  if (src.fontFamily != null) rec.fontFamily = src.fontFamily
  if (src.fontWeight != null) rec.fontWeight = String(src.fontWeight)
  if (src.fontStyle != null) rec.fontStyle = src.fontStyle
  if (src.textDecoration != null) rec.textDecoration = src.textDecoration
  if (src.textAlign != null) rec.textAlign = src.textAlign
  if (src.lineHeight != null) rec.lineHeight = String(src.lineHeight)
  if (src.letterSpacing != null) rec.letterSpacing = src.letterSpacing
  if (src.padding != null) rec.padding = padStr(src.padding)
  if (src.margin != null) rec.margin = padStr(src.margin)
  if (src.borderRadius != null) rec.borderRadius = src.borderRadius
  if (src.borderWidth != null) rec.borderWidth = src.borderWidth
  if (src.borderColor != null) rec.borderColor = sanitizeColor(src.borderColor)
  if (src.borderStyle != null) rec.borderStyle = src.borderStyle
  if (src.width != null) rec.width = src.width
  if (src.height != null) rec.height = src.height
  if (src.maxWidth != null) rec.maxWidth = src.maxWidth
  if (src.opacity != null) rec.opacity = String(src.opacity)
  return rec
}

function padStr(
  pad: number | [number, number] | [number, number, number, number] | undefined,
): string | undefined {
  if (pad == null) return undefined
  if (typeof pad === 'number') return `${pad}px`
  if (pad.length === 2) return `${pad[0]}px ${pad[1]}px`
  return `${pad[0]}px ${pad[1]}px ${pad[2]}px ${pad[3]}px`
}

function renderChild(child: DocChild, opts?: RenderOptions): string {
  if (typeof child === 'string') return escapeHtml(child)
  return renderNode(child, opts)
}

function renderChildren(children: DocChild[], opts?: RenderOptions): string {
  return children.map((c) => renderChild(c, opts)).join('')
}

function renderNode(node: DocNode, opts?: RenderOptions): string {
  const p = node.props
  // Resolved styles (connector pipeline + options.styles overrides) —
  // merged LAST into each emitted element's style so they win over
  // prop-derived styling.
  const rs = resolvedCssRecord(node, opts)

  switch (node.type) {
    case 'document': {
      // Document metadata is populated from DocDocument's
      // _documentProps via extractDocumentTree.
      // Title goes in <title>, author goes in
      // <meta name="author">, subject goes in <meta name="description">
      // (the closest semantic HTML equivalent — DOCX's "subject"
      // is conceptually the same as HTML's description meta).
      // `language` lands raw in `<html lang="…">`. title/author/subject
      // are escaped; `lang` was not — `language: 'en"><script>…'` broke
      // out of the attribute (XSS). A valid BCP-47 tag is letters /
      // digits / hyphen only: strip everything else, then HTML-escape as
      // belt-and-braces, falling back to 'en' if nothing survives.
      const rawLang = ((p.language as string) ?? 'en').replace(/[^a-zA-Z0-9-]/g, '')
      const lang = escapeHtml(rawLang || 'en')
      const title = p.title ? `<title>${escapeHtml(p.title as string)}</title>` : ''
      const author = p.author
        ? `<meta name="author" content="${escapeHtml(p.author as string)}">`
        : ''
      const description = p.subject
        ? `<meta name="description" content="${escapeHtml(p.subject as string)}">`
        : ''
      return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8">${title}${author}${description}<meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${renderChildren(node.children, opts)}</body></html>`
    }

    case 'page': {
      const margin = padStr(p.margin as PageMargin)
      return `<div${styleStr({ maxWidth: '800px', margin: margin ?? '0 auto', padding: margin ?? '40px', ...rs })}>${renderChildren(node.children, opts)}</div>`
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
        ...rs,
      })}>${renderChildren(node.children, opts)}</div>`
    }

    case 'row':
      return `<div${styleStr({ display: 'flex', gap: p.gap as number | undefined, alignItems: p.align as string | undefined, ...rs })}>${renderChildren(node.children, opts)}</div>`

    case 'column':
      return `<div${styleStr({ flex: p.width ? undefined : '1', width: p.width as string | undefined, textAlign: p.align as string | undefined, ...rs })}>${renderChildren(node.children, opts)}</div>`

    case 'heading': {
      const level = (p.level as number) ?? 1
      const tag = `h${Math.min(Math.max(level, 1), 6)}`
      return `<${tag}${styleStr({ color: sanitizeColor(p.color as string | undefined), textAlign: p.align as string | undefined, ...rs })}>${renderChildren(node.children, opts)}</${tag}>`
    }

    case 'text': {
      return `<p${styleStr({
        fontSize: p.size as number | undefined,
        color: sanitizeColor(p.color as string | undefined),
        fontWeight: p.bold ? 'bold' : undefined,
        fontStyle: p.italic ? 'italic' : undefined,
        textDecoration: p.underline ? 'underline' : p.strikethrough ? 'line-through' : undefined,
        textAlign: p.align as string | undefined,
        lineHeight: p.lineHeight != null ? String(p.lineHeight as number) : undefined,
        ...rs,
      })}>${renderChildren(node.children, opts)}</p>`
    }

    case 'link':
      return `<a href="${escapeHtml(sanitizeHref(p.href as string))}"${styleStr({ color: sanitizeColor(p.color as string | undefined), ...rs })}>${renderChildren(node.children, opts)}</a>`

    case 'image': {
      const alignStyle =
        p.align === 'center'
          ? 'display:block;margin:0 auto'
          : p.align === 'right'
            ? 'display:block;margin-left:auto'
            : ''
      // Always emit `alt` (default "") — an <img> with no alt attribute is
      // WCAG-nonconformant (screen readers fall back to the filename); alt=""
      // correctly marks a decorative image. Matches the email renderer.
      const img = `<img src="${escapeHtml(sanitizeImageSrc(p.src as string))}"${p.width ? ` width="${p.width}"` : ''}${p.height ? ` height="${p.height}"` : ''} alt="${escapeHtml((p.alt as string) ?? '')}"${alignStyle ? ` style="${sanitizeStyle(alignStyle)}"` : ''} />`
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
      return `<${tag}${styleStr(rs)}>${renderChildren(node.children, opts)}</${tag}>`
    }

    case 'list-item':
      return `<li${styleStr(rs)}>${renderChildren(node.children, opts)}</li>`

    case 'code': {
      const extra = styleDecls(rs)
      return `<pre style="background:#f5f5f5;padding:12px;border-radius:4px;overflow-x:auto${extra ? `;${extra}` : ''}"><code>${escapeHtml(renderChildren(node.children, opts))}</code></pre>`
    }

    case 'divider': {
      const color = sanitizeColor((p.color as string) ?? '#ddd')
      const thickness = (p.thickness as number) ?? 1
      const extra = styleDecls(rs)
      return `<hr style="border:none;border-top:${thickness}px solid ${color};margin:16px 0${extra ? `;${extra}` : ''}" />`
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
      const extra = styleDecls(rs)
      return `<div style="text-align:${align}"><a href="${escapeHtml(sanitizeHref(p.href as string))}" style="display:inline-block;background:${bg};color:${color};padding:${pad};border-radius:${radius}px;text-decoration:none;font-weight:bold${extra ? `;${extra}` : ''}">${renderChildren(node.children, opts)}</a></div>`
    }

    case 'quote': {
      const borderColor = sanitizeColor((p.borderColor as string) ?? '#ddd')
      const extra = styleDecls(rs)
      return `<blockquote style="margin:0;padding:12px 20px;border-left:4px solid ${borderColor};color:#555${extra ? `;${extra}` : ''}">${renderChildren(node.children, opts)}</blockquote>`
    }

    default:
      return renderChildren(node.children, opts)
  }
}

type PageMargin = number | [number, number] | [number, number, number, number]

export const htmlRenderer: DocumentRenderer = {
  async render(node: DocNode, options?: RenderOptions): Promise<string> {
    let html = renderNode(node, options)
    if (options?.direction === 'rtl') {
      html = html.replace('<body>', '<body dir="rtl" style="direction:rtl">')
    }
    return html
  },
}
