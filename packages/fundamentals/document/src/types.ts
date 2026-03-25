// ─── Node Types ─────────────────────────────────────────────────────────────

export type NodeType =
  | "document"
  | "page"
  | "section"
  | "row"
  | "column"
  | "heading"
  | "text"
  | "link"
  | "image"
  | "table"
  | "list"
  | "list-item"
  | "page-break"
  | "code"
  | "divider"
  | "spacer"
  | "button"
  | "quote"

/** A format-agnostic document node. */
export interface DocNode {
  type: NodeType
  props: Record<string, unknown>
  children: DocChild[]
  /** Resolved styles from ui-system connector (optional). */
  styles?: ResolvedStyles
}

export type DocChild = DocNode | string

// ─── Style Types ────────────────────────────────────────────────────────────

export interface ResolvedStyles {
  fontSize?: number
  fontFamily?: string
  fontWeight?: "normal" | "bold" | number
  fontStyle?: "normal" | "italic"
  textDecoration?: "none" | "underline" | "line-through"
  color?: string
  backgroundColor?: string
  textAlign?: "left" | "center" | "right" | "justify"
  lineHeight?: number
  letterSpacing?: number
  padding?: number | [number, number] | [number, number, number, number]
  margin?: number | [number, number] | [number, number, number, number]
  borderRadius?: number
  borderWidth?: number
  borderColor?: string
  borderStyle?: "solid" | "dashed" | "dotted"
  width?: number | string
  height?: number | string
  maxWidth?: number | string
  opacity?: number
}

// ─── Component Props ────────────────────────────────────────────────────────

export interface DocumentProps {
  title?: string
  author?: string
  subject?: string
  keywords?: string[]
  language?: string
  children?: unknown
}

export type PageSize = "A4" | "A3" | "A5" | "letter" | "legal" | "tabloid"
export type PageOrientation = "portrait" | "landscape"

export interface PageProps {
  size?: PageSize
  orientation?: PageOrientation
  margin?: number | [number, number] | [number, number, number, number]
  children?: unknown
  /** Header content for this page (PDF/DOCX). */
  header?: DocNode
  /** Footer content for this page (PDF/DOCX). */
  footer?: DocNode
}

export interface SectionProps {
  direction?: "column" | "row"
  gap?: number
  padding?: number | [number, number] | [number, number, number, number]
  background?: string
  borderRadius?: number
  border?: string
  children?: unknown
}

export interface RowProps {
  gap?: number
  align?: "start" | "center" | "end" | "stretch"
  children?: unknown
}

export interface ColumnProps {
  width?: number | string
  align?: "start" | "center" | "end"
  children?: unknown
}

export interface HeadingProps {
  level?: 1 | 2 | 3 | 4 | 5 | 6
  color?: string
  align?: "left" | "center" | "right"
  children?: unknown
}

export interface TextProps {
  size?: number
  color?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  align?: "left" | "center" | "right" | "justify"
  lineHeight?: number
  children?: unknown
}

export interface LinkProps {
  href: string
  color?: string
  children?: unknown
}

export interface ImageProps {
  src: string
  width?: number
  height?: number
  alt?: string
  align?: "left" | "center" | "right"
  caption?: string
}

export interface TableColumn {
  header: string
  width?: number | string
  align?: "left" | "center" | "right"
}

export interface TableProps {
  columns: (string | TableColumn)[]
  rows: (string | number)[][]
  headerStyle?: {
    background?: string
    color?: string
    bold?: boolean
  }
  striped?: boolean
  bordered?: boolean
  caption?: string
  /** Keep table together on one page — avoid page breaks within table (PDF/DOCX). */
  keepTogether?: boolean
}

export interface ListProps {
  ordered?: boolean
  children?: unknown
}

export interface ListItemProps {
  children?: unknown
}

export interface CodeProps {
  language?: string
  children?: unknown
}

export interface DividerProps {
  color?: string
  thickness?: number
}

export interface SpacerProps {
  height: number
}

export interface ButtonProps {
  href: string
  background?: string
  color?: string
  borderRadius?: number
  padding?: number | [number, number]
  align?: "left" | "center" | "right"
  children?: unknown
}

export interface QuoteProps {
  borderColor?: string
  children?: unknown
}

// ─── Render Types ───────────────────────────────────────────────────────────

export type OutputFormat =
  | "html"
  | "pdf"
  | "docx"
  | "pptx"
  | "email"
  | "xlsx"
  | "md"
  | "text"
  | "csv"
  | "svg"
  | "slack"
  | "teams"
  | "discord"
  | "telegram"
  | "notion"
  | "confluence"
  | "whatsapp"
  | "google-chat"

export interface RenderOptions {
  /** Custom styles to apply (overrides component styles). */
  styles?: Record<string, ResolvedStyles>
  /** Base URL for relative image sources. */
  baseUrl?: string
  /** Text direction — 'ltr' (default) or 'rtl'. */
  direction?: "ltr" | "rtl"
  /** Custom font configuration for PDF. */
  fonts?: Record<string, { normal?: string; bold?: string; italics?: string; bolditalics?: string }>
}

export type RenderResult = string | Uint8Array

/** A document renderer that converts a node tree to a specific format. */
export interface DocumentRenderer {
  render(node: DocNode, options?: RenderOptions): Promise<RenderResult>
}

// ─── Builder Types ──────────────────────────────────────────────────────────

export interface DocumentBuilder {
  heading(text: string, props?: Omit<HeadingProps, "children">): DocumentBuilder
  text(text: string, props?: Omit<TextProps, "children">): DocumentBuilder
  paragraph(text: string, props?: Omit<TextProps, "children">): DocumentBuilder
  image(src: string, props?: Omit<ImageProps, "src">): DocumentBuilder
  table(props: TableProps): DocumentBuilder
  list(items: string[], props?: Omit<ListProps, "children">): DocumentBuilder
  code(text: string, props?: Omit<CodeProps, "children">): DocumentBuilder
  divider(props?: DividerProps): DocumentBuilder
  spacer(height: number): DocumentBuilder
  quote(text: string, props?: Omit<QuoteProps, "children">): DocumentBuilder
  button(text: string, props: Omit<ButtonProps, "children">): DocumentBuilder
  link(text: string, props: Omit<LinkProps, "children">): DocumentBuilder
  pageBreak(): DocumentBuilder
  /** Add a chart snapshot from a @pyreon/charts instance. */
  chart(
    instance: unknown,
    props?: { width?: number; height?: number; caption?: string },
  ): DocumentBuilder
  /** Add a flow diagram snapshot from a @pyreon/flow instance. */
  flow(
    instance: unknown,
    props?: { width?: number; height?: number; caption?: string },
  ): DocumentBuilder
  /** Build the document node tree. */
  build(): DocNode
  /** Render to a specific format. */
  toHtml(options?: RenderOptions): Promise<string>
  toPdf(options?: RenderOptions): Promise<Uint8Array>
  toDocx(options?: RenderOptions): Promise<Uint8Array>
  toPptx(options?: RenderOptions): Promise<Uint8Array>
  toEmail(options?: RenderOptions): Promise<string>
  toXlsx(options?: RenderOptions): Promise<Uint8Array>
  toMarkdown(options?: RenderOptions): Promise<string>
  toText(options?: RenderOptions): Promise<string>
  toCsv(options?: RenderOptions): Promise<string>
  toSlack(options?: RenderOptions): Promise<string>
  toSvg(options?: RenderOptions): Promise<string>
  toTeams(options?: RenderOptions): Promise<string>
  toDiscord(options?: RenderOptions): Promise<string>
  toTelegram(options?: RenderOptions): Promise<string>
  toNotion(options?: RenderOptions): Promise<string>
  toConfluence(options?: RenderOptions): Promise<string>
  toWhatsApp(options?: RenderOptions): Promise<string>
  toGoogleChat(options?: RenderOptions): Promise<string>
  /** Download the document (browser only). */
  download(filename: string, options?: RenderOptions): Promise<void>
}
