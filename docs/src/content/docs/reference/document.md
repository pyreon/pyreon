---
title: "Universal Document Rendering — API Reference"
description: "Universal document rendering — 18 primitives, 14+ output formats"
---

# @pyreon/document — API Reference

> **Generated** from `document`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [document](/docs/document).

Universal document rendering for Pyreon. One template, every output format: HTML, PDF, DOCX, XLSX, PPTX, email, Markdown, plain text, CSV, SVG, Slack, Teams, Discord, Telegram, Notion, Confluence, WhatsApp, Google Chat. Heavy renderers are lazy-loaded — chunks (PDF ~3MB pdfmake + fonts, DOCX ~700KB, XLSX ~1.1MB, PPTX ~400KB) only load when invoked. The vendored architecture means one npm install covers every format; apps that never render to a heavy format never pay its chunk cost. Supports both JSX primitives and a fluent builder API.

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`render`](#render) | function | Render a document node tree to any supported format. |
| [`createDocument`](#createdocument) | function | Fluent builder API for constructing documents without JSX. |
| [`Document`](#document) | component | Root JSX primitive for document trees. |
| [`download`](#download) | function | Browser helper that triggers a file download from rendered document data. |

## API

### render `function`

```ts
(node: DocNode, format: OutputFormat, options?: RenderOptions) => Promise<RenderResult>
```

Render a document node tree to any supported format. Returns a string (HTML, Markdown, text, CSV, email, Slack, Teams, etc.) or Uint8Array (PDF, DOCX, XLSX, PPTX) depending on the format. Heavy format renderers are lazy-loaded on first use. Supports 14+ built-in formats plus custom renderers registered via `registerRenderer()`.

**Example**

```tsx
const pdf = await render(doc, 'pdf')            // Uint8Array
const html = await render(doc, 'html')           // string
const email = await render(doc, 'email')         // Outlook-safe HTML
const md = await render(doc, 'md')               // Markdown string
const slack = await render(doc, 'slack')          // Slack Block Kit JSON
```

**Common mistakes**

- Not awaiting the render call — render() is always async due to lazy-loaded format renderers
- Expecting render("pdf") to return a string — PDF, DOCX, XLSX, PPTX return Uint8Array
- Passing a VNode instead of a DocNode — render() expects the output of JSX primitives (Document, Page, etc.) or createDocument(), not arbitrary Pyreon VNodes

**See also:** `createDocument` · `Document` · `download` · `registerRenderer`

---

### createDocument `function`

```ts
(props?: DocumentProps) => DocumentBuilder
```

Fluent builder API for constructing documents without JSX. Chain `.heading()`, `.text()`, `.table()`, `.image()`, `.list()`, `.code()`, `.divider()`, `.page()` calls. Terminal methods: `.toPdf()`, `.toDocx()`, `.toEmail()`, `.toSlack()`, `.toNotion()`, `.toHtml()`, `.toMarkdown()`, etc. Each terminal method calls `render()` internally.

**Example**

```tsx
const doc = createDocument({ title: 'Report' })
  .heading('Sales Report')
  .text('Q4 2026 summary.')
  .table({ columns: ['Region', 'Revenue'], rows: [['US', '$1M']] })

await doc.toPdf()      // PDF Uint8Array
await doc.toEmail()    // Outlook-safe HTML
await doc.toDocx()     // Word document
```

**Common mistakes**

- Forgetting to await terminal methods — toPdf(), toDocx(), etc. are async
- Calling builder methods after a terminal method — the builder is consumed; create a new one

**See also:** `render` · `Document`

---

### Document `component`

```ts
(props: DocumentProps) => DocNode
```

Root JSX primitive for document trees. Accepts `title`, `author`, `subject` as metadata props. Children should be `Page` elements (or other block-level primitives for single-page documents). The returned DocNode is passed to `render()` for output.

**Example**

```tsx
const doc = (
  <Document title="Report" author="Team">
    <Page>
      <Heading>Title</Heading>
      <Text>Content</Text>
    </Page>
  </Document>
)
await render(doc, 'pdf')
```

**See also:** `render` · `Page` · `createDocument`

---

### download `function`

```ts
(data: Uint8Array | string, filename: string) => void
```

Browser helper that triggers a file download from rendered document data. Creates a temporary Blob URL and clicks a hidden anchor element. Works with both Uint8Array (PDF, DOCX) and string (HTML, Markdown) outputs from `render()`.

**Example**

```tsx
const pdf = await render(doc, 'pdf')
download(pdf, 'report.pdf')
```

**See also:** `render`

---

## Package-level notes

> **Note:** Heavy format renderers are lazy-loaded: PDF (~3MB via pdfmake + bundled fonts), DOCX (~700KB via docx), XLSX (~1.1MB via exceljs), PPTX (~400KB via pptxgenjs). First render of each format triggers the dynamic import; subsequent renders are instant. The vendored architecture means apps download all renderer chunks during npm install (14MB total `lib/`), but consumer-side bundlers tree-shake to only ship the renderers an app actually invokes.

> **Format return types:** Binary formats (pdf, docx, xlsx, pptx) return Uint8Array. Text formats (html, email, md, text, csv, slack, teams, discord, telegram, notion, confluence, whatsapp, gchat, svg) return string.

> **JSX vs Builder:** Both APIs produce the same DocNode tree. JSX primitives are better for complex layouts with conditional sections. The builder API is better for programmatic generation (e.g. loop over data to build rows).

> **document-primitives:** For components that render in the browser AND export to documents, use `@pyreon/document-primitives` (rocketstyle-based) + `@pyreon/connector-document` — not the raw primitives from this package.
