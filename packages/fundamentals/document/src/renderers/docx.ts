import { sanitizeHref, sanitizeXmlColor } from '../sanitize'
import type {
  DocChild,
  DocNode,
  DocumentRenderer,
  PageOrientation,
  PageSize,
  RenderOptions,
  TableColumn,
} from '../types'

/**
 * DOCX renderer — lazy-loads the 'docx' npm package on first use.
 */

function resolveColumn(col: string | TableColumn): TableColumn {
  return typeof col === 'string' ? { header: col } : col
}

function getTextContent(children: DocChild[]): string {
  return children
    .map((c) => (typeof c === 'string' ? c : getTextContent((c as DocNode).children)))
    .join('')
}

/** Parse a data URL and return the base64 data and media type, or null for external URLs. */
function parseDataUrl(src: string): { data: string; mime: string } | null {
  const match = src.match(/^data:(image\/[^;]+);base64,(.+)$/)
  if (!match) return null
  return { mime: match[1]!, data: match[2]! }
}

/** Convert page size name to DOCX page dimensions in twips (1 inch = 1440 twips). */
function getPageSize(
  size?: PageSize,
  orientation?: PageOrientation,
): { width: number; height: number } | undefined {
  if (!size) return undefined
  const sizes: Record<string, { width: number; height: number }> = {
    A4: { width: 11906, height: 16838 },
    A3: { width: 16838, height: 23811 },
    A5: { width: 8391, height: 11906 },
    letter: { width: 12240, height: 15840 },
    legal: { width: 12240, height: 20160 },
    tabloid: { width: 15840, height: 24480 },
  }
  const dims = sizes[size]
  if (!dims) return undefined
  if (orientation === 'landscape') {
    return { width: dims.height, height: dims.width }
  }
  return dims
}

/** Convert margin prop to DOCX section margin (in twips, 1pt ~= 20 twips). */
function getPageMargins(
  margin?: number | [number, number] | [number, number, number, number],
): object | undefined {
  if (margin == null) return undefined
  if (typeof margin === 'number') {
    const twips = margin * 20
    return { top: twips, right: twips, bottom: twips, left: twips }
  }
  if (margin.length === 2) {
    return {
      top: margin[0] * 20,
      right: margin[1] * 20,
      bottom: margin[0] * 20,
      left: margin[1] * 20,
    }
  }
  return {
    top: margin[0] * 20,
    right: margin[1] * 20,
    bottom: margin[2] * 20,
    left: margin[3] * 20,
  }
}

/** Map percentage column width to DOCX table column width. */
function getColumnWidth(width?: number | string): { size: number; type: unknown } | undefined {
  if (width == null) return undefined
  if (typeof width === 'number') return undefined
  const match = width.match(/^(\d+)%$/)
  if (!match) return undefined
  return { size: Number.parseInt(match[1]!, 10) * 100, type: 'pct' as unknown }
}

/** Shared context passed to per-node-type render helpers. */
interface DocxCtx {
  docx: typeof import('docx')
  children: unknown[]
  alignmentMap: (align?: string) => unknown
  processListItems: (n: DocNode, listRef: string, level: number, ordered: boolean) => void
  nextListId: () => string
}

function renderHeading(ctx: DocxCtx, n: DocNode): void {
  const { docx, children, alignmentMap } = ctx
  const p = n.props
  const level = (p.level as number) ?? 1
  const headingMap: Record<number, unknown> = {
    1: docx.HeadingLevel.HEADING_1,
    2: docx.HeadingLevel.HEADING_2,
    3: docx.HeadingLevel.HEADING_3,
    4: docx.HeadingLevel.HEADING_4,
    5: docx.HeadingLevel.HEADING_5,
    6: docx.HeadingLevel.HEADING_6,
  }
  children.push(
    new docx.Paragraph({
      heading: (headingMap[level] ?? docx.HeadingLevel.HEADING_1) as any,
      children: [
        new docx.TextRun({
          text: getTextContent(n.children),
          bold: true,
          color: sanitizeXmlColor(p.color as string),
        }),
      ],
      alignment: alignmentMap(p.align as string) as any,
    }),
  )
}

function renderTextNode(ctx: DocxCtx, n: DocNode): void {
  const { docx, children, alignmentMap } = ctx
  const p = n.props
  children.push(
    new docx.Paragraph({
      children: [
        new docx.TextRun({
          text: getTextContent(n.children),
          ...(p.bold != null ? { bold: p.bold as boolean } : {}),
          ...(p.italic != null ? { italics: p.italic as boolean } : {}),
          ...(p.underline ? { underline: {} } : {}),
          ...(p.strikethrough != null ? { strike: p.strikethrough as boolean } : {}),
          ...(p.size != null ? { size: (p.size as number) * 2 } : {}),
          color: sanitizeXmlColor(p.color as string, '333333'),
        }),
      ],
      alignment: alignmentMap(p.align as string) as any,
      spacing: { after: 120 },
    }),
  )
}

function renderLink(ctx: DocxCtx, n: DocNode): void {
  const { docx, children } = ctx
  const p = n.props
  children.push(
    new docx.Paragraph({
      children: [
        new docx.ExternalHyperlink({
          link: sanitizeHref(p.href as string),
          children: [
            new docx.TextRun({
              text: getTextContent(n.children),
              color: sanitizeXmlColor(p.color as string, '4f46e5'),
              underline: { type: docx.UnderlineType.SINGLE },
            }),
          ],
        }),
      ],
    }),
  )
}

function renderImage(ctx: DocxCtx, n: DocNode): void {
  const { docx, children, alignmentMap } = ctx
  const p = n.props
  const src = p.src as string
  const parsed = parseDataUrl(src)

  if (parsed) {
    const imgWidth = (p.width as number) ?? 300
    const imgHeight = (p.height as number) ?? 200
    children.push(
      new docx.Paragraph({
        children: [
          new docx.ImageRun({
            data: Buffer.from(parsed.data, 'base64'),
            transformation: { width: imgWidth, height: imgHeight },
            type: parsed.mime === 'image/png' ? 'png' : 'jpg',
          }),
        ],
        alignment: alignmentMap(p.align as string) as any,
      }),
    )
    if (p.caption) {
      children.push(
        new docx.Paragraph({
          children: [
            new docx.TextRun({
              text: p.caption as string,
              italics: true,
              size: 20,
              color: '666666',
            }),
          ],
          alignment: alignmentMap(p.align as string) as any,
          spacing: { after: 120 },
        }),
      )
    }
  } else {
    const alt = (p.alt as string) ?? 'Image'
    const caption = p.caption ? ` — ${p.caption}` : ''
    children.push(
      new docx.Paragraph({
        children: [
          new docx.TextRun({
            text: `[${alt}${caption}]`,
            italics: true,
            color: '999999',
          }),
        ],
      }),
    )
  }
}

function renderDocxTable(ctx: DocxCtx, n: DocNode): void {
  const { docx, children, alignmentMap } = ctx
  const p = n.props
  const columns = ((p.columns ?? []) as (string | TableColumn)[]).map(resolveColumn)
  const rows = (p.rows ?? []) as (string | number)[][]
  const hs = p.headerStyle as { background?: string; color?: string } | undefined
  const bordered = p.bordered as boolean | undefined
  const borderStyle = bordered
    ? { style: docx.BorderStyle.SINGLE, size: 1, color: 'DDDDDD' }
    : undefined
  const cellBorders = borderStyle
    ? {
        top: borderStyle,
        bottom: borderStyle,
        left: borderStyle,
        right: borderStyle,
      }
    : undefined

  const headerRow = new docx.TableRow({
    tableHeader: true,
    children: columns.map(
      (col) =>
        new docx.TableCell({
          children: [
            new docx.Paragraph({
              children: [
                new docx.TextRun({
                  text: col.header,
                  bold: true,
                  color: sanitizeXmlColor(hs?.color),
                }),
              ],
              alignment: alignmentMap(col.align) as any,
            }),
          ],
          ...(hs?.background
            ? {
                shading: {
                  fill: sanitizeXmlColor(hs.background),
                  type: docx.ShadingType.SOLID,
                },
              }
            : {}),
          ...(cellBorders != null ? { borders: cellBorders } : {}),
          width: getColumnWidth(col.width as string | undefined) as any,
        }),
    ),
  })

  const dataRows = rows.map(
    (row, rowIdx) =>
      new docx.TableRow({
        children: columns.map(
          (col, colIdx) =>
            new docx.TableCell({
              children: [
                new docx.Paragraph({
                  children: [new docx.TextRun({ text: String(row[colIdx] ?? '') })],
                  alignment: alignmentMap(col.align) as any,
                }),
              ],
              ...(p.striped && rowIdx % 2 === 1
                ? { shading: { fill: 'F9F9F9', type: docx.ShadingType.SOLID } }
                : {}),
              ...(cellBorders != null ? { borders: cellBorders } : {}),
              width: getColumnWidth(col.width as string | undefined) as any,
            }),
        ),
      }),
  )

  if (p.caption) {
    children.push(
      new docx.Paragraph({
        children: [
          new docx.TextRun({
            text: p.caption as string,
            italics: true,
            size: 20,
          }),
        ],
        spacing: { after: 60 },
      }),
    )
  }

  children.push(
    new docx.Table({
      rows: [headerRow, ...dataRows],
      width: { size: 100, type: docx.WidthType.PERCENTAGE },
    }),
  )
  children.push(new docx.Paragraph({ text: '', spacing: { after: 120 } }))
}

function renderList(ctx: DocxCtx, n: DocNode): void {
  const { docx, children, processListItems, nextListId } = ctx
  const ordered = n.props.ordered as boolean | undefined
  const listRef = nextListId()
  processListItems(n, listRef, 0, ordered ?? false)
  children.push(new docx.Paragraph({ text: '', spacing: { after: 60 } }))
}

function renderButtonOrQuote(ctx: DocxCtx, n: DocNode): void {
  const { docx, children } = ctx
  const p = n.props
  const text = getTextContent(n.children)
  if (n.type === 'button') {
    children.push(
      new docx.Paragraph({
        children: [
          new docx.ExternalHyperlink({
            link: sanitizeHref(p.href as string),
            children: [
              new docx.TextRun({
                text,
                bold: true,
                color: '4F46E5',
                underline: { type: docx.UnderlineType.SINGLE },
              }),
            ],
          }),
        ],
        spacing: { after: 120 },
      }),
    )
  } else {
    children.push(
      new docx.Paragraph({
        children: [new docx.TextRun({ text, italics: true, color: '555555' })],
        indent: { left: 720 },
        border: {
          left: {
            style: docx.BorderStyle.SINGLE,
            size: 6,
            color: sanitizeXmlColor(p.borderColor as string, 'DDDDDD'),
          },
        },
        spacing: { after: 120 },
      }),
    )
  }
}

export const docxRenderer: DocumentRenderer = {
  async render(node: DocNode, _options?: RenderOptions): Promise<Uint8Array> {
    let docx: typeof import('docx')
    try {
      docx = await import('docx')
    } catch {
      throw new Error(
        '[@pyreon/document] DOCX renderer requires "docx" package. Install it: bun add docx',
      )
    }
    const children: unknown[] = []
    let listCounter = 0

    function alignmentMap(align?: string): unknown {
      if (!align) return undefined
      const map: Record<string, unknown> = {
        left: docx.AlignmentType.LEFT,
        center: docx.AlignmentType.CENTER,
        right: docx.AlignmentType.RIGHT,
        justify: docx.AlignmentType.JUSTIFIED,
      }
      return map[align]
    }

    function processListItems(n: DocNode, listRef: string, level: number, ordered: boolean): void {
      const items = n.children.filter((c): c is DocNode => typeof c !== 'string')
      for (const item of items) {
        const nestedList = item.children.find(
          (c): c is DocNode => typeof c !== 'string' && (c as DocNode).type === 'list',
        )
        const textChildren = item.children.filter(
          (c) => typeof c === 'string' || (c as DocNode).type !== 'list',
        )
        children.push(
          new docx.Paragraph({
            children: [new docx.TextRun({ text: getTextContent(textChildren) })],
            ...(ordered ? { numbering: { reference: listRef, level } } : { bullet: { level } }),
          }),
        )
        if (nestedList) {
          const nestedOrdered = (nestedList as DocNode).props.ordered as boolean | undefined
          processListItems(nestedList as DocNode, listRef, level + 1, nestedOrdered ?? false)
        }
      }
    }

    const ctx: DocxCtx = {
      docx,
      children,
      alignmentMap,
      processListItems,
      nextListId: () => `list-${listCounter++}`,
    }

    function processNode(n: DocNode): void {
      switch (n.type) {
        case 'document':
        case 'page':
        case 'section':
        case 'row':
        case 'column':
          for (const child of n.children) {
            if (typeof child !== 'string') processNode(child)
            else children.push(new docx.Paragraph({ text: child }))
          }
          break
        case 'heading':
          renderHeading(ctx, n)
          break
        case 'text':
          renderTextNode(ctx, n)
          break
        case 'link':
          renderLink(ctx, n)
          break
        case 'image':
          renderImage(ctx, n)
          break
        case 'table':
          renderDocxTable(ctx, n)
          break
        case 'list':
          renderList(ctx, n)
          break
        case 'code':
          children.push(
            new docx.Paragraph({
              children: [
                new docx.TextRun({
                  text: getTextContent(n.children),
                  font: 'Courier New',
                  size: 20,
                }),
              ],
              shading: { fill: 'F5F5F5', type: docx.ShadingType.SOLID },
              spacing: { after: 120 },
            }),
          )
          break
        case 'divider':
          children.push(
            new docx.Paragraph({
              border: {
                bottom: {
                  style: docx.BorderStyle.SINGLE,
                  size: (n.props.thickness as number | undefined) ?? 1,
                  color: sanitizeXmlColor(n.props.color as string, 'DDDDDD'),
                },
              },
              spacing: { before: 120, after: 120 },
            }),
          )
          break
        case 'spacer':
          children.push(
            new docx.Paragraph({
              text: '',
              spacing: { after: (n.props.height as number) * 20 },
            }),
          )
          break
        case 'button':
        case 'quote':
          renderButtonOrQuote(ctx, n)
          break
      }
    }

    processNode(node)

    // Build numbering configs for all lists
    const numberingConfigs: unknown[] = []
    for (let i = 0; i < listCounter; i++) {
      numberingConfigs.push({
        reference: `list-${i}`,
        levels: Array.from({ length: 9 }, (_, level) => ({
          level,
          format: docx.LevelFormat.DECIMAL,
          text: `%${level + 1}.`,
          alignment: docx.AlignmentType.LEFT,
          style: {
            paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } },
          },
        })),
      })
    }

    // Extract page properties from first page node
    const pageNode =
      node.type === 'document'
        ? (node.children.find(
            (c): c is DocNode => typeof c !== 'string' && (c as DocNode).type === 'page',
          ) as DocNode | undefined)
        : node.type === 'page'
          ? node
          : undefined

    const pageProps = pageNode?.props ?? {}
    const pageDims = getPageSize(
      pageProps.size as PageSize | undefined,
      pageProps.orientation as PageOrientation | undefined,
    )
    const pageMargins = getPageMargins(
      pageProps.margin as number | [number, number] | [number, number, number, number] | undefined,
    )

    function buildHeaderFooter(contentNode: DocNode | undefined): unknown[] | undefined {
      if (!contentNode) return undefined
      const text = getTextContent(contentNode.children)
      if (!text) return undefined
      return [
        new docx.Paragraph({
          children: [new docx.TextRun({ text, size: 18, color: '999999' })],
          alignment: docx.AlignmentType.CENTER,
        }),
      ]
    }

    const headerContent = buildHeaderFooter(pageProps.header as DocNode | undefined)
    const footerContent = buildHeaderFooter(pageProps.footer as DocNode | undefined)

    const sectionProperties: Record<string, unknown> = {}
    if (pageDims) {
      sectionProperties.page = { size: pageDims, margin: pageMargins }
    } else if (pageMargins) {
      sectionProperties.page = { margin: pageMargins }
    }

    const doc = new docx.Document({
      numbering: (numberingConfigs.length > 0 ? { config: numberingConfigs } : undefined) as any,
      sections: [
        {
          properties: sectionProperties,
          ...(headerContent
            ? {
                headers: {
                  default: new docx.Header({ children: headerContent as any }),
                },
              }
            : {}),
          ...(footerContent
            ? {
                footers: {
                  default: new docx.Footer({ children: footerContent as any }),
                },
              }
            : {}),
          children: children as any,
        },
      ],
    })

    const buffer = await docx.Packer.toBuffer(doc)
    return new Uint8Array(buffer)
  },
}
