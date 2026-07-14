import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/document',
  title: 'Universal Document Rendering',
  tagline:
    'Universal document rendering — 18 primitives, 20 output formats',
  description:
    'Universal document rendering for Pyreon. One template, every output format: HTML, PDF, DOCX, XLSX, PPTX, email, Markdown, plain text, CSV, SVG, JSON, JSONL, Slack, Teams, Discord, Telegram, Notion, Confluence, WhatsApp, Google Chat. Heavy renderers are lazy-loaded — chunks (PDF ~3MB pdfmake + fonts, DOCX ~700KB, XLSX ~1.1MB, PPTX ~400KB) only load when invoked. The vendored architecture means one npm install covers every format; apps that never render to a heavy format never pay its chunk cost. Supports both JSX primitives and a fluent builder API.',
  category: 'universal',
  longExample: `import { Document, Page, Heading, Text, Table, Image, List, Code, Divider, render, createDocument, download } from '@pyreon/document'

// JSX primitives — compose a document tree
const report = (
  <Document title="Q4 Sales Report" author="Analytics Team">
    <Page>
      <Heading level={1}>Sales Report</Heading>
      <Text>Q4 2026 performance summary.</Text>
      <Table
        columns={['Region', 'Revenue', 'Growth']}
        rows={[
          ['US', '$1.2M', '+15%'],
          ['EU', '$800K', '+8%'],
          ['APAC', '$500K', '+22%'],
        ]}
      />
      <Divider />
      <Heading level={2}>Notes</Heading>
      <List items={['Record quarter for APAC', 'EU impacted by currency exchange']} />
      <Code language="sql">SELECT region, SUM(revenue) FROM sales GROUP BY region</Code>
    </Page>
  </Document>
)

// Render to any format:
const pdf = await render(report, 'pdf')            // Uint8Array
const html = await render(report, 'html')           // string
const email = await render(report, 'email')         // Outlook-safe HTML
const docx = await render(report, 'docx')           // Uint8Array
const xlsx = await render(report, 'xlsx')           // Uint8Array
const md = await render(report, 'md')               // Markdown string
const slack = await render(report, 'slack')          // Slack Block Kit JSON
const notion = await render(report, 'notion')        // Notion blocks
const teams = await render(report, 'teams')          // Adaptive Card JSON

// Browser download helper:
download(pdf, 'report.pdf')

// Builder API — alternative to JSX:
const doc = createDocument({ title: 'Report' })
  .heading('Sales Report')
  .text('Q4 2026 performance summary.')
  .table({ columns: ['Region', 'Revenue'], rows: [['US', '$1M']] })

await doc.toPdf()       // PDF
await doc.toEmail()     // email-safe HTML
await doc.toDocx()      // Word document
await doc.toSlack()     // Slack Block Kit
await doc.toNotion()    // Notion blocks`,
  features: [
    'render(node, format, options?) — render to any of 20 output formats',
    'createDocument(props?) — fluent builder API with .heading(), .text(), .table(), etc.',
    '18 JSX primitives: Document, Page, Heading, Text, Table, Image, List, Code, and more',
    'json / jsonl formats: round-trippable DocNode tree + flat one-block-per-line stream',
    'Heavy renderers lazy-loaded (PDF, DOCX, XLSX, PPTX)',
    'download() helper for browser file downloads',
    'registerRenderer() for custom output formats',
  ],
  api: [
    {
      name: 'render',
      kind: 'function',
      signature: '(node: DocNode, format: OutputFormat, options?: RenderOptions) => Promise<RenderResult>',
      summary:
        'Render a document node tree to any supported format. Returns a string (HTML, Markdown, text, CSV, email, JSON, JSONL, Slack, Teams, etc.) or Uint8Array (PDF, DOCX, XLSX, PPTX) depending on the format. Heavy format renderers are lazy-loaded on first use. Supports 20 built-in formats plus custom renderers registered via `registerRenderer()`. The `json` format serializes the full DocNode tree (round-trippable — JSON.parse it back and render again); `jsonl` emits one content block per line for ingestion / chunking pipelines.',
      example: `const pdf = await render(doc, 'pdf')            // Uint8Array
const html = await render(doc, 'html')           // string
const email = await render(doc, 'email')         // Outlook-safe HTML
const md = await render(doc, 'md')               // Markdown string
const slack = await render(doc, 'slack')          // Slack Block Kit JSON`,
      mistakes: [
        'Not awaiting the render call — render() is always async due to lazy-loaded format renderers',
        'Expecting render("pdf") to return a string — PDF, DOCX, XLSX, PPTX return Uint8Array',
        'Passing a VNode instead of a DocNode — render() expects the output of JSX primitives (Document, Page, etc.) or createDocument(), not arbitrary Pyreon VNodes',
      ],
      seeAlso: ['createDocument', 'Document', 'download', 'registerRenderer'],
    },
    {
      name: 'createDocument',
      kind: 'function',
      signature: '(props?: DocumentProps) => DocumentBuilder',
      summary:
        'Fluent builder API for constructing documents without JSX. Chain `.heading()`, `.text()`, `.table()`, `.image()`, `.list()`, `.code()`, `.divider()`, `.page()` calls. Terminal methods: `.toPdf()`, `.toDocx()`, `.toEmail()`, `.toSlack()`, `.toNotion()`, `.toHtml()`, `.toMarkdown()`, etc. Each terminal method calls `render()` internally.',
      example: `const doc = createDocument({ title: 'Report' })
  .heading('Sales Report')
  .text('Q4 2026 summary.')
  .table({ columns: ['Region', 'Revenue'], rows: [['US', '$1M']] })

await doc.toPdf()      // PDF Uint8Array
await doc.toEmail()    // Outlook-safe HTML
await doc.toDocx()     // Word document`,
      mistakes: [
        'Forgetting to await terminal methods — toPdf(), toDocx(), etc. are async',
        'Calling builder methods after a terminal method — the builder is consumed; create a new one',
      ],
      seeAlso: ['render', 'Document'],
    },
    {
      name: 'Document',
      kind: 'component',
      signature: '(props: DocumentProps) => DocNode',
      summary:
        'Root JSX primitive for document trees. Accepts `title`, `author`, `subject` as metadata props. Children should be `Page` elements (or other block-level primitives for single-page documents). The returned DocNode is passed to `render()` for output.',
      example: `const doc = (
  <Document title="Report" author="Team">
    <Page>
      <Heading>Title</Heading>
      <Text>Content</Text>
    </Page>
  </Document>
)
await render(doc, 'pdf')`,
      seeAlso: ['render', 'Page', 'createDocument'],
    },
    {
      name: 'download',
      kind: 'function',
      signature: '(node: DocNode, filename: string, options?: RenderOptions) => Promise<void>',
      summary:
        'Browser helper that renders a document node tree and triggers a file download in one call. The FILE EXTENSION on `filename` selects the format (`.pdf` → pdf, `.md` → markdown, `.json` → json, `.jsonl`/`.ndjson` → jsonl, etc.) — it renders internally, so you pass the DocNode, NOT already-rendered bytes. Creates a temporary Blob URL and clicks a hidden anchor. Browser-only — throws on the server.',
      example: `await download(doc, 'report.pdf')   // renders 'pdf', downloads
await download(doc, 'report.docx')  // renders 'docx', downloads
await download(doc, 'tree.json')    // renders 'json', downloads`,
      mistakes: [
        'Passing already-rendered bytes as the first arg — download() takes the DocNode and renders internally; the extension picks the format',
        'Forgetting the file extension — download(doc, "report") throws; the extension is how the format is chosen',
        'Calling it on the server — download() is browser-only and throws in Node',
      ],
      seeAlso: ['render'],
    },
    {
      name: 'Heading',
      kind: 'component',
      signature:
        "(props: { level?: 1 | 2 | 3 | 4 | 5 | 6; color?: string; align?: 'left' | 'center' | 'right'; children?: DocChild }) => DocNode",
      summary:
        "A heading block. `level` DEFAULTS TO 1 (h1) when omitted — pass 2–6 for h2–h6 (a caller-supplied `level` overrides the default). Children are the heading text (a raw string, or inline primitives). Produces { type: 'heading', props: { level, color?, align? }, children }.",
      example: `<Heading level={2} color="#666">Section title</Heading>`,
      mistakes: [
        'Assuming `level` auto-derives from nesting depth — it is always 1 unless you pass one; there is no document-wide heading counter.',
        "Passing a plain OBJECT as a child — normalizeChildren THROWS '[@pyreon/document] Invalid child: plain objects are not valid document children'. Children must be strings, numbers, or document nodes.",
      ],
      seeAlso: ['Text', 'Page'],
    },
    {
      name: 'Text',
      kind: 'component',
      signature:
        "(props: { size?: number; color?: string; bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; align?: 'left' | 'center' | 'right' | 'justify'; lineHeight?: number; children?: DocChild }) => DocNode",
      summary:
        "A paragraph / run of text with inline styling props (bold, italic, underline, strikethrough, size, color, align, lineHeight). A raw string child is kept as a bare string in `children` — Text does NOT wrap it in a nested node. Produces { type: 'text', props, children }.",
      example: `<Text bold align="center">Q4 2026 performance summary.</Text>`,
      seeAlso: ['Heading', 'Quote'],
    },
    {
      name: 'Table',
      kind: 'component',
      signature:
        "(props: { columns: (string | TableColumn)[]; rows: (string | number)[][]; headerStyle?: { background?: string; color?: string; bold?: boolean }; striped?: boolean; bordered?: boolean; caption?: string; keepTogether?: boolean }) => DocNode",
      summary:
        "A data table. `columns` (headers, each a string or { header, width?, align? }) and `rows` (a 2D array) are REQUIRED and live entirely in PROPS — Table has NO children. Every cell is a scalar `string | number`. Produces { type: 'table', props, children: [] }.",
      example: `<Table
  columns={['Region', 'Revenue', 'Growth']}
  rows={[['US', '$1.2M', '+15%'], ['EU', '$800K', '+8%']]}
  striped
/>`,
      mistakes: [
        'Putting rich content in a cell — cells are scalar `string | number` only; you cannot nest a Text/Link/Image DocNode inside a cell.',
        'Passing rows as children — Table ignores children entirely (forced to []); all data goes in the `columns` + `rows` props.',
        '`headerStyle` is its own 3-field shape ({ background?, color?, bold? }) — not the full Text style object; per-column align lives on the `TableColumn` entries in `columns`.',
      ],
      seeAlso: ['render'],
    },
    {
      name: 'List / ListItem',
      kind: 'component',
      signature:
        '(List: { ordered?: boolean; children?: DocChild }) => DocNode · (ListItem: { children?: DocChild }) => DocNode',
      summary:
        "A bulleted (default) or numbered list. `List` takes `ordered` (unordered when omitted — there is no applied default, undefined is falsy) and `ListItem` children. NOTE: the JSX `<List items={[…]} />` shorthand in the builder/examples is convenience sugar; the primitive itself nests `ListItem` children. `ListItem` DISCARDS every prop except `children` — it always renders { type: 'list-item', props: {}, children }.",
      example: `<List ordered>
  <ListItem>First</ListItem>
  <ListItem>Second</ListItem>
</List>`,
      mistakes: [
        'Setting any prop other than `children` on `ListItem` (an id, a style) — it is silently dropped; the primitive hard-codes empty props.',
        'Expecting `ordered` to have a truthy default — omitting it yields an UNORDERED list (undefined → falsy).',
      ],
      seeAlso: ['Text'],
    },
    {
      name: 'Code',
      kind: 'component',
      signature: '(props: { language?: string; children?: DocChild }) => DocNode',
      summary:
        "A code block. `language` is a hint for syntax highlighting in formats that support it (has NO default — undefined when omitted). Children are the raw code string. Produces { type: 'code', props, children }.",
      example: `<Code language="sql">SELECT region, SUM(revenue) FROM sales GROUP BY region</Code>`,
      seeAlso: ['Text'],
    },
    {
      name: 'Link',
      kind: 'component',
      signature: "(props: { href: string; color?: string; children?: DocChild }) => DocNode",
      summary:
        "An inline hyperlink. `href` is REQUIRED; children are the visible link text. Produces { type: 'link', props, children }.",
      example: `<Link href="https://example.com">Read the report</Link>`,
      seeAlso: ['Button', 'Text'],
    },
    {
      name: 'Image',
      kind: 'component',
      signature:
        "(props: { src: string; width?: number; height?: number; alt?: string; align?: 'left' | 'center' | 'right'; caption?: string }) => DocNode",
      summary:
        "An image. `src` is REQUIRED; `width`/`height` are NUMBERS (pixels), not CSS strings. Image has NO children (forced to []). With `render(doc, fmt, { baseUrl })` a relative `src` is rewritten absolute before rendering. Produces { type: 'image', props, children: [] }.",
      example: `<Image src="/charts/q4.png" width={480} alt="Q4 revenue" caption="Fig 1" />`,
      mistakes: [
        'Passing a CSS string for `width`/`height` (e.g. "50%") — they are typed `number` (pixels); use `render` options or a Section for relative sizing.',
        'Relying on a relative `src` without `baseUrl` — chat/email targets need absolute URLs; pass `render(doc, fmt, { baseUrl })` so relative srcs are rewritten. (Telegram/WhatsApp drop inline images entirely.)',
      ],
      seeAlso: ['render'],
    },
    {
      name: 'Button',
      kind: 'component',
      signature:
        "(props: { href: string; background?: string; color?: string; borderRadius?: number; padding?: number | [number, number]; align?: 'left' | 'center' | 'right'; children?: DocChild }) => DocNode",
      summary:
        "A call-to-action button — a LINK styled as a button (renders as an Outlook-safe 'bulletproof button' in email, a styled link in PDF/DOCX). `href` is REQUIRED; children are the label. Produces { type: 'button', props, children }.",
      example: `<Button href="https://app.example.com/invoice/42" background="#4f46e5" color="#fff">View invoice</Button>`,
      mistakes: [
        'Expecting an `onClick` handler or a `variant` prop — Button has NEITHER; it is purely a styled link and REQUIRES `href` (documents have no runtime event loop).',
      ],
      seeAlso: ['Link'],
    },
    {
      name: 'Page / Section / Row / Column / Divider / Spacer / Quote / PageBreak',
      kind: 'component',
      signature:
        "Page({ size?: PageSize; orientation?: 'portrait' | 'landscape'; margin?: number | number[]; header?: DocNode; footer?: DocNode; children? }) · Section({ direction?: 'column' | 'row'; gap?; padding?; background?; borderRadius?; border?; children? }) · Row({ gap?: number; align?; children? }) · Column({ width?: number | string; align?; children? }) · Divider({ color?; thickness? }) · Spacer({ height: number }) · Quote({ borderColor?; children? }) · PageBreak()",
      summary:
        "The structural / layout primitives. `Page` is a page boundary (`size` 'A4'|'A3'|'A5'|'letter'|'legal'|'tabloid', orientation, margins, optional `header`/`footer` DocNodes). `Section`/`Row`/`Column` are layout boxes (gap, align, padding, background). `Divider` is a horizontal rule (no children, all props optional — `Divider()` works bare). `Spacer` adds vertical space (`height: number` is REQUIRED). `Quote` is a blockquote (children). `PageBreak()` takes NO arguments — a hard break in PDF/DOCX, a visual rule in md/text/html, a no-op in per-slide PPTX.",
      example: `<Page size="A4" orientation="portrait">
  <Section gap={16}>
    <Heading>Title</Heading>
    <Spacer height={12} />
    <Quote>An important note.</Quote>
    <Divider />
  </Section>
  <PageBreak />
</Page>`,
      mistakes: [
        '`Spacer` without `height` — it is the only required field on these primitives; omitting it is a type error.',
        'Calling `PageBreak({ ... })` with props — it takes NO arguments and always emits empty props/children.',
        'Expecting `Column` to enforce a parent `Row` (or `Row` to require `Column` children) — neither is enforced at runtime; children are typed `unknown` and just normalized.',
      ],
      seeAlso: ['Document', 'render'],
    },
    {
      name: 'registerRenderer / unregisterRenderer / isDocNode',
      kind: 'function',
      signature:
        'registerRenderer(format: string, renderer: DocumentRenderer | (() => Promise<DocumentRenderer>)) => void · unregisterRenderer(format: string) => void · isDocNode(value: unknown) => value is DocNode',
      summary:
        "The extension + guard API. `registerRenderer` adds (or REPLACES) a format's renderer — pass a `DocumentRenderer` object ({ render(node, options?) }) or a lazy `() => Promise<DocumentRenderer>` loader (every built-in format is a lazy loader; the resolved renderer is cached back into the registry on first use). `unregisterRenderer` deletes a format (no-op if absent). `isDocNode` is a structural type guard.",
      example: `import { registerRenderer, render } from '@pyreon/document'

registerRenderer('rtf', { render: async (node) => toRtf(node) })
const rtf = await render(doc, 'rtf')`,
      mistakes: [
        'registerRenderer SILENTLY OVERWRITES an existing format (it is a bare Map.set, no guard) — re-registering `html` replaces the built-in renderer with no warning.',
        "Trusting isDocNode to validate the tree — it only checks `value` is an object carrying `type`, `props`, and `children` keys; it does NOT verify `type` is a real node type or that the shapes are valid (a hand-rolled { type: 'x', props: 0, children: 0 } passes).",
        "Rendering to an unregistered format — render() rejects with [@pyreon/document] No renderer registered for format 'X'. Available: … (the message enumerates the currently-registered keys). The markdown key is 'md', not 'markdown'.",
      ],
      seeAlso: ['render', 'createDocument'],
    },
  ],
  gotchas: [
    'Heavy format renderers are lazy-loaded: PDF (~3MB via pdfmake + bundled fonts), DOCX (~700KB via docx), XLSX (~1.1MB via exceljs), PPTX (~400KB via pptxgenjs). First render of each format triggers the dynamic import; subsequent renders are instant. The vendored architecture means apps download all renderer chunks during npm install (14MB total `lib/`), but consumer-side bundlers tree-shake to only ship the renderers an app actually invokes.',
    {
      label: 'Format return types',
      note: 'Binary formats (pdf, docx, xlsx, pptx) return Uint8Array. Text formats (html, email, md, text, csv, svg, json, jsonl, slack, teams, discord, telegram, notion, confluence, whatsapp, google-chat) return string.',
    },
    {
      label: 'json vs jsonl',
      note: 'The json format serializes the full DocNode tree and is round-trippable (JSON.parse → render again). The jsonl format flattens the tree to one content block per line (structural containers dropped) — the standard shape for chunking / embeddings / LLM ingestion. Both are pure (no lazy-load).',
    },
    {
      label: 'Not every format expresses every primitive',
      note: 'CSV/XLSX are tabular extractors (Table nodes only). Chat targets adapt tables to code blocks / fields and drop inline images on Telegram/WhatsApp. A PageBreak is a real break in PDF/DOCX, a visual rule in md/text/html, and a no-op in per-slide PPTX. See the "Primitive × Format Support Matrix" in the docs for the honest per-cell map.',
    },
    {
      label: 'JSX vs Builder',
      note: 'Both APIs produce the same DocNode tree. JSX primitives are better for complex layouts with conditional sections. The builder API is better for programmatic generation (e.g. loop over data to build rows).',
    },
    {
      label: 'document-primitives',
      note: 'For components that render in the browser AND export to documents, use `@pyreon/document-primitives` (rocketstyle-based) + `@pyreon/connector-document` — not the raw primitives from this package.',
    },
  ],
})
