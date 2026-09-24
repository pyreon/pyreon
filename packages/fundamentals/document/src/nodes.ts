import type {
  ButtonProps,
  CodeProps,
  ColumnProps,
  DividerProps,
  DocChild,
  DocNode,
  DocPrimitive,
  DocumentProps,
  HeadingProps,
  ImageProps,
  LinkProps,
  ListItemProps,
  ListProps,
  NodeType,
  OptionalPropsDocPrimitive,
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

// ─── VNode (JSX / `h()`) resolution ───────────────────────────────────────
//
// The primitives are eager factories returning a `DocNode`. Composed through
// the Pyreon JSX runtime (or `h()`), they are NOT invoked — the runtime builds
// a VNode `{ type: <the primitive function>, props, children, key }` and
// leaves invocation to a renderer. A document tree is rendered by `render()`,
// not mounted, so this module is that renderer's resolution step: invoke
// component types (the primitives AND user components that return them) with
// Pyreon's children-merge semantics, flatten fragments, and snapshot accessor
// children. Before this existed a VNode passed the old structural `isDocNode`
// check, no renderer recognised a function `type`, and every format emitted
// the children's concatenated text with no structure at all.
//
// Symbols come from the GLOBAL registry so no runtime import of
// `@pyreon/core` is needed (and a dual-instance split can't break matching).
const FRAGMENT = Symbol.for('Pyreon.Fragment')
const REACTIVE_PROP = Symbol.for('pyreon.reactiveProp')

interface VNodeLike {
  type: unknown
  props: Record<string, unknown> | null
  children?: unknown
}

/** A Pyreon VNode (from `h()` / the JSX runtime). DocNodes never carry `key`. */
function isVNodeLike(value: object): value is VNodeLike {
  return 'type' in value && 'props' in value && 'children' in value && 'key' in value
}

/**
 * Resolve a component's props the way the mount pipeline does before calling
 * it: compiler-emitted `_rp`/`_lc` thunks (branded `REACTIVE_PROP`) become
 * their value — a document render is a one-shot snapshot — and h()-style rest
 * children are merged into `props.children` (one child → the child itself).
 */
function componentProps(vnode: VNodeLike): Record<string, unknown> {
  const raw = vnode.props ?? {}
  const props: Record<string, unknown> = {}
  for (const key of Object.keys(raw)) {
    const val = raw[key]
    props[key] =
      typeof val === 'function' && (val as unknown as Record<symbol, unknown>)[REACTIVE_PROP]
        ? (val as () => unknown)()
        : val
  }
  const rest = Array.isArray(vnode.children) ? vnode.children : []
  if (rest.length > 0) props.children = rest.length === 1 ? rest[0] : rest
  return props
}

function resolveVNode(vnode: VNodeLike): DocChild[] {
  const { type } = vnode
  if (typeof type === 'function') {
    return normalizeChildren((type as (p: Record<string, unknown>) => unknown)(componentProps(vnode)))
  }
  if (type === FRAGMENT) {
    const rest = Array.isArray(vnode.children) ? vnode.children : []
    return normalizeChildren(rest.length > 0 ? rest : vnode.props?.children)
  }
  if (typeof type === 'string') {
    throw new Error(
      `[@pyreon/document] <${type}> is a DOM element, not a document primitive. A document tree may only contain @pyreon/document primitives (Document, Page, Heading, Text, …), components that return them, strings and numbers.`,
    )
  }
  throw new Error(
    `[@pyreon/document] Unsupported node type ${String(type)} in a document tree — only @pyreon/document primitives, components that return them, and fragments are supported.`,
  )
}

function normalizeChildren(children: unknown): DocChild[] {
  // JSX semantics: `true` / `false` / `null` / `undefined` render NOTHING
  // (`{cond && <X/>}` yields `true`/`false`). Without the `true` arm a
  // truthy boolean fell through to `String(children)` and every renderer
  // emitted the literal text "true".
  if (children == null || typeof children === 'boolean') return []
  if (typeof children === 'string') return [children]
  if (typeof children === 'number') return [String(children)]
  if (Array.isArray(children)) return children.flatMap(normalizeChildren)
  // Accessor child (`{() => x()}`) — snapshot its current value.
  if (typeof children === 'function') return normalizeChildren((children as () => unknown)())
  if (isDocNode(children)) return [children]
  if (typeof children === 'object') {
    if (isVNodeLike(children)) return resolveVNode(children)
    throw new Error(
      '[@pyreon/document] Invalid child: plain objects are not valid document children. Use a document node (Text, Heading, etc.) instead.',
    )
  }
  return [String(children)]
}

/**
 * Resolve a render input — a `DocNode` (primitive called directly, or the
 * builder) OR a Pyreon VNode tree (JSX / `h()`) — to the root `DocNode`.
 * Throws when the input does not resolve to exactly one document node.
 */
export function resolveDocNode(input: unknown): DocNode {
  // A DocNode — or a hand-built / JSON-round-tripped tree that omits `props`
  // (renderers tolerate that) — passes through untouched, as it always has.
  if (
    typeof input === 'object' &&
    input !== null &&
    typeof (input as { type?: unknown }).type === 'string' &&
    !('key' in input)
  ) {
    return input as DocNode
  }
  const resolved = normalizeChildren(input)
  const only = resolved[0]
  if (resolved.length !== 1 || typeof only === 'string' || only === undefined) {
    throw new Error(
      `[@pyreon/document] render() input must resolve to a single document node (e.g. <Document>), but it resolved to ${resolved.length} item(s).`,
    )
  }
  return only
}

/**
 * Recursively flatten a node tree to its concatenated text content.
 * Format-agnostic — was copy-pasted byte-identically into most of the 19
 * renderer modules (20 formats — svg/pdf/pptx/xlsx/docx + every chat
 * target); consolidated here as the single source of truth. The
 * text/markdown/html/email renderers deliberately do NOT use this (they
 * walk the tree structurally).
 */
export function getTextContent(children: DocChild[]): string {
  // `acc +=` over .map().join('') — measured faster at every size in this
  // repo (V8 cons-strings; see pyreon-benchmarks core-micro).
  let acc = ''
  for (const c of children) {
    acc += typeof c === 'string' ? c : getTextContent((c as DocNode).children)
  }
  return acc
}

/**
 * INLINE RUNS — the focused slice of the rich-text-run model: split a text
 * node's children into runs so an inline `<Link>` keeps its href in
 * formats that flatten via `getTextContent` (pre-fix: a link inside a
 * `<Text>` paragraph silently lost its href in PDF, DOCX, and the chat
 * formats). A run is plain text or a link; any OTHER nested node still
 * flattens to its text (bold/italic spans remain block-level — the full
 * run model is the tracked follow-up).
 */
export interface InlineRun {
  text: string
  href?: string
}

export function getInlineRuns(children: DocChild[]): InlineRun[] {
  const runs: InlineRun[] = []
  const pushText = (t: string) => {
    if (!t) return
    const last = runs[runs.length - 1]
    if (last && last.href === undefined) last.text += t
    else runs.push({ text: t })
  }
  for (const c of children) {
    if (typeof c === 'string') {
      pushText(c)
    } else if (c.type === 'link' && typeof c.props.href === 'string') {
      runs.push({ text: getTextContent(c.children), href: c.props.href })
    } else {
      pushText(getTextContent(c.children))
    }
  }
  return runs
}

/** True when at least one run is a link — renderers use this to keep the
 *  zero-link fast path byte-identical to the old flatten. */
export function hasLinkRun(runs: InlineRun[]): boolean {
  return runs.some((r) => r.href !== undefined)
}

/**
 * Fallback text for an image a target format cannot embed (chat platforms
 * reject `data:` URIs; Telegram/WhatsApp carry no inline images at all;
 * PPTX cannot fetch http URLs at render time). Shared so every renderer
 * degrades identically instead of silently dropping the image — the
 * pdf/docx renderers established the `[Image: …]` placeholder convention.
 * NOTE: never embed the raw `src` here — a `data:` URI is megabytes long.
 */
export function imagePlaceholderText(props: Record<string, unknown>): string {
  const alt = (props.alt as string | undefined) || 'Image'
  const caption = props.caption ? ` — ${props.caption as string}` : ''
  return `[Image: ${alt}${caption}]`
}

// Dedupe unknown-node-type warnings per (format, type) pair per process —
// bounded by the number of DISTINCT unknown types a process encounters
// (tiny in practice; a renderer loop over one bad type warns once, not N
// times). Same per-process-Set dedupe shape as zero's warn-missing-env.
const _warnedUnknownTypes = new Set<string>()

/**
 * Dev-warn for a node type a renderer's switch does not recognize.
 * Called from every renderer's `default:` arm that would otherwise DROP
 * the node silently — so a future NodeType added to the union without a
 * per-renderer case surfaces loudly in dev instead of vanishing from the
 * output (the "union member with no registered runtime handler" class).
 * Warns once per (format, type) pair; no-op in production.
 */
export function warnUnknownNodeType(format: string, type: string): void {
  if (process.env.NODE_ENV !== 'production') {
    const key = `${format}:${type}`
    if (_warnedUnknownTypes.has(key)) return
    _warnedUnknownTypes.add(key)
    console.warn(
      `[@pyreon/document] The '${format}' renderer has no handler for node type '${type}' — the node was skipped. If this is a new NodeType, add a case for it (or an explicit documented skip) in src/renderers/${format === 'md' ? 'markdown' : format}.ts.`,
    )
  }
}

/** @internal For testing — reset the unknown-node-type warning dedupe. */
export function _resetUnknownTypeWarnings(): void {
  _warnedUnknownTypes.clear()
}

/**
 * Type guard — checks if a value is a DocNode: an object with a STRING
 * `type`, `props` and `children`. A Pyreon VNode (JSX / `h()` output) is NOT a
 * DocNode — its `type` is the primitive function and it carries a `key` —
 * even though it has the same three keys; `render()` resolves those.
 */
export function isDocNode(value: unknown): value is DocNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as { type: unknown }).type === 'string' &&
    'props' in value &&
    'children' in value &&
    !('key' in value)
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
export const Document = /* @__PURE__ */ Object.assign(
  function Document(props: DocumentProps): DocNode {
    const { children, ...rest } = props
    return createNode('document', rest, children)
  },
  { _documentType: 'document' as const },
) as DocPrimitive<DocumentProps, 'document'>

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
export const Page = /* @__PURE__ */ Object.assign(
  function Page(props: PageProps): DocNode {
    const { children, header, footer, ...rest } = props
    // `header` / `footer` are PROPS, not children, so child normalization
    // never reaches them. A JSX value there (`header={<Text>…</Text>}`) is a
    // VNode the PDF/DOCX renderers would read as a DocNode — with the
    // automatic JSX runtime its text lives in `props.children`, so the
    // header was silently dropped. Resolve them here, like children.
    const pageProps: Record<string, unknown> = rest
    if (header != null) pageProps.header = resolveDocNode(header)
    if (footer != null) pageProps.footer = resolveDocNode(footer)
    return createNode('page', pageProps, children)
  },
  { _documentType: 'page' as const },
) as DocPrimitive<PageProps, 'page'>

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
export const Section = /* @__PURE__ */ Object.assign(
  function Section(props: SectionProps): DocNode {
    const { children, ...rest } = props
    return createNode('section', rest, children)
  },
  { _documentType: 'section' as const },
) as DocPrimitive<SectionProps, 'section'>

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
export const Row = /* @__PURE__ */ Object.assign(
  function Row(props: RowProps): DocNode {
    const { children, ...rest } = props
    return createNode('row', rest, children)
  },
  { _documentType: 'row' as const },
) as DocPrimitive<RowProps, 'row'>

/**
 * Column within a Row.
 */
export const Column = /* @__PURE__ */ Object.assign(
  function Column(props: ColumnProps): DocNode {
    const { children, ...rest } = props
    return createNode('column', rest, children)
  },
  { _documentType: 'column' as const },
) as DocPrimitive<ColumnProps, 'column'>

/**
 * Heading text (h1–h6).
 *
 * @example
 * ```tsx
 * <Heading level={1}>Invoice #1234</Heading>
 * <Heading level={2} color="#666">Details</Heading>
 * ```
 */
export const Heading = /* @__PURE__ */ Object.assign(
  function Heading(props: HeadingProps): DocNode {
    const { children, ...rest } = props
    return createNode('heading', { level: 1, ...rest }, children)
  },
  { _documentType: 'heading' as const },
) as DocPrimitive<HeadingProps, 'heading'>

/**
 * Text paragraph with optional formatting.
 *
 * @example
 * ```tsx
 * <Text bold size={14} color="#333">Hello World</Text>
 * <Text italic align="right">Subtotal: $100</Text>
 * ```
 */
export const Text = /* @__PURE__ */ Object.assign(
  function Text(props: TextProps): DocNode {
    const { children, ...rest } = props
    return createNode('text', rest, children)
  },
  { _documentType: 'text' as const },
) as DocPrimitive<TextProps, 'text'>

/**
 * Hyperlink.
 *
 * @example
 * ```tsx
 * <Link href="https://example.com">Visit site</Link>
 * ```
 */
export const Link = /* @__PURE__ */ Object.assign(
  function Link(props: LinkProps): DocNode {
    const { children, ...rest } = props
    return createNode('link', rest, children)
  },
  { _documentType: 'link' as const },
) as DocPrimitive<LinkProps, 'link'>

/**
 * Image with optional sizing and caption.
 *
 * @example
 * ```tsx
 * <Image src="/logo.png" width={120} alt="Company Logo" />
 * <Image src={chartDataUrl} width={500} caption="Revenue Chart" />
 * ```
 */
export const Image = /* @__PURE__ */ Object.assign(
  function Image(props: ImageProps): DocNode {
    return createNode('image', props, [])
  },
  { _documentType: 'image' as const },
) as DocPrimitive<ImageProps, 'image'>

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
export const Table = /* @__PURE__ */ Object.assign(
  function Table(props: TableProps): DocNode {
    return createNode('table', props, [])
  },
  { _documentType: 'table' as const },
) as DocPrimitive<TableProps, 'table'>

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
export const List = /* @__PURE__ */ Object.assign(
  function List(props: ListProps): DocNode {
    const { children, ...rest } = props
    return createNode('list', rest, children)
  },
  { _documentType: 'list' as const },
) as DocPrimitive<ListProps, 'list'>

/**
 * Single list item within a List.
 */
export const ListItem = /* @__PURE__ */ Object.assign(
  function ListItem(props: ListItemProps): DocNode {
    const { children } = props
    return createNode('list-item', {}, children)
  },
  { _documentType: 'list-item' as const },
) as DocPrimitive<ListItemProps, 'list-item'>

/**
 * Code block with optional language hint.
 *
 * @example
 * ```tsx
 * <Code language="typescript">const x = 42</Code>
 * ```
 */
export const Code = /* @__PURE__ */ Object.assign(
  function Code(props: CodeProps): DocNode {
    const { children, ...rest } = props
    return createNode('code', rest, children)
  },
  { _documentType: 'code' as const },
) as DocPrimitive<CodeProps, 'code'>

/**
 * Horizontal divider line.
 *
 * @example
 * ```tsx
 * <Divider color="#ddd" thickness={2} />
 * ```
 */
export const Divider = /* @__PURE__ */ Object.assign(
  function Divider(props: DividerProps = {}): DocNode {
    return createNode('divider', props, [])
  },
  { _documentType: 'divider' as const },
) as OptionalPropsDocPrimitive<DividerProps, 'divider'>

/**
 * Page break — forces content after this point to the next page (PDF/DOCX)
 * or inserts a visual separator (HTML/email).
 *
 * @example
 * ```tsx
 * <PageBreak />
 * ```
 */
export const PageBreak = /* @__PURE__ */ Object.assign(
  function PageBreak(): DocNode {
    return createNode('page-break', {}, [])
  },
  { _documentType: 'page-break' as const },
) as OptionalPropsDocPrimitive<Record<string, never>, 'page-break'>

/**
 * Vertical spacer.
 *
 * @example
 * ```tsx
 * <Spacer height={20} />
 * ```
 */
export const Spacer = /* @__PURE__ */ Object.assign(
  function Spacer(props: SpacerProps): DocNode {
    return createNode('spacer', props, [])
  },
  { _documentType: 'spacer' as const },
) as DocPrimitive<SpacerProps, 'spacer'>

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
export const Button = /* @__PURE__ */ Object.assign(
  function Button(props: ButtonProps): DocNode {
    const { children, ...rest } = props
    return createNode('button', rest, children)
  },
  { _documentType: 'button' as const },
) as DocPrimitive<ButtonProps, 'button'>

/**
 * Block quote.
 *
 * @example
 * ```tsx
 * <Quote borderColor="#4f46e5">This is a quote.</Quote>
 * ```
 */
export const Quote = /* @__PURE__ */ Object.assign(
  function Quote(props: QuoteProps): DocNode {
    const { children, ...rest } = props
    return createNode('quote', rest, children)
  },
  { _documentType: 'quote' as const },
) as DocPrimitive<QuoteProps, 'quote'>
