import type { DocChild, DocNode, DocumentRenderer, RenderOptions, TableColumn } from '../types'

/**
 * PDF renderer — lazy-loads pdfmake on first use.
 * pdfmake handles pagination, tables, text wrapping, and font embedding.
 *
 * @example
 * ```ts
 * import { render, Document, Page, Heading } from '@pyreon/document'
 *
 * const doc = Document({
 *   title: 'Report',
 *   children: Page({ children: Heading({ children: 'Hello' }) }),
 * })
 * const pdf = await render(doc, 'pdf') // → Uint8Array
 * ```
 */

function resolveColumn(col: string | TableColumn): TableColumn {
  return typeof col === 'string' ? { header: col } : col
}

function getTextContent(children: DocChild[]): string {
  return children
    .map((c) => (typeof c === 'string' ? c : getTextContent((c as DocNode).children)))
    .join('')
}

type PdfContent = Record<string, unknown> | string | PdfContent[]

/** pdfmake expects page sizes as `{ width, height }` objects. */
const PAGE_SIZES: Record<string, { width: number; height: number }> = {
  A3: { width: 841.89, height: 1190.55 },
  A4: { width: 595.28, height: 841.89 },
  A5: { width: 419.53, height: 595.28 },
  letter: { width: 612, height: 792 },
  legal: { width: 612, height: 1008 },
  tabloid: { width: 792, height: 1224 },
}

/**
 * Resolve an image `src` for pdfmake.
 *
 * - `data:` URIs are passed through directly (pdfmake supports base64).
 * - `http(s)://` URLs cannot be resolved at render time in the browser.
 *   A placeholder text node is returned instead.
 * - Relative / absolute paths (e.g. `/logo.png`) cannot be resolved without
 *   a server-side fetch, so they are skipped with a placeholder.
 */
function resolveImageSrc(
  src: string,
): { image: string } | { text: string; italics: true; color: string } {
  if (src.startsWith('data:')) {
    return { image: src }
  }
  if (src.startsWith('http://') || src.startsWith('https://')) {
    return { text: `[Image: ${src}]`, italics: true, color: '#999999' }
  }
  // Local path — cannot resolve in browser
  return { text: `[Image: ${src}]`, italics: true, color: '#999999' }
}

function nodeToContent(node: DocNode): PdfContent | PdfContent[] | null {
  const p = node.props

  switch (node.type) {
    case 'document':
    case 'page':
      return node.children
        .map((c) => (typeof c === 'string' ? c : nodeToContent(c)))
        .filter((c): c is PdfContent => c != null)

    case 'section': {
      const content = node.children
        .map((c) => (typeof c === 'string' ? c : nodeToContent(c)))
        .filter((c): c is PdfContent => c != null)
        .flat()

      if (p.direction === 'row') {
        return {
          columns: node.children
            .filter((c): c is DocNode => typeof c !== 'string')
            .map((child) => ({
              stack: [nodeToContent(child)].flat().filter(Boolean),
              width: child.props.width === '*' || !child.props.width ? '*' : child.props.width,
            })),
          columnGap: (p.gap as number) ?? 0,
        }
      }

      return content
    }

    case 'row': {
      return {
        columns: node.children
          .filter((c): c is DocNode => typeof c !== 'string')
          .map((child) => ({
            stack: [nodeToContent(child)].flat().filter(Boolean),
            width: child.props.width ?? '*',
          })),
        columnGap: (p.gap as number) ?? 0,
      }
    }

    case 'column':
      return node.children
        .map((c) => (typeof c === 'string' ? c : nodeToContent(c)))
        .filter((c): c is PdfContent => c != null)
        .flat()

    case 'heading': {
      const level = (p.level as number) ?? 1
      const sizes: Record<number, number> = {
        1: 24,
        2: 20,
        3: 18,
        4: 16,
        5: 14,
        6: 12,
      }
      return {
        text: getTextContent(node.children),
        fontSize: sizes[level] ?? 18,
        bold: true,
        color: (p.color as string) ?? '#000000',
        alignment: (p.align as string) ?? 'left',
        margin: [0, level === 1 ? 0 : 8, 0, 8],
      }
    }

    case 'text':
      return {
        text: getTextContent(node.children),
        fontSize: (p.size as number) ?? 12,
        color: (p.color as string) ?? '#333333',
        bold: p.bold ?? false,
        italics: p.italic ?? false,
        decoration: p.underline ? 'underline' : p.strikethrough ? 'lineThrough' : undefined,
        alignment: (p.align as string) ?? 'left',
        lineHeight: (p.lineHeight as number) ?? 1.4,
        margin: [0, 0, 0, 8],
      }

    case 'link':
      return {
        text: getTextContent(node.children),
        link: p.href as string,
        color: (p.color as string) ?? '#4f46e5',
        decoration: 'underline',
      }

    case 'image': {
      const src = p.src as string
      const resolved = resolveImageSrc(src)

      if ('image' in resolved) {
        const result: Record<string, unknown> = {
          image: resolved.image,
          fit: [p.width ?? 500, p.height ?? 400],
          margin: [0, 0, 0, 8],
        }
        if (p.align === 'center') result.alignment = 'center'
        if (p.align === 'right') result.alignment = 'right'
        return result
      }

      // Placeholder for non-resolvable images
      return { ...resolved, margin: [0, 0, 0, 8] }
    }

    case 'table': {
      const columns = ((p.columns ?? []) as (string | TableColumn)[]).map(resolveColumn)
      const rows = (p.rows ?? []) as (string | number)[][]
      const hs = p.headerStyle as { background?: string; color?: string } | undefined

      const headerRow = columns.map((col) => ({
        text: col.header,
        bold: true,
        fillColor: hs?.background ?? '#f5f5f5',
        color: hs?.color ?? '#000000',
        alignment: col.align ?? 'left',
      }))

      const dataRows = rows.map((row, rowIdx) =>
        columns.map((col, colIdx) => ({
          text: String(row[colIdx] ?? ''),
          alignment: col.align ?? 'left',
          fillColor: p.striped && rowIdx % 2 === 1 ? '#f9f9f9' : undefined,
        })),
      )

      const widths = columns.map((col) => {
        if (!col.width) return '*'
        if (typeof col.width === 'string' && col.width.endsWith('%')) {
          return col.width
        }
        return col.width
      })

      return {
        table: {
          headerRows: 1,
          widths,
          body: [headerRow, ...dataRows],
        },
        layout: p.bordered ? undefined : 'lightHorizontalLines',
        unbreakable: p.keepTogether ?? false,
        margin: [0, 0, 0, 12],
      }
    }

    case 'list': {
      const items = node.children
        .filter((c): c is DocNode => typeof c !== 'string')
        .map((item) => getTextContent(item.children))

      return p.ordered ? { ol: items, margin: [0, 0, 0, 8] } : { ul: items, margin: [0, 0, 0, 8] }
    }

    case 'list-item':
      return getTextContent(node.children)

    case 'code':
      return {
        text: getTextContent(node.children),
        font: 'Courier',
        fontSize: 10,
        background: '#f5f5f5',
        margin: [0, 0, 0, 8],
      }

    case 'page-break':
      return { text: '', pageBreak: 'after' }

    case 'divider':
      return {
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 0,
            x2: 515,
            y2: 0,
            lineWidth: (p.thickness as number) ?? 1,
            lineColor: (p.color as string) ?? '#dddddd',
          },
        ],
        margin: [0, 8, 0, 8],
      }

    case 'spacer':
      return { text: '', margin: [0, (p.height as number) ?? 12, 0, 0] }

    case 'button':
      return {
        text: getTextContent(node.children),
        link: p.href as string,
        bold: true,
        color: (p.color as string) ?? '#ffffff',
        background: (p.background as string) ?? '#4f46e5',
        margin: [0, 8, 0, 8],
      }

    case 'quote':
      return {
        table: {
          widths: [4, '*'],
          body: [
            [
              { text: '', fillColor: (p.borderColor as string) ?? '#dddddd' },
              {
                text: getTextContent(node.children),
                italics: true,
                color: '#555555',
                margin: [8, 4, 0, 4],
              },
            ],
          ],
        },
        layout: 'noBorders',
        margin: [0, 4, 0, 8],
      }

    default:
      return null
  }
}

function resolveMargin(
  margin: number | [number, number] | [number, number, number, number] | undefined,
): [number, number, number, number] {
  if (margin == null) return [40, 40, 40, 40]
  if (typeof margin === 'number') return [margin, margin, margin, margin]
  if (margin.length === 2) return [margin[1], margin[0], margin[1], margin[0]]
  return margin
}

/**
 * Render header/footer DocNodes into pdfmake content for page headers/footers.
 *
 * pdfmake header/footer functions receive `(currentPage, pageCount, pageSize)`
 * and must return a content object. We flatten the DocNode into static content.
 */
function renderHeaderFooter(node: DocNode | undefined): PdfContent | undefined {
  if (!node) return undefined
  const content = nodeToContent(node)
  if (content == null) return undefined
  if (Array.isArray(content)) return { stack: content, margin: [40, 10, 40, 0] }
  if (typeof content === 'object') return { ...content, margin: [40, 10, 40, 0] }
  return { text: content, margin: [40, 10, 40, 0] }
}

export const pdfRenderer: DocumentRenderer = {
  async render(node: DocNode, _options?: RenderOptions): Promise<Uint8Array> {
    // Lazy-load pdfmake — handle ESM/CJS interop
    let pdfMakeModule: any
    let pdfFontsModule: any
    try {
      pdfMakeModule = await import('pdfmake/build/pdfmake')
      pdfFontsModule = await import('pdfmake/build/vfs_fonts')
    } catch {
      throw new Error(
        '[@pyreon/document] PDF renderer requires "pdfmake" package. Install it: bun add pdfmake',
      )
    }

    // Resolve the actual exports (handle .default for ESM wrappers).
    // pdfmake's default export is a singleton instance of browser_extensions_pdfmake.
    // ESM interop may wrap it in an extra .default layer.
    let pdfMake: any = pdfMakeModule.default ?? pdfMakeModule
    if (pdfMake.default && typeof pdfMake.default.createPdf === 'function') {
      pdfMake = pdfMake.default
    }
    const pdfFonts: any = pdfFontsModule.default ?? pdfFontsModule

    // Assign virtual filesystem for fonts
    if (pdfMake.vfs == null) {
      pdfMake.vfs = pdfFonts.pdfMake?.vfs ?? pdfFonts.vfs
    }

    // Find page config
    const pageNode = node.children.find(
      (c): c is DocNode => typeof c !== 'string' && c.type === 'page',
    )
    const pageSize = (pageNode?.props.size as string) ?? 'A4'
    const pageOrientation = (pageNode?.props.orientation as string) ?? 'portrait'
    const pageMargin = resolveMargin(
      pageNode?.props.margin as
        | number
        | [number, number]
        | [number, number, number, number]
        | undefined,
    )

    const content = [nodeToContent(node)].flat().filter(Boolean) as PdfContent[]

    // Build header/footer from PageProps if present
    const headerFn = renderHeaderFooter(pageNode?.props.header as DocNode | undefined)
    const footerFn = renderHeaderFooter(pageNode?.props.footer as DocNode | undefined)

    const docDefinition: Record<string, unknown> = {
      pageSize: PAGE_SIZES[pageSize] ?? PAGE_SIZES.A4,
      pageOrientation,
      pageMargins: pageMargin,
      info: {
        title: (node.props.title as string) ?? '',
        author: (node.props.author as string) ?? '',
        subject: (node.props.subject as string) ?? '',
        keywords: (node.props.keywords as string[])?.join(', ') ?? '',
      },
      content,
      defaultStyle: {
        fontSize: 12,
        lineHeight: 1.4,
      },
      // Keep sections together — break before a heading if it would be
      // orphaned at the bottom of a page.
      pageBreakBefore: (
        currentNode: { headlineLevel?: number },
        helpers: { getFollowingNodesOnPage?: () => unknown[] },
      ) => {
        if (currentNode.headlineLevel && helpers.getFollowingNodesOnPage) {
          const following = helpers.getFollowingNodesOnPage()
          if (following.length === 0) return true
        }
        return false
      },
    }

    if (headerFn) docDefinition.header = headerFn
    if (footerFn) docDefinition.footer = footerFn

    try {
      const pdf = pdfMake.createPdf(docDefinition)
      const buffer = await pdf.getBuffer()
      return new Uint8Array(buffer)
    } catch (err) {
      throw new Error(`[@pyreon/document] PDF generation failed: ${err}`)
    }
  },
}
