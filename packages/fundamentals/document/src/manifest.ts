import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/document',
  title: 'Universal Document Rendering',
  tagline:
    'Universal document rendering — 18 primitives, 14+ output formats',
  description:
    'Universal document rendering for Pyreon. One template, every output format: HTML, PDF, DOCX, XLSX, PPTX, email, Markdown, plain text, CSV, SVG, Slack, Teams, Discord, Telegram, Notion, Confluence, WhatsApp, Google Chat. Heavy renderers are lazy-loaded — chunks (PDF ~3MB pdfmake + fonts, DOCX ~700KB, XLSX ~1.1MB, PPTX ~400KB) only load when invoked. The vendored architecture means one npm install covers every format; apps that never render to a heavy format never pay its chunk cost. Supports both JSX primitives and a fluent builder API.',
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
    'render(node, format, options?) — render to any of 14+ output formats',
    'createDocument(props?) — fluent builder API with .heading(), .text(), .table(), etc.',
    '18 JSX primitives: Document, Page, Heading, Text, Table, Image, List, Code, and more',
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
        'Render a document node tree to any supported format. Returns a string (HTML, Markdown, text, CSV, email, Slack, Teams, etc.) or Uint8Array (PDF, DOCX, XLSX, PPTX) depending on the format. Heavy format renderers are lazy-loaded on first use. Supports 14+ built-in formats plus custom renderers registered via `registerRenderer()`.',
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
      signature: '(data: Uint8Array | string, filename: string) => void',
      summary:
        'Browser helper that triggers a file download from rendered document data. Creates a temporary Blob URL and clicks a hidden anchor element. Works with both Uint8Array (PDF, DOCX) and string (HTML, Markdown) outputs from `render()`.',
      example: `const pdf = await render(doc, 'pdf')
download(pdf, 'report.pdf')`,
      seeAlso: ['render'],
    },
  ],
  gotchas: [
    'Heavy format renderers are lazy-loaded: PDF (~3MB via pdfmake + bundled fonts), DOCX (~700KB via docx), XLSX (~1.1MB via exceljs), PPTX (~400KB via pptxgenjs). First render of each format triggers the dynamic import; subsequent renders are instant. The vendored architecture means apps download all renderer chunks during npm install (14MB total `lib/`), but consumer-side bundlers tree-shake to only ship the renderers an app actually invokes.',
    {
      label: 'Format return types',
      note: 'Binary formats (pdf, docx, xlsx, pptx) return Uint8Array. Text formats (html, email, md, text, csv, slack, teams, discord, telegram, notion, confluence, whatsapp, gchat, svg) return string.',
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
