import type {
  ButtonProps,
  CodeProps,
  ColumnProps,
  DividerProps,
  DocChild,
  DocNode,
  DocumentProps,
  HeadingProps,
  ImageProps,
  LinkProps,
  ListItemProps,
  ListProps,
  NodeType,
  PageProps,
  QuoteProps,
  RowProps,
  SectionProps,
  SpacerProps,
  TableProps,
  TextProps,
} from './types'

// ─── Node Constructor ───────────────────────────────────────────────────────

function createNode(type: NodeType, props: object, children: unknown): DocNode {
  return {
    type,
    props: props as Record<string, unknown>,
    children: normalizeChildren(children),
  }
}

function normalizeChildren(children: unknown): DocChild[] {
  if (children == null || children === false) return []
  if (typeof children === 'string') return [children]
  if (typeof children === 'number') return [String(children)]
  if (Array.isArray(children)) return children.flatMap(normalizeChildren)
  if (isDocNode(children)) return [children]
  if (typeof children === 'object') {
    throw new Error(
      '[@pyreon/document] Invalid child: plain objects are not valid document children. Use a document node (Text, Heading, etc.) instead.',
    )
  }
  return [String(children)]
}

/** Type guard — checks if a value is a DocNode. */
export function isDocNode(value: unknown): value is DocNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'props' in value &&
    'children' in value
  )
}

// ─── Document Primitives ────────────────────────────────────────────────────

/**
 * Root document container. Holds metadata and pages.
 *
 * @example
 * ```tsx
 * <Document title="Invoice #1234" author="Acme Corp">
 *   <Page>...</Page>
 * </Document>
 * ```
 */
export function Document(props: DocumentProps): DocNode {
  const { children, ...rest } = props
  return createNode('document', rest, children)
}
Document._documentType = 'document' as const

/**
 * Page container. Maps to a PDF page, DOCX section, or email block.
 *
 * @example
 * ```tsx
 * <Page size="A4" margin={40}>
 *   <Heading>Title</Heading>
 * </Page>
 * ```
 */
export function Page(props: PageProps): DocNode {
  const { children, ...rest } = props
  return createNode('page', rest, children)
}
Page._documentType = 'page' as const

/**
 * Layout section — groups content with optional direction, padding, background.
 *
 * @example
 * ```tsx
 * <Section background="#f5f5f5" padding={20} direction="row" gap={12}>
 *   <Text>Left</Text>
 *   <Text>Right</Text>
 * </Section>
 * ```
 */
export function Section(props: SectionProps): DocNode {
  const { children, ...rest } = props
  return createNode('section', rest, children)
}
Section._documentType = 'section' as const

/**
 * Horizontal layout container.
 *
 * @example
 * ```tsx
 * <Row gap={20}>
 *   <Column width="60%"><Text>Main</Text></Column>
 *   <Column width="40%"><Text>Side</Text></Column>
 * </Row>
 * ```
 */
export function Row(props: RowProps): DocNode {
  const { children, ...rest } = props
  return createNode('row', rest, children)
}
Row._documentType = 'row' as const

/**
 * Column within a Row.
 */
export function Column(props: ColumnProps): DocNode {
  const { children, ...rest } = props
  return createNode('column', rest, children)
}
Column._documentType = 'column' as const

/**
 * Heading text (h1–h6).
 *
 * @example
 * ```tsx
 * <Heading level={1}>Invoice #1234</Heading>
 * <Heading level={2} color="#666">Details</Heading>
 * ```
 */
export function Heading(props: HeadingProps): DocNode {
  const { children, ...rest } = props
  return createNode('heading', { level: 1, ...rest }, children)
}
Heading._documentType = 'heading' as const

/**
 * Text paragraph with optional formatting.
 *
 * @example
 * ```tsx
 * <Text bold size={14} color="#333">Hello World</Text>
 * <Text italic align="right">Subtotal: $100</Text>
 * ```
 */
export function Text(props: TextProps): DocNode {
  const { children, ...rest } = props
  return createNode('text', rest, children)
}
Text._documentType = 'text' as const

/**
 * Hyperlink.
 *
 * @example
 * ```tsx
 * <Link href="https://example.com">Visit site</Link>
 * ```
 */
export function Link(props: LinkProps): DocNode {
  const { children, ...rest } = props
  return createNode('link', rest, children)
}
Link._documentType = 'link' as const

/**
 * Image with optional sizing and caption.
 *
 * @example
 * ```tsx
 * <Image src="/logo.png" width={120} alt="Company Logo" />
 * <Image src={chartDataUrl} width={500} caption="Revenue Chart" />
 * ```
 */
export function Image(props: ImageProps): DocNode {
  return createNode('image', props, [])
}
Image._documentType = 'image' as const

/**
 * Data table with columns and rows.
 *
 * @example
 * ```tsx
 * <Table
 *   columns={['Name', 'Price', 'Qty']}
 *   rows={[['Widget', '$10', '5'], ['Gadget', '$20', '3']]}
 *   striped
 *   headerStyle={{ background: '#1a1a2e', color: '#fff' }}
 * />
 * ```
 */
export function Table(props: TableProps): DocNode {
  return createNode('table', props, [])
}
Table._documentType = 'table' as const

/**
 * Ordered or unordered list.
 *
 * @example
 * ```tsx
 * <List ordered>
 *   <ListItem>First item</ListItem>
 *   <ListItem>Second item</ListItem>
 * </List>
 * ```
 */
export function List(props: ListProps): DocNode {
  const { children, ...rest } = props
  return createNode('list', rest, children)
}
List._documentType = 'list' as const

/**
 * Single list item within a List.
 */
export function ListItem(props: ListItemProps): DocNode {
  const { children } = props
  return createNode('list-item', {}, children)
}
ListItem._documentType = 'list-item' as const

/**
 * Code block with optional language hint.
 *
 * @example
 * ```tsx
 * <Code language="typescript">const x = 42</Code>
 * ```
 */
export function Code(props: CodeProps): DocNode {
  const { children, ...rest } = props
  return createNode('code', rest, children)
}
Code._documentType = 'code' as const

/**
 * Horizontal divider line.
 *
 * @example
 * ```tsx
 * <Divider color="#ddd" thickness={2} />
 * ```
 */
export function Divider(props: DividerProps = {}): DocNode {
  return createNode('divider', props, [])
}
Divider._documentType = 'divider' as const

/**
 * Page break — forces content after this point to the next page (PDF/DOCX)
 * or inserts a visual separator (HTML/email).
 *
 * @example
 * ```tsx
 * <PageBreak />
 * ```
 */
export function PageBreak(): DocNode {
  return createNode('page-break', {}, [])
}
PageBreak._documentType = 'page-break' as const

/**
 * Vertical spacer.
 *
 * @example
 * ```tsx
 * <Spacer height={20} />
 * ```
 */
export function Spacer(props: SpacerProps): DocNode {
  return createNode('spacer', props, [])
}
Spacer._documentType = 'spacer' as const

/**
 * CTA button — renders as a bulletproof button in email, styled link in PDF/DOCX.
 *
 * @example
 * ```tsx
 * <Button href="https://acme.com/pay" background="#4f46e5" color="#fff">
 *   Pay Now
 * </Button>
 * ```
 */
export function Button(props: ButtonProps): DocNode {
  const { children, ...rest } = props
  return createNode('button', rest, children)
}
Button._documentType = 'button' as const

/**
 * Block quote.
 *
 * @example
 * ```tsx
 * <Quote borderColor="#4f46e5">This is a quote.</Quote>
 * ```
 */
export function Quote(props: QuoteProps): DocNode {
  const { children, ...rest } = props
  return createNode('quote', rest, children)
}
Quote._documentType = 'quote' as const
