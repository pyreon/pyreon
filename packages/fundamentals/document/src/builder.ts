import { download } from "./download"
import {
  Button,
  Code,
  Divider,
  Document,
  Heading,
  Image,
  Link,
  List,
  ListItem,
  Page,
  PageBreak,
  Quote,
  Section,
  Spacer,
  Table,
  Text,
} from "./nodes"
import { render } from "./render"
import type {
  ButtonProps,
  CodeProps,
  DividerProps,
  DocNode,
  DocumentBuilder,
  DocumentProps,
  HeadingProps,
  ImageProps,
  LinkProps,
  ListProps,
  QuoteProps,
  RenderOptions,
  TableProps,
  TextProps,
} from "./types"

/**
 * Create a document using the builder pattern — no JSX needed.
 *
 * @example
 * ```ts
 * const doc = createDocument({ title: 'Report' })
 *   .heading('Sales Report')
 *   .text('Q4 performance summary.')
 *   .table({ columns: ['Region', 'Revenue'], rows: [['US', '$1M']] })
 *
 * await doc.toPdf()
 * await doc.download('report.pdf')
 * ```
 */
export function createDocument(props: DocumentProps = {}): DocumentBuilder {
  const sections: DocNode[] = []

  function getNode(): DocNode {
    return Document({ ...props, children: [Page({ children: sections })] })
  }

  const builder: DocumentBuilder = {
    heading(text: string, p?: Omit<HeadingProps, "children">) {
      sections.push(Heading({ ...p, children: text }))
      return builder
    },

    text(text: string, p?: Omit<TextProps, "children">) {
      sections.push(Text({ ...p, children: text }))
      return builder
    },

    paragraph(text: string, p?: Omit<TextProps, "children">) {
      return builder.text(text, p)
    },

    image(src: string, p?: Omit<ImageProps, "src">) {
      sections.push(Image({ src, ...p }))
      return builder
    },

    table(p: TableProps) {
      sections.push(Table(p))
      return builder
    },

    list(items: string[], p?: Omit<ListProps, "children">) {
      sections.push(
        List({
          ...p,
          children: items.map((item) => ListItem({ children: item })),
        }),
      )
      return builder
    },

    code(text: string, p?: Omit<CodeProps, "children">) {
      sections.push(Code({ ...p, children: text }))
      return builder
    },

    divider(p?: DividerProps) {
      sections.push(Divider(p))
      return builder
    },

    spacer(height: number) {
      sections.push(Spacer({ height }))
      return builder
    },

    quote(text: string, p?: Omit<QuoteProps, "children">) {
      sections.push(Quote({ ...p, children: text }))
      return builder
    },

    button(text: string, p: Omit<ButtonProps, "children">) {
      sections.push(Button({ ...p, children: text }))
      return builder
    },

    link(text: string, p: Omit<LinkProps, "children">) {
      sections.push(Link({ ...p, children: text }))
      return builder
    },

    pageBreak() {
      sections.push(PageBreak())
      return builder
    },

    add(node) {
      if (Array.isArray(node)) {
        sections.push(...node)
      } else {
        sections.push(node)
      }
      return builder
    },

    section(children) {
      sections.push(Section({ children }))
      return builder
    },

    chart(instance: unknown, p?: { width?: number; height?: number; caption?: string }) {
      // Try to get data URL from chart instance
      const inst = instance as { getDataURL?: (opts: unknown) => string }
      if (inst?.getDataURL) {
        const dataUrl = inst.getDataURL({ type: "png", pixelRatio: 2 })
        sections.push(
          Image({
            src: dataUrl,
            ...(p?.width != null ? { width: p.width } : {}),
            ...(p?.height != null ? { height: p.height } : {}),
            ...(p?.caption != null ? { caption: p.caption } : {}),
          }),
        )
      } else {
        sections.push(
          Text({
            children: "[Chart]",
            italic: true,
            color: "#999",
          } as TextProps & { children: string }),
        )
      }
      return builder
    },

    flow(instance: unknown, p?: { width?: number; height?: number; caption?: string }) {
      // Try to get SVG from flow instance
      const inst = instance as { toSVG?: () => string }
      if (inst?.toSVG) {
        const svg = inst.toSVG()
        sections.push(
          Image({
            src: `data:image/svg+xml,${encodeURIComponent(svg)}`,
            ...(p?.width != null ? { width: p.width } : {}),
            ...(p?.height != null ? { height: p.height } : {}),
            ...(p?.caption != null ? { caption: p.caption } : {}),
          }),
        )
      } else {
        sections.push(
          Text({
            children: "[Flow Diagram]",
            italic: true,
            color: "#999",
          } as TextProps & { children: string }),
        )
      }
      return builder
    },

    build() {
      return getNode()
    },

    async toHtml(options?: RenderOptions) {
      return render(getNode(), "html", options) as Promise<string>
    },

    async toPdf(options?: RenderOptions) {
      return render(getNode(), "pdf", options) as Promise<Uint8Array>
    },

    async toDocx(options?: RenderOptions) {
      return render(getNode(), "docx", options) as Promise<Uint8Array>
    },

    async toEmail(options?: RenderOptions) {
      return render(getNode(), "email", options) as Promise<string>
    },

    async toPptx(options?: RenderOptions) {
      return render(getNode(), "pptx", options) as Promise<Uint8Array>
    },

    async toXlsx(options?: RenderOptions) {
      return render(getNode(), "xlsx", options) as Promise<Uint8Array>
    },

    async toMarkdown(options?: RenderOptions) {
      return render(getNode(), "md", options) as Promise<string>
    },

    async toText(options?: RenderOptions) {
      return render(getNode(), "text", options) as Promise<string>
    },

    async toCsv(options?: RenderOptions) {
      return render(getNode(), "csv", options) as Promise<string>
    },

    async toSlack(options?: RenderOptions) {
      return render(getNode(), "slack", options) as Promise<string>
    },

    async toSvg(options?: RenderOptions) {
      return render(getNode(), "svg", options) as Promise<string>
    },

    async toTeams(options?: RenderOptions) {
      return render(getNode(), "teams", options) as Promise<string>
    },

    async toDiscord(options?: RenderOptions) {
      return render(getNode(), "discord", options) as Promise<string>
    },

    async toTelegram(options?: RenderOptions) {
      return render(getNode(), "telegram", options) as Promise<string>
    },

    async toNotion(options?: RenderOptions) {
      return render(getNode(), "notion", options) as Promise<string>
    },

    async toConfluence(options?: RenderOptions) {
      return render(getNode(), "confluence", options) as Promise<string>
    },

    async toWhatsApp(options?: RenderOptions) {
      return render(getNode(), "whatsapp", options) as Promise<string>
    },

    async toGoogleChat(options?: RenderOptions) {
      return render(getNode(), "google-chat", options) as Promise<string>
    },

    async download(filename: string, options?: RenderOptions) {
      return download(getNode(), filename, options)
    },
  }

  return builder
}
