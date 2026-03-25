import { sanitizeHref, sanitizeImageSrc, sanitizeXmlColor } from "../sanitize"
import type { DocChild, DocNode, DocumentRenderer, RenderOptions, TableColumn } from "../types"

/**
 * PPTX renderer — lazy-loads pptxgenjs on first use.
 * Each `<Page>` becomes a slide. Document nodes map to PPTX elements.
 *
 * @example
 * ```ts
 * import { render, Document, Page, Heading, Text } from '@pyreon/document'
 *
 * const doc = Document({
 *   title: 'Presentation',
 *   children: [
 *     Page({ children: [Heading({ children: 'Slide 1' }), Text({ children: 'Hello' })] }),
 *     Page({ children: [Heading({ children: 'Slide 2' })] }),
 *   ],
 * })
 * const pptx = await render(doc, 'pptx') // → Uint8Array
 * ```
 */

function resolveColumn(col: string | TableColumn): TableColumn {
  return typeof col === "string" ? { header: col } : col
}

function getTextContent(children: DocChild[]): string {
  return children
    .map((c) => (typeof c === "string" ? c : getTextContent((c as DocNode).children)))
    .join("")
}

/** Vertical position tracker for placing elements on a slide. */
interface SlideContext {
  slide: PptxSlide
  y: number
}

// Duck-typed pptxgenjs interfaces to avoid hard dependency on types
interface PptxSlide {
  addText(text: string | PptxTextProps[], opts?: Record<string, unknown>): void
  addImage(opts: Record<string, unknown>): void
  addTable(rows: unknown[][], opts?: Record<string, unknown>): void
}

interface PptxTextProps {
  text: string
  options?: Record<string, unknown>
}

interface PptxGen {
  addSlide(): PptxSlide
  write(outputType: string): Promise<unknown>
  title: string
  author: string
  subject: string
}

const HEADING_SIZES: Record<number, number> = {
  1: 28,
  2: 24,
  3: 20,
  4: 18,
  5: 16,
  6: 14,
}

const SLIDE_WIDTH = 10 // inches
const CONTENT_MARGIN = 0.5
const CONTENT_WIDTH = SLIDE_WIDTH - CONTENT_MARGIN * 2

function processNode(node: DocNode, ctx: SlideContext): void {
  const p = node.props

  switch (node.type) {
    case "heading": {
      const level = (p.level as number) ?? 1
      const fontSize = HEADING_SIZES[level] ?? 20
      ctx.slide.addText(getTextContent(node.children), {
        x: CONTENT_MARGIN,
        y: ctx.y,
        w: CONTENT_WIDTH,
        h: 0.6,
        fontSize,
        bold: true,
        color: sanitizeXmlColor((p.color as string) ?? "#000000"),
        align: (p.align as string) ?? "left",
      })
      ctx.y += 0.7
      break
    }

    case "text": {
      const text = getTextContent(node.children)
      ctx.slide.addText(text, {
        x: CONTENT_MARGIN,
        y: ctx.y,
        w: CONTENT_WIDTH,
        h: 0.4,
        fontSize: (p.size as number) ?? 14,
        bold: p.bold ?? false,
        italic: p.italic ?? false,
        underline: p.underline ? { style: "sng" } : undefined,
        strike: p.strikethrough ? "sngStrike" : undefined,
        color: sanitizeXmlColor((p.color as string) ?? "#333333"),
        align: (p.align as string) ?? "left",
      })
      ctx.y += 0.5
      break
    }

    case "image": {
      const src = sanitizeImageSrc(p.src as string)
      const w = Math.min(((p.width as number) ?? 400) / 96, CONTENT_WIDTH)
      const h = ((p.height as number) ?? 300) / 96

      if (src.startsWith("data:")) {
        ctx.slide.addImage({
          data: src,
          x: CONTENT_MARGIN,
          y: ctx.y,
          w,
          h,
        })
        ctx.y += h + 0.2
      }
      // HTTP URLs and local paths are not supported — skip silently
      break
    }

    case "table": {
      const columns = ((p.columns ?? []) as (string | TableColumn)[]).map(resolveColumn)
      const rows = (p.rows ?? []) as (string | number)[][]
      const hs = p.headerStyle as { background?: string; color?: string } | undefined

      const headerRow = columns.map((col) => ({
        text: col.header,
        options: {
          bold: true,
          fill: { color: sanitizeXmlColor(hs?.background ?? "#f5f5f5") },
          color: sanitizeXmlColor(hs?.color ?? "#000000"),
          align: col.align ?? "left",
          fontSize: 12,
        },
      }))

      const dataRows = rows.map((row, rowIdx) =>
        columns.map((col, colIdx) => ({
          text: String(row[colIdx] ?? ""),
          options: {
            align: col.align ?? "left",
            fontSize: 11,
            fill: p.striped && rowIdx % 2 === 1 ? { color: "F9F9F9" } : undefined,
          },
        })),
      )

      const allRows = [headerRow, ...dataRows]
      const rowHeight = 0.35
      const tableHeight = allRows.length * rowHeight

      ctx.slide.addTable(allRows, {
        x: CONTENT_MARGIN,
        y: ctx.y,
        w: CONTENT_WIDTH,
        border: { pt: 0.5, color: "DDDDDD" },
        rowH: rowHeight,
      })
      ctx.y += tableHeight + 0.2
      break
    }

    case "list": {
      const items = node.children
        .filter((c): c is DocNode => typeof c !== "string")
        .map((item) => getTextContent(item.children))

      const isOrdered = p.ordered as boolean
      const listText = items.map((item, i) => ({
        text: isOrdered ? `${i + 1}. ${item}\n` : `\u2022 ${item}\n`,
        options: { fontSize: 13, bullet: false },
      }))

      ctx.slide.addText(listText, {
        x: CONTENT_MARGIN,
        y: ctx.y,
        w: CONTENT_WIDTH,
        h: items.length * 0.35,
      })
      ctx.y += items.length * 0.35 + 0.1
      break
    }

    case "code": {
      const text = getTextContent(node.children)
      ctx.slide.addText(text, {
        x: CONTENT_MARGIN,
        y: ctx.y,
        w: CONTENT_WIDTH,
        h: 0.5,
        fontSize: 10,
        fontFace: "Courier New",
        fill: { color: "F5F5F5" },
        color: "333333",
      })
      ctx.y += 0.6
      break
    }

    case "quote": {
      const text = getTextContent(node.children)
      ctx.slide.addText(text, {
        x: CONTENT_MARGIN + 0.3,
        y: ctx.y,
        w: CONTENT_WIDTH - 0.3,
        h: 0.5,
        fontSize: 13,
        italic: true,
        color: "555555",
      })
      ctx.y += 0.6
      break
    }

    case "link": {
      ctx.slide.addText(getTextContent(node.children), {
        x: CONTENT_MARGIN,
        y: ctx.y,
        w: CONTENT_WIDTH,
        h: 0.4,
        fontSize: 13,
        color: "4F46E5",
        underline: { style: "sng" },
        hyperlink: { url: sanitizeHref(p.href as string) },
      })
      ctx.y += 0.5
      break
    }

    case "button": {
      ctx.slide.addText(getTextContent(node.children), {
        x: CONTENT_MARGIN,
        y: ctx.y,
        w: 3,
        h: 0.5,
        fontSize: 14,
        bold: true,
        color: sanitizeXmlColor((p.color as string) ?? "#ffffff"),
        fill: {
          color: sanitizeXmlColor((p.background as string) ?? "#4f46e5"),
        },
        align: "center",
        hyperlink: { url: sanitizeHref(p.href as string) },
      })
      ctx.y += 0.6
      break
    }

    case "spacer": {
      ctx.y += ((p.height as number) ?? 12) / 72
      break
    }

    case "divider": {
      // Render as a thin line using a text element with top border
      ctx.slide.addText("", {
        x: CONTENT_MARGIN,
        y: ctx.y,
        w: CONTENT_WIDTH,
        h: 0.02,
        fill: { color: sanitizeXmlColor((p.color as string) ?? "#DDDDDD") },
      })
      ctx.y += 0.2
      break
    }

    // Container types — recurse into children
    case "section":
    case "row":
    case "column":
      for (const child of node.children) {
        if (typeof child !== "string") {
          processNode(child, ctx)
        }
      }
      break

    default:
      break
  }
}

function processSlide(pageNode: DocNode, pptx: PptxGen): void {
  const slide = pptx.addSlide()
  const ctx: SlideContext = { slide, y: CONTENT_MARGIN }

  for (const child of pageNode.children) {
    if (typeof child !== "string") {
      processNode(child, ctx)
    }
  }
}

export const pptxRenderer: DocumentRenderer = {
  async render(node: DocNode, _options?: RenderOptions): Promise<Uint8Array> {
    let PptxGenJS: any
    try {
      PptxGenJS = await import("pptxgenjs")
    } catch {
      throw new Error(
        '[@pyreon/document] PPTX renderer requires "pptxgenjs" package. Install it: bun add pptxgenjs',
      )
    }
    const PptxGenClass = PptxGenJS.default ?? PptxGenJS

    const pptx = new PptxGenClass() as PptxGen

    // Set metadata
    if (node.props.title) pptx.title = node.props.title as string
    if (node.props.author) pptx.author = node.props.author as string
    if (node.props.subject) pptx.subject = node.props.subject as string

    // Collect pages — each becomes a slide
    const pages: DocNode[] = []
    for (const child of node.children) {
      if (typeof child !== "string" && child.type === "page") {
        pages.push(child)
      }
    }

    // If no explicit pages, treat entire document content as one slide
    if (pages.length === 0) {
      const syntheticPage: DocNode = {
        type: "page",
        props: {},
        children: node.children,
      }
      pages.push(syntheticPage)
    }

    for (const page of pages) {
      processSlide(page, pptx)
    }

    const output = await pptx.write("arraybuffer")
    return new Uint8Array(output as ArrayBuffer)
  },
}
