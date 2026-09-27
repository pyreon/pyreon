---
title: "Universal Document Rendering — API Reference"
description: "Universal document rendering — 18 primitives, 20 output formats"
---

# @pyreon/document — API Reference

> **Generated** from `document`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [document](/docs/document).

Universal document rendering for Pyreon. One template, every output format: HTML, PDF, DOCX, XLSX, PPTX, email, Markdown, plain text, CSV, SVG, JSON, JSONL, Slack, Teams, Discord, Telegram, Notion, Confluence, WhatsApp, Google Chat. Heavy renderers are lazy-loaded — chunks (PDF ~3MB pdfmake + fonts, DOCX ~700KB, XLSX ~1.1MB, PPTX ~400KB) only load when invoked. The vendored architecture means one npm install covers every format; apps that never render to a heavy format never pay its chunk cost. Supports both JSX primitives and a fluent builder API.

## Multiplatform

**Tier:** Web-only — the browser package; the native story is stated below

wraps pdfmake/docx/exceljs/pptxgenjs (browser/node document engines); no native lowering

See [Multiplatform](/docs/multiplatform) for the capability matrix and [Multiplatform libraries](/docs/multiplatform-libraries) for every package's tier.

## Features

- render(node, format, options?) — render to any of 20 output formats
- createDocument(props?) — fluent builder API with .heading(), .text(), .table(), etc.
- 18 JSX primitives: Document, Page, Heading, Text, Table, Image, List, Code, and more
- json / jsonl formats: round-trippable DocNode tree + flat one-block-per-line stream
- Heavy renderers lazy-loaded (PDF, DOCX, XLSX, PPTX)
- download() helper for browser file downloads
- registerRenderer() for custom output formats

## Complete example

A full, end-to-end usage of the package:

```tsx
import { Document, Page, Heading, Text, Table, List, ListItem, Code, Divider, render, createDocument, download } from '@pyreon/document'

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
      <List>
        <ListItem>Record quarter for APAC</ListItem>
        <ListItem>EU impacted by currency exchange</ListItem>
      </List>
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

// Browser download helper — pass the TREE; the extension picks the format:
await download(report, 'report.pdf')

// Builder API — alternative to JSX:
const doc = createDocument({ title: 'Report' })
  .heading('Sales Report')
  .text('Q4 2026 performance summary.')
  .table({ columns: ['Region', 'Revenue'], rows: [['US', '$1M']] })

await doc.toPdf()       // PDF
await doc.toEmail()     // email-safe HTML
await doc.toDocx()      // Word document
await doc.toSlack()     // Slack Block Kit
await doc.toNotion()    // Notion blocks
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`render`](#render) | function | Render a document tree to any supported format. |
| [`createDocument`](#createdocument) | function | Fluent builder API for constructing documents without JSX. |
| [`Document`](#document) | component | Root primitive for document trees. |
| [`download`](#download) | function | Browser helper that renders a document node tree and triggers a file download in one call. |
| [`Heading`](#heading) | component | A heading block. |
| [`Text`](#text) | component | A paragraph / run of text with inline styling props (bold, italic, underline, strikethrough, size, color, align, lineHei |
| [`Table`](#table) | component | A data table. |
| [`List / ListItem`](#list-listitem) | component | A bulleted (default) or numbered list. |
| [`Code`](#code) | component | A code block. |
| [`Link`](#link) | component | An inline hyperlink. |
| [`Image`](#image) | component | An image. |
| [`Button`](#button) | component | A call-to-action button — a LINK styled as a button (renders as an Outlook-safe 'bulletproof button' in email, a styled  |
| [`Page / Section / Row / Column / Divider / Spacer / Quote / PageBreak`](#page-section-row-column-divider-spacer-quote-pagebreak) | component | The structural / layout primitives. |
| [`registerRenderer / unregisterRenderer / isDocNode`](#registerrenderer-unregisterrenderer-isdocnode) | function | The extension + guard API. |

## API

### render `function`

```ts
(node: DocNode | VNode, format: OutputFormat, options?: RenderOptions) => Promise<RenderResult>
```

Render a document tree to any supported format. The input is a `DocNode` (primitives called directly, or `createDocument()`) OR a JSX / `h()` VNode tree of primitives — `render()` resolves the VNode tree first (components invoked, fragments flattened, `true`/`false`/`null`/`undefined` children dropped), so JSX, `h()` and direct calls produce identical output. Returns a string (HTML, Markdown, text, CSV, email, JSON, JSONL, Slack, Teams, etc.) or Uint8Array (PDF, DOCX, XLSX, PPTX) depending on the format. Heavy format renderers are lazy-loaded on first use. Supports 20 built-in formats plus custom renderers registered via `registerRenderer()`. The `json` format serializes the full DocNode tree (round-trippable — JSON.parse it back and render again); `jsonl` emits one content block per line for ingestion / chunking pipelines.

**Example**

```tsx
const doc = (
  <Document title="Report">
    <Page>
      <Heading>Summary</Heading>
      {showNotes && <Text>Notes</Text>}
    </Page>
  </Document>
)
const pdf = await render(doc, 'pdf')            // Uint8Array
const html = await render(doc, 'html')           // string
const email = await render(doc, 'email')         // Outlook-safe HTML
const md = await render(doc, 'md')               // Markdown string
const slack = await render(doc, 'slack')          // Slack Block Kit JSON
```

**Common mistakes**

- Not awaiting the render call — render() is always async due to lazy-loaded format renderers
- Expecting render("pdf") to return a string — PDF, DOCX, XLSX, PPTX return Uint8Array
- Putting a DOM element in a document tree (`<div>`, `<p>`, `<span>`) — a document tree may only contain @pyreon/document primitives, components that return them, strings and numbers; render() throws `<div> is a DOM element, not a document primitive`. Use `<Section>` / `<Text>` instead.
- Expecting a signal-driven child to stay live — render() takes a one-shot snapshot: accessor children (`{() => x()}`) and reactive props are read ONCE at render time. Re-render to reflect new values.

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
- Assuming the builder is consumed after a terminal method — it is NOT: the section list persists, so .toPdf() then .toDocx() on the same builder renders the same document twice (chaining more sections after a render also works)

**See also:** `render` · `Document`

---

### Document `component`

```ts
(props: DocumentProps) => DocNode
```

Root primitive for document trees. Accepts `title`, `author`, `subject` as metadata props. Children should be `Page` elements (or other block-level primitives for single-page documents). Use it as JSX (`<Document>`), via `h(Document, props, ...children)`, or call it directly (`Document({ title, children })`) — all three render identically. Called directly it returns a `DocNode`; as JSX / `h()` it is a VNode that `render()` / `download()` resolve.

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
(node: DocNode | VNode, filename: string, options?: RenderOptions) => Promise<void>
```

Browser helper that renders a document node tree and triggers a file download in one call. The FILE EXTENSION on `filename` selects the format (`.pdf` → pdf, `.md` → markdown, `.json` → json, `.jsonl`/`.ndjson` → jsonl, etc.) — it renders internally, so you pass the document tree (a DocNode or a JSX / `h()` tree), NOT already-rendered bytes. Creates a temporary Blob URL and clicks a hidden anchor. Browser-only — throws on the server.

**Example**

```tsx
await download(doc, 'report.pdf')   // renders 'pdf', downloads
await download(doc, 'report.docx')  // renders 'docx', downloads
await download(doc, 'tree.json')    // renders 'json', downloads
```

**Common mistakes**

- Passing already-rendered bytes as the first arg — download() takes the DocNode and renders internally; the extension picks the format
- Forgetting the file extension — download(doc, "report") throws; the extension is how the format is chosen
- Calling it on the server — download() is browser-only and throws in Node

**See also:** `render`

---

### Heading `component`

```ts
(props: { level?: 1 | 2 | 3 | 4 | 5 | 6; color?: string; align?: 'left' | 'center' | 'right'; children?: DocChild }) => DocNode
```

A heading block. `level` DEFAULTS TO 1 (h1) when omitted — pass 2–6 for h2–h6 (a caller-supplied `level` overrides the default). Children are the heading text (a raw string, or inline primitives). Produces &#123; type: 'heading', props: &#123; level, color?, align? &#125;, children &#125;.

**Example**

```tsx
<Heading level={2} color="#666">Section title</Heading>
```

**Common mistakes**

- Assuming `level` auto-derives from nesting depth — it is always 1 unless you pass one; there is no document-wide heading counter.
- Passing a plain OBJECT as a child — normalizeChildren THROWS '[@pyreon/document] Invalid child: plain objects are not valid document children'. Children must be strings, numbers, or document nodes.

**See also:** `Text` · `Page`

---

### Text `component`

```ts
(props: { size?: number; color?: string; bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; align?: 'left' | 'center' | 'right' | 'justify'; lineHeight?: number; children?: DocChild }) => DocNode
```

A paragraph / run of text with inline styling props (bold, italic, underline, strikethrough, size, color, align, lineHeight). A raw string child is kept as a bare string in `children` — Text does NOT wrap it in a nested node. Produces &#123; type: 'text', props, children &#125;.

**Example**

```tsx
<Text bold align="center">Q4 2026 performance summary.</Text>
```

**See also:** `Heading` · `Quote`

---

### Table `component`

```ts
(props: { columns: (string | TableColumn)[]; rows: (string | number)[][]; headerStyle?: { background?: string; color?: string; bold?: boolean }; striped?: boolean; bordered?: boolean; caption?: string; keepTogether?: boolean }) => DocNode
```

A data table. `columns` (headers, each a string or &#123; header, width?, align? &#125;) and `rows` (a 2D array) are REQUIRED and live entirely in PROPS — Table has NO children. Every cell is a scalar `string | number`. Produces &#123; type: 'table', props, children: [] &#125;.

**Example**

```tsx
<Table
  columns={['Region', 'Revenue', 'Growth']}
  rows={[['US', '$1.2M', '+15%'], ['EU', '$800K', '+8%']]}
  striped
/>
```

**Common mistakes**

- Putting rich content in a cell — cells are scalar `string | number` only; you cannot nest a Text/Link/Image DocNode inside a cell.
- Passing rows as children — Table ignores children entirely (forced to []); all data goes in the `columns` + `rows` props.
- `headerStyle` is its own 3-field shape (&#123; background?, color?, bold? &#125;) — not the full Text style object; per-column align lives on the `TableColumn` entries in `columns`.

**See also:** `render`

---

### List / ListItem `component`

```ts
(List: { ordered?: boolean; children?: DocChild }) => DocNode · (ListItem: { children?: DocChild }) => DocNode
```

A bulleted (default) or numbered list. `List` takes `ordered` (unordered when omitted — there is no applied default, undefined is falsy) and `ListItem` children. There is NO `items` prop on the primitive — nest `ListItem` children; only the builder's `.list(items[])` takes an array. `ListItem` DISCARDS every prop except `children` — it always renders &#123; type: 'list-item', props: &#123;&#125;, children &#125;.

**Example**

```tsx
<List ordered>
  <ListItem>First</ListItem>
  <ListItem>Second</ListItem>
</List>
```

**Common mistakes**

- Setting any prop other than `children` on `ListItem` (an id, a style) — it is silently dropped; the primitive hard-codes empty props.
- Expecting `ordered` to have a truthy default — omitting it yields an UNORDERED list (undefined → falsy).
- Writing `<List items={[…]} />` — the primitive has no `items` prop (it is a type error, and at runtime the list renders EMPTY). Nest `<ListItem>` children, or use the builder `.list([...])`.

**See also:** `Text`

---

### Code `component`

```ts
(props: { language?: string; children?: DocChild }) => DocNode
```

A code block. `language` is a hint for syntax highlighting in formats that support it (has NO default — undefined when omitted). Children are the raw code string. Produces &#123; type: 'code', props, children &#125;.

**Example**

```tsx
<Code language="sql">SELECT region, SUM(revenue) FROM sales GROUP BY region</Code>
```

**See also:** `Text`

---

### Link `component`

```ts
(props: { href: string; color?: string; children?: DocChild }) => DocNode
```

An inline hyperlink. `href` is REQUIRED; children are the visible link text. Produces &#123; type: 'link', props, children &#125;.

**Example**

```tsx
<Link href="https://example.com">Read the report</Link>
```

**See also:** `Button` · `Text`

---

### Image `component`

```ts
(props: { src: string; width?: number; height?: number; alt?: string; align?: 'left' | 'center' | 'right'; caption?: string }) => DocNode
```

An image. `src` is REQUIRED; `width`/`height` are NUMBERS (pixels), not CSS strings. Image has NO children (forced to []). With `render(doc, fmt, { baseUrl })` a relative `src` is rewritten absolute before rendering. Produces &#123; type: 'image', props, children: [] &#125;.

**Example**

```tsx
<Image src="/charts/q4.png" width={480} alt="Q4 revenue" caption="Fig 1" />
```

**Common mistakes**

- Passing a CSS string for `width`/`height` (e.g. "50%") — they are typed `number` (pixels); use `render` options or a Section for relative sizing.
- Relying on a relative `src` without `baseUrl` — chat/email targets need absolute URLs; pass `render(doc, fmt, { baseUrl })` so relative srcs are rewritten. (Telegram/WhatsApp drop inline images entirely.)

**See also:** `render`

---

### Button `component`

```ts
(props: { href: string; background?: string; color?: string; borderRadius?: number; padding?: number | [number, number]; align?: 'left' | 'center' | 'right'; children?: DocChild }) => DocNode
```

A call-to-action button — a LINK styled as a button (renders as an Outlook-safe 'bulletproof button' in email, a styled link in PDF/DOCX). `href` is REQUIRED; children are the label. Produces &#123; type: 'button', props, children &#125;.

**Example**

```tsx
<Button href="https://app.example.com/invoice/42" background="#4f46e5" color="#fff">View invoice</Button>
```

**Common mistakes**

- Expecting an `onClick` handler or a `variant` prop — Button has NEITHER; it is purely a styled link and REQUIRES `href` (documents have no runtime event loop).

**See also:** `Link`

---

### Page / Section / Row / Column / Divider / Spacer / Quote / PageBreak `component`

```ts
Page({ size?: PageSize; orientation?: 'portrait' | 'landscape'; margin?: number | number[]; header?: DocNode | VNode; footer?: DocNode | VNode; children? }) · Section({ direction?: 'column' | 'row'; gap?; padding?; background?; borderRadius?; border?; children? }) · Row({ gap?: number; align?; children? }) · Column({ width?: number | string; align?; children? }) · Divider({ color?; thickness? }) · Spacer({ height: number }) · Quote({ borderColor?; children? }) · PageBreak()
```

The structural / layout primitives. `Page` is a page boundary (`size` 'A4'|'A3'|'A5'|'letter'|'legal'|'tabloid', orientation, margins, optional `header`/`footer` — a primitive given as JSX (`header={<Text>…</Text>}`) or a direct call, resolved when the Page is built; honoured by PDF/DOCX only). `Section`/`Row`/`Column` are layout boxes (gap, align, padding, background). `Divider` is a horizontal rule (no children, all props optional — `Divider()` works bare). `Spacer` adds vertical space (`height: number` is REQUIRED). `Quote` is a blockquote (children). `PageBreak()` takes NO arguments — a hard break in PDF/DOCX, a visual rule in md/text/html, a no-op in per-slide PPTX.

**Example**

```tsx
<Page size="A4" orientation="portrait" header={<Text size={9}>Acme — Confidential</Text>}>
  <Section gap={16}>
    <Heading>Title</Heading>
    <Spacer height={12} />
    <Quote>An important note.</Quote>
    <Divider />
  </Section>
  <PageBreak />
</Page>
```

**Common mistakes**

- `Spacer` without `height` — it is the only required field on these primitives; omitting it is a type error.
- Calling `PageBreak({ ... })` with props — it takes NO arguments and always emits empty props/children.
- Expecting `Column` to enforce a parent `Row` (or `Row` to require `Column` children) — neither is enforced at runtime; children are typed `unknown` and just normalized.

**See also:** `Document` · `render`

---

### registerRenderer / unregisterRenderer / isDocNode `function`

```ts
registerRenderer(format: string, renderer: DocumentRenderer | (() => Promise<DocumentRenderer>)) => void · unregisterRenderer(format: string) => void · isDocNode(value: unknown) => value is DocNode
```

The extension + guard API. `registerRenderer` adds (or REPLACES) a format's renderer — pass a `DocumentRenderer` object (&#123; render(node, options?) &#125;) or a lazy `() => Promise<DocumentRenderer>` loader (every built-in format is a lazy loader; the resolved renderer is cached back into the registry on first use). `unregisterRenderer` deletes a format (no-op if absent). `isDocNode` checks for a DocNode: an object with a STRING `type`, `props`, `children`, and NO `key` — so a JSX / `h()` VNode (whose `type` is the primitive function and which carries a `key`) is NOT a DocNode, even though `render()` accepts one.

**Example**

```tsx
import { registerRenderer, render } from '@pyreon/document'

registerRenderer('rtf', { render: async (node) => toRtf(node) })
const rtf = await render(doc, 'rtf')
```

**Common mistakes**

- registerRenderer SILENTLY OVERWRITES an existing format (it is a bare Map.set, no guard) — re-registering `html` replaces the built-in renderer with no warning.
- Trusting isDocNode to validate the tree — it only checks for a string `type`, `props` and `children` keys and no `key`; it does NOT verify `type` is a real node type or that the shapes are valid (a hand-rolled &#123; type: 'x', props: 0, children: 0 &#125; passes).
- Using isDocNode to test JSX output — `isDocNode(<Text>hi</Text>)` is FALSE (it is a VNode); call the primitive directly (`Text({ children: 'hi' })`) when you need a DocNode value, or just pass the JSX to render().
- Rendering to an unregistered format — render() rejects with [@pyreon/document] No renderer registered for format 'X'. Available: … (the message enumerates the currently-registered keys). The markdown key is 'md', not 'markdown'.

**See also:** `render` · `createDocument`

---

## Package-level notes

> **Note:** Heavy format renderers are lazy-loaded: PDF (~3MB via pdfmake + bundled fonts), DOCX (~700KB via docx), XLSX (~1.1MB via exceljs), PPTX (~400KB via pptxgenjs). First render of each format triggers the dynamic import; subsequent renders are instant. The vendored architecture means apps download all renderer chunks during npm install (14MB total `lib/`), but consumer-side bundlers tree-shake to only ship the renderers an app actually invokes.

> **Format return types:** Binary formats (pdf, docx, xlsx, pptx) return Uint8Array. Text formats (html, email, md, text, csv, svg, json, jsonl, slack, teams, discord, telegram, notion, confluence, whatsapp, google-chat) return string.

> **json vs jsonl:** The json format serializes the full DocNode tree and is round-trippable (JSON.parse → render again). The jsonl format flattens the tree to one content block per line (structural containers dropped) — the standard shape for chunking / embeddings / LLM ingestion. Both are pure (no lazy-load).

> **Not every format expresses every primitive:** CSV/XLSX are tabular extractors (Table nodes only). Chat targets adapt tables to code blocks / fields and drop inline images on Telegram/WhatsApp. A PageBreak is a real break in PDF/DOCX, a visual rule in md/text/html, and a no-op in per-slide PPTX. See the "Primitive × Format Support Matrix" in the docs for the honest per-cell map.

> **JSX vs Builder:** Both APIs produce the same DocNode tree. JSX primitives are better for complex layouts with conditional sections. The builder API is better for programmatic generation (e.g. loop over data to build rows).

> **document-primitives:** For components that render in the browser AND export to documents, use `@pyreon/document-primitives` (rocketstyle-based) + `@pyreon/connector-document` — not the raw primitives from this package.
