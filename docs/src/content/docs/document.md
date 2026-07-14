---
title: Document
description: Universal document rendering for Pyreon — one template, 20 output formats from PDF to Slack.
---

`@pyreon/document` renders **one document template to many output formats**. Compose a format-agnostic node tree once — with JSX primitives or the fluent builder — then render it to PDF, DOCX, XLSX, PPTX, email, HTML, Markdown, plain text, CSV, SVG, JSON / JSONL, or straight into Slack / Teams / Discord / Telegram / Notion / Confluence / WhatsApp / Google Chat payloads.

The heavy binary renderers (PDF, DOCX, XLSX, PPTX) are **lazy-loaded per format** — a document app that only ever emails never downloads the 3 MB PDF engine into its runtime path. Custom formats (receipt printers, internal schemas) are pluggable via `registerRenderer()`.

<PackageBadge name="@pyreon/document" href="/docs/document" />

## Installation

:::code-group

```bash [npm]
npm install @pyreon/document
```

```bash [bun]
bun add @pyreon/document
```

```bash [pnpm]
pnpm add @pyreon/document
```

```bash [yarn]
yarn add @pyreon/document
```

:::

The vendored renderer libraries (pdfmake, docx, exceljs, pptxgenjs) ship inside the package, so this single install covers every format — no peer dependencies to add per format.

## Why One Template, Many Formats?

Most apps that produce documents end up with N hand-maintained codepaths: an HTML invoice template, a separate PDF generation script, a different "email-safe" HTML build, and yet another path that posts a summary to Slack. They drift. A price change in one is forgotten in the others.

`@pyreon/document` collapses that into a single **format-agnostic node tree** — a `DocNode` — and a `render(node, format)` call. The node tree knows nothing about pdfmake, exceljs, or Slack's Block Kit; each renderer walks the same tree and emits its target format. Change the template once; every format updates.

```tsx
import { Document, Page, Heading, Text, Table, render } from '@pyreon/document'

function Invoice({ data }) {
  return (
    <Document title={`Invoice #${data.id}`}>
      <Page size="A4" margin={40}>
        <Heading>Invoice #{data.id}</Heading>
        <Text color="#666">{data.date}</Text>
        <Table columns={['Item', 'Qty', 'Price']} rows={data.lineItems} />
      </Page>
    </Document>
  )
}

const node = <Invoice data={invoiceData} />

await render(node, 'pdf') // → Uint8Array (download / attach)
await render(node, 'email') // → Outlook-safe HTML string
await render(node, 'docx') // → Uint8Array (Word)
await render(node, 'slack') // → Slack Block Kit JSON string
```

<Example file="./examples/document/one-document-tree-many-formats-markdown-preview" title="One document tree → many formats (markdown preview)" />

## Two Authoring APIs

There are two ways to build the same `DocNode` tree. They produce identical output — pick by ergonomics.

### JSX primitives

Best for **static-shaped documents and conditional layouts** — anything you'd naturally write as markup.

```tsx
import { Document, Page, Heading, Text, Table, Divider, List, Code, render } from '@pyreon/document'

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

const pdf = await render(report, 'pdf')
```

### Fluent builder

Best for **programmatic generation** — building a document by looping over data, where markup would be awkward.

```tsx
import { createDocument } from '@pyreon/document'

const doc = createDocument({ title: 'Sales Report', author: 'Analytics Team' })
  .heading('Q4 Sales Report')
  .text('Revenue grew 25% quarter over quarter.')
  .table({
    columns: ['Region', 'Revenue', 'Growth'],
    rows: regions.map((r) => [r.name, r.revenue, r.growth]),
    striped: true,
    headerStyle: { background: '#1a1a2e', color: '#fff' },
  })
  .text('Total: $2.5M', { bold: true, align: 'right' })

// Terminal methods render the tree (each is async):
const pdf = await doc.toPdf() // Uint8Array
const email = await doc.toEmail() // string
const slack = await doc.toSlack() // string
```

:::tip
The builder is **chainable** — every content method returns the builder. The terminal `.toX()` methods read the accumulated tree without consuming it, so you can render the same builder to several formats in a row. Use `.build()` to get the raw `DocNode` if you want to pass it to `render()` directly.
:::

Both APIs are equivalent. JSX gives you conditional sections (`{cond && <Section>…</Section>}`) and component composition; the builder gives you imperative control flow. Mix freely — `createDocument().add(<MyComponent />)` accepts JSX-produced nodes.

## Output Formats

`render(node, format)` is **always async** — the first render of any format dynamically imports its renderer, then caches it for subsequent calls. The return type depends on the format: **binary formats return `Uint8Array`, everything else returns `string`.**

### Documents & files

| Format | `render(node, …)` | Builder method | Library         | Returns       | Lazy |
| ------ | ----------------- | -------------- | --------------- | ------------- | ---- |
| HTML   | `'html'`          | `.toHtml()`    | built-in        | `string`      | yes  |
| PDF    | `'pdf'`           | `.toPdf()`     | pdfmake         | `Uint8Array`  | yes  |
| DOCX   | `'docx'`          | `.toDocx()`    | docx            | `Uint8Array`  | yes  |
| XLSX   | `'xlsx'`          | `.toXlsx()`    | exceljs         | `Uint8Array`  | yes  |
| PPTX   | `'pptx'`          | `.toPptx()`    | pptxgenjs       | `Uint8Array`  | yes  |
| SVG    | `'svg'`           | `.toSvg()`     | built-in        | `string`      | yes  |

### Email & chat

| Format      | `render(node, …)` | Builder method   | Output                                          |
| ----------- | ----------------- | ---------------- | ----------------------------------------------- |
| Email       | `'email'`         | `.toEmail()`     | Outlook-safe table HTML with VML buttons        |
| Slack       | `'slack'`         | `.toSlack()`     | Block Kit JSON string                           |
| Teams       | `'teams'`         | `.toTeams()`     | Adaptive Card JSON string                       |
| Discord     | `'discord'`       | `.toDiscord()`   | Embed JSON string                               |
| Telegram    | `'telegram'`      | `.toTelegram()`  | HTML-subset string                              |
| WhatsApp    | `'whatsapp'`      | `.toWhatsApp()`  | Formatted text (`*bold*`, `_italic_`)           |
| Google Chat | `'google-chat'`   | `.toGoogleChat()`| Card v2 JSON string                             |

### Knowledge bases

| Format          | `render(node, …)` | Builder method    | Output                          |
| --------------- | ----------------- | ----------------- | ------------------------------- |
| Notion          | `'notion'`        | `.toNotion()`     | Block JSON for the Notion API   |
| Confluence/Jira | `'confluence'`    | `.toConfluence()` | Atlassian Document Format (ADF) |

### Data

| Format     | `render(node, …)` | Builder method  | Output                              |
| ---------- | ----------------- | --------------- | ----------------------------------- |
| Markdown   | `'md'`            | `.toMarkdown()` | GFM with pipe tables (cells escaped) |
| Plain text | `'text'`          | `.toText()`     | Aligned ASCII tables                |
| CSV        | `'csv'`           | `.toCsv()`      | Comma-separated rows                |
| JSON       | `'json'`          | `.toJson()`     | Round-trippable `DocNode` tree      |
| JSONL      | `'jsonl'`         | `.toJsonl()`    | One content block per line          |

:::warning
**Don't forget to `await`.** `render()` (and every builder `.toX()` method) is always async because format renderers are lazy-loaded. A missing `await` gives you a `Promise`, not the document.
:::

:::warning
**Binary formats return `Uint8Array`, not a string.** `render(doc, 'pdf')`, `'docx'`, `'xlsx'`, and `'pptx'` resolve to `Uint8Array` — don't try to `.toString()` them or write them as text. Every other format resolves to a `string`. (`render`'s return type is `Promise<string | Uint8Array>`; narrow on the format you requested.)
:::

### JSON & JSONL — the machine-readable IR

The `DocNode` tree is itself the format-agnostic intermediate representation, so two structured formats fall out of it directly:

- **`'json'`** serializes the whole tree, pretty-printed. It is **round-trippable** — `JSON.parse(json)` yields a `DocNode` that `render()` accepts again, into any other format. Use it to inspect, diff, cache, or persist a resolved document tree.
- **`'jsonl'`** flattens the tree to **one content block per line** in document order. Structural containers (`document` / `page` / `section` / `row` / `column`) are traversed but not emitted; every content node becomes a compact JSON object carrying its `type`, its props, the flattened `text`, and — for lists — a flat `items` array. This is the standard shape for ingestion pipelines: chunking for embeddings / RAG, streaming to a log sink, or feeding an LLM.

```ts
const json = await render(doc, 'json') // pretty DocNode tree
const tree = JSON.parse(json) // → DocNode
await render(tree, 'html') // round-trips into any format

const jsonl = await render(doc, 'jsonl')
const blocks = jsonl.split('\n').map((l) => JSON.parse(l))
// → [{ type: 'heading', level: 1, text: 'Report' }, { type: 'text', text: '…' }, …]
```

:::note
For the full structural tree (metadata + nesting preserved) use `'json'`; for the flat, chunk-friendly content stream use `'jsonl'`. Both are pure — no external dependency, no lazy-load.
:::

## Primitive × Format Support Matrix

Not every format can express every primitive — a spreadsheet has no concept of a block quote, a chat message has no page geometry. The renderers **adapt or intentionally drop** a primitive when a format can't express it; the table below is the honest per-cell map (grounded in the actual serializers, not aspirations).

**Legend** — ● native construct · ◐ adapted / approximated · ○ not expressed (dropped by design)

| Primitive | HTML/Email | PDF | DOCX | XLSX | PPTX | MD | Text | CSV | SVG | Chat¹ | Notion/Confluence | JSON/JSONL |
| --------- | :--------: | :-: | :--: | :--: | :--: | :-: | :--: | :-: | :-: | :---: | :---------------: | :--------: |
| Document (metadata) | ● | ● | ● | ◐ | ● | ●² | ◐ | ○ | ◐ | ◐ | ◐ | ● |
| Page | ● | ● | ● | ◐ | ●³ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ● |
| Section / Row / Column | ● | ●⁴ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ● | ◐ | ◐ | ● |
| Heading | ● | ● | ● | ◐⁵ | ● | ● | ● | ○ | ● | ● | ● | ● |
| Text | ● | ● | ● | ○ | ● | ● | ● | ○ | ● | ● | ● | ● |
| Link | ● | ● | ● | ○ | ● | ● | ◐ | ○ | ● | ● | ● | ● |
| Image | ● | ◐⁶ | ◐⁶ | ○ | ◐⁷ | ● | ◐ | ○ | ● | ◐⁸ | ● | ● |
| Button | ● | ● | ● | ○ | ● | ◐ | ◐ | ○ | ● | ◐ | ◐ | ● |
| Code | ● | ● | ● | ○ | ● | ● | ◐ | ○ | ● | ● | ● | ● |
| Quote | ● | ● | ● | ○ | ● | ● | ◐ | ○ | ● | ● | ● | ● |
| List / ListItem | ● | ● | ● | ○ | ● | ● | ● | ○ | ● | ◐ | ● | ● |
| Table | ● | ● | ● | ● | ● | ●⁹ | ● | ● | ◐ | ◐¹⁰ | ● | ● |
| Divider | ● | ● | ● | ○ | ● | ● | ● | ○ | ● | ◐ | ● | ● |
| Spacer | ● | ● | ● | ○ | ● | ◐ | ◐ | ○ | ● | ○ | ◐ | ● |
| PageBreak | ◐¹¹ | ● | ● | ○ | ○¹² | ◐ | ◐ | ○ | ◐ | ◐ | ◐ | ● |

¹ **Chat** = Slack, Teams, Discord, Telegram, WhatsApp, Google Chat — each targets a different payload shape, so a cell is the common behavior; test against the real platform before relying on it.
² Markdown emits document metadata as **YAML frontmatter**. ³ Each `<Page>` becomes a **slide** in PPTX. ⁴ PDF renders `direction="row"` sections/rows as pdfmake `columns`. ⁵ XLSX uses a heading as a **worksheet name**. ⁶ PDF/DOCX embed `data:` images; `http(s)`/local paths become a placeholder (they can't be fetched at render time). ⁷ PPTX embeds `data:` images only; `http(s)` URLs are skipped. ⁸ Slack/Discord/Google Chat embed **public `http` image URLs**; Telegram/WhatsApp drop inline images (send them separately via the platform API). ⁹ Markdown table cells escape `|` and `\` and collapse newlines to `<br>` so the column structure is never corrupted. ¹⁰ Chat targets render tables as a fenced code block, an ASCII grid, or embed fields (platform-dependent). ¹¹ HTML/Email emit a CSS `page-break-after` marker (visible only when the HTML is printed/paginated). ¹² PPTX models one slide per `<Page>`, so an in-page `PageBreak` is not a slide boundary.

CSV and XLSX are **tabular extractors** — they walk the tree for `Table` nodes (XLSX also names sheets from headings) and ignore prose; that's by design, not a gap.

## Lazy-Loading & Bundle Cost

The four heavy renderers are imported on demand via dynamic `import()`:

```ts
// Inside render.ts — registered as lazy loaders, resolved on first use:
registerRenderer('pdf', () => import('./renderers/pdf').then((m) => m.pdfRenderer))
registerRenderer('docx', () => import('./renderers/docx').then((m) => m.docxRenderer))
// …etc.
```

The first `render(doc, 'pdf')` triggers the dynamic import of pdfmake (and its bundled fonts); the resolved renderer is cached, so every subsequent PDF render is instant.

:::note
**Approximate chunk sizes** of the lazy-loaded vendor libraries: PDF ~3 MB (pdfmake + bundled fonts), XLSX ~1.1 MB (exceljs), DOCX ~700 KB (docx), PPTX ~400 KB (pptxgenjs). The string/JSON renderers (HTML, Markdown, text, CSV, SVG, email, and all chat/KB targets) are small and built-in.

The vendored architecture means `npm install @pyreon/document` pulls every renderer (~14 MB in `lib/`), but **consumer-side bundlers tree-shake to only the renderers an app actually invokes** — an app that never calls `render(doc, 'pptx')` never ships pptxgenjs to its users. On the server, the dynamic `import()` only loads the chunk on first use of that format.
:::

## Primitives

18 JSX primitives compose the document tree. Each is also a plain function returning a `DocNode`, so they work outside JSX (`Heading({ level: 1, children: 'Title' })`).

| Primitive               | Description                                                        |
| ----------------------- | ------------------------------------------------------------------ |
| `<Document>`            | Root container — holds metadata (`title`, `author`, `subject`, …)  |
| `<Page>`                | Page with `size`, `orientation`, `margin`, `header`, `footer`      |
| `<Section>`             | Layout group with `direction`, `gap`, `padding`, `background`      |
| `<Row>`                 | Horizontal layout container                                        |
| `<Column>`              | Column within a `Row` (`width`, `align`)                           |
| `<Heading>`             | Heading, `level` 1–6                                               |
| `<Text>`                | Paragraph — `bold`, `italic`, `underline`, `color`, `size`, `align`|
| `<Link>`                | Hyperlink (`href`)                                                 |
| `<Image>`               | Image with `width`, `height`, `alt`, `caption`, `align`            |
| `<Table>`               | Data table — `columns`, `rows`, `striped`, `bordered`, `headerStyle` |
| `<List>`                | Ordered or unordered list                                          |
| `<ListItem>`            | A single item within a `List`                                      |
| `<Code>`                | Code block with optional `language` hint                           |
| `<Divider>`             | Horizontal rule (`color`, `thickness`)                             |
| `<Spacer>`              | Vertical gap (`height`, required)                                  |
| `<Button>`              | CTA — bulletproof VML button in email, styled link elsewhere       |
| `<Quote>`               | Block quote (`borderColor`)                                        |
| `<PageBreak>`           | Force a page break (PDF/DOCX); visual separator elsewhere          |

### Text formatting

```tsx
<Text bold size={14} color="#333">Bold heading text</Text>
<Text italic align="right">Subtotal: $100</Text>
<Text underline>Underlined</Text>
<Text strikethrough>Crossed out</Text>
<Text align="justify" lineHeight={1.6}>A justified paragraph with custom line height.</Text>
```

### Headings

```tsx
<Heading level={1}>Page Title</Heading>
<Heading level={2} color="#666" align="center">Section</Heading>
```

`level` defaults to `1` if omitted.

### Lists

The `<List>` primitive takes `<ListItem>` children; the builder's `.list(items[])` is sugar over the same shape.

```tsx
<List ordered>
  <ListItem>First step</ListItem>
  <ListItem>Second step</ListItem>
</List>

// Builder equivalent:
createDocument().list(['First step', 'Second step'], { ordered: true })
```

### Code blocks

```tsx
<Code language="typescript">const total = items.reduce((s, i) => s + i.price, 0)</Code>
```

### Links, dividers, spacers, quotes

```tsx
<Link href="https://example.com">Visit site</Link>
<Divider color="#ddd" thickness={2} />
<Spacer height={24} />
<Quote borderColor="#4f46e5">A pull quote with a colored left border.</Quote>
```

## Tables

The most-used primitive. Columns accept either bare strings or `TableColumn` objects with `header`, `width`, and `align`; rows are arrays of strings or numbers.

```tsx
<Table
  columns={[
    { header: 'Name', width: '50%' },
    { header: 'Price', align: 'right', width: '25%' },
    { header: 'Qty', align: 'center', width: '25%' },
  ]}
  rows={[
    ['Widget', '$10', 5],
    ['Gadget', '$20', 3],
  ]}
  striped // alternating row backgrounds
  bordered // cell borders
  keepTogether // avoid a mid-table page break (PDF)
  headerStyle={{ background: '#1a1a2e', color: '#fff', bold: true }}
  caption="Order Items"
/>
```

:::note
`keepTogether` maps to pdfmake's `unbreakable` flag, so it only affects the **PDF** renderer's pagination. It's a no-op in formats that don't paginate (HTML, Markdown, chat targets).
:::

## Pages, Layout & Metadata

`<Document>` carries metadata used by the binary renderers (PDF/DOCX file properties). `<Page>` controls page geometry and per-page headers/footers.

```tsx
<Document title="Annual Report" author="Acme Corp" subject="FY2026" keywords={['finance', 'annual']} language="en">
  <Page
    size="A4"          // 'A4' | 'A3' | 'A5' | 'letter' | 'legal' | 'tabloid'
    orientation="portrait"  // 'portrait' | 'landscape'
    margin={[40, 60]}  // number | [v, h] | [top, right, bottom, left]
    header={<Text size={9} color="#999">Acme Corp — Confidential</Text>}
    footer={<Text size={9} align="center">Page footer</Text>}
  >
    <Section direction="row" gap={20} padding={16} background="#f5f5f5">
      <Column width="60%"><Text>Main column</Text></Column>
      <Column width="40%"><Text>Sidebar</Text></Column>
    </Section>
    <PageBreak />
    <Heading>Next page</Heading>
  </Page>
</Document>
```

:::note
`header` and `footer` on `<Page>`, multi-page layout via `<PageBreak>`, and headers/footers in general are honored by paginated formats (PDF, DOCX). Chat and data formats flatten the tree to their target shape and ignore page geometry.
:::

## Email

`render(doc, 'email')` emits **Outlook-safe, table-based HTML** — the conservative subset every email client (including Outlook's Word rendering engine) handles. `<Button>` becomes a bulletproof VML button so it renders correctly in Outlook as well as web/mobile clients.

```tsx
const html = await render(
  <Document title="Welcome">
    <Page>
      <Heading>Welcome aboard 👋</Heading>
      <Text>Thanks for signing up. Confirm your address to get started.</Text>
      <Button href="https://acme.com/confirm" background="#4f46e5" color="#fff" align="center">
        Confirm Email
      </Button>
    </Page>
  </Document>,
  'email',
)

// Send `html` via your transactional email provider.
```

## Chat & Knowledge-Base Targets

Render the same tree straight into the JSON payloads platforms expect — useful for notifications, bot messages, and syncing content into wikis.

```tsx
const summary = createDocument({ title: 'Deploy Report' })
  .heading('Deploy v2.4.0 ✅')
  .text('All checks passed in 4m 12s.')
  .table({ columns: ['Service', 'Status'], rows: [['api', '✅'], ['web', '✅']] })

// Post to Slack:
const blocks = JSON.parse(await summary.toSlack())
await fetch(slackWebhook, { method: 'POST', body: JSON.stringify({ blocks }) })

// Sync into Notion (block JSON for the Notion API):
const notionBlocks = JSON.parse(await summary.toNotion())

// Confluence / Jira (Atlassian Document Format):
const adf = JSON.parse(await summary.toConfluence())
```

Each chat/KB renderer returns a **JSON string** (or formatted text for WhatsApp). Parse it before handing it to the platform's API.

## Embedding Charts & Flow Diagrams

The builder can snapshot a `@pyreon/charts` or `@pyreon/flow` instance into an image node, so a rendered chart or diagram lands in your PDF / DOCX / email.

```tsx
const doc = createDocument({ title: 'Dashboard' })
  .heading('Monthly Dashboard')
  .chart(chartInstance, { width: 500, height: 300, caption: 'Revenue' })
  .flow(flowInstance, { width: 600, height: 400, caption: 'Pipeline' })

await doc.toPdf()
```

`.chart()` calls the instance's `getDataURL()` to capture a PNG; `.flow()` calls `toSVG()` and inlines it as an SVG data URI. If the passed object doesn't expose those methods, the builder inserts a `[Chart]` / `[Flow Diagram]` placeholder text node instead of throwing.

## Browser Download

`download()` renders and triggers a browser file download in one call. The **file extension determines the format** via an internal extension → format map.

```tsx
import { download } from '@pyreon/document'

await download(reportNode, 'report.pdf') // → renders 'pdf', downloads
await download(reportNode, 'sheet.xlsx') // → renders 'xlsx', downloads
await download(reportNode, 'notes.md') // → renders 'md', downloads

// Builder shorthand — same behavior:
await createDocument().heading('Hi').download('hello.docx')
```

Supported extensions: `.html` / `.htm`, `.pdf`, `.docx` / `.doc`, `.xlsx` / `.xls`, `.pptx` / `.ppt`, `.md`, `.txt`, `.csv`, `.svg`.

:::warning
`download()` is **browser-only** — it creates an object URL and clicks a hidden anchor. Calling it on the server throws `download() requires a browser environment`. To save a file server-side, use `render()` and write the `Uint8Array` / string to disk yourself.
:::

:::warning
The extension map does **not** cover email or chat formats (there's no canonical file extension for them). `download(doc, 'msg.email')` throws `Unknown file extension '.email'`. Render those with `render()` / `.toEmail()` and send the string directly.
:::

## Render Options

Both `render(node, format, options)` and the builder `.toX(options)` methods accept a shared `RenderOptions`.

```tsx
await render(doc, 'pdf', {
  // Resolve relative <Image src> values against this base — applied across every format:
  baseUrl: 'https://cdn.example.com/assets/',

  // Text direction:
  direction: 'rtl', // 'ltr' (default) | 'rtl'

  // Custom embedded fonts for the PDF renderer:
  fonts: {
    MyFont: {
      normal: 'https://cdn.example.com/MyFont-Regular.ttf',
      bold: 'https://cdn.example.com/MyFont-Bold.ttf',
      italics: 'https://cdn.example.com/MyFont-Italic.ttf',
      bolditalics: 'https://cdn.example.com/MyFont-BoldItalic.ttf',
    },
  },

  // Override resolved styles by node type:
  styles: { heading: { color: '#1a1a2e', fontSize: 28 } },
})
```

| Option      | Type                                              | Applies to | Description                                                      |
| ----------- | ------------------------------------------------- | ---------- | --------------------------------------------------------------- |
| `baseUrl`   | `string`                                          | all        | Resolves relative `<Image src>` paths to absolute URLs          |
| `direction` | `'ltr' \| 'rtl'`                                  | all        | Text direction (default `'ltr'`)                                |
| `fonts`     | `Record<string, { normal?; bold?; … }>`           | PDF        | Custom embedded fonts for pdfmake                               |
| `styles`    | `Record<string, ResolvedStyles>`                  | all        | Per-node-type style overrides                                   |

`baseUrl` walks the tree once and rewrites only relative image sources — absolute URLs (`http(s):`, protocol-relative, `data:`, `blob:`) pass through untouched, so `<Image src="./logo.png" />` becomes `https://cdn.example.com/assets/logo.png` in every output format.

## Custom Renderers

Register a renderer for a new format string. It receives the `DocNode` tree and `RenderOptions`, and returns a `string` or `Uint8Array`. Use this for receipt printers, internal serialization schemas, or any target the built-ins don't cover.

```tsx
import { registerRenderer, render } from '@pyreon/document'

registerRenderer('thermal', {
  async render(node, options) {
    // Walk node.children → ESC/POS commands for a receipt printer
    return escPosBuffer // string | Uint8Array
  },
})

const receipt = await render(orderDoc, 'thermal')
```

You can also register a **lazy loader** (a `() => Promise<DocumentRenderer>`) so a heavy custom renderer only loads on first use — exactly how the built-ins work:

```tsx
registerRenderer('thermal', () => import('./thermal-renderer').then((m) => m.thermalRenderer))
```

`unregisterRenderer(format)` removes a registered format. Registering a known format name **overrides** the built-in for that format.

:::tip
Walk the tree with the exported `isDocNode()` type guard to distinguish nodes from string children. The `getTextContent()` helper (used internally by most renderers) flattens a node's children to concatenated text — import it from the package if your renderer only needs the text content of a subtree.
:::

## Security

Every built-in renderer sanitizes user-controlled values before emitting them, via the package's shared `sanitize` utilities:

- **CSS injection** — `sanitizeColor()` validates color/background values (hex, named, `rgb()/rgba()/hsl()/hsla()`); `sanitizeCss()` strips characters that could break out of a CSS property.
- **XML injection** — `sanitizeXmlColor()` validates hex colors for the DOCX/PPTX XML output.
- **Protocol attacks** — `sanitizeHref()` blocks `javascript:`, `vbscript:`, and non-image `data:` URIs in links.
- **Image sources** — `sanitizeImageSrc()` allows `http(s):`, `data:image/*`, and relative paths; blocks script protocols and non-image data URIs.
- **HTML escaping** — `escapeXml()` escapes `& < > "` for safe inclusion in HTML/XML output.

:::warning
A node tree is built from your application data, but the renderers still sanitize at the output boundary — never assume a malicious `color`, `href`, or image `src` is safe just because it came from "your" data. The sanitizers run on every render regardless.
:::

## Related: Browser + Export Components

The primitives in this package build a render-only `DocNode` tree — they don't render to the DOM. For components that **render live in the browser AND export to documents** (e.g. a report preview that's also downloadable as PDF), use `@pyreon/document-primitives` (rocketstyle-based) together with `@pyreon/connector-document`. Those bridge the UI system to this package's `render()` rather than replacing it.

## API Reference

### Functions

| Export                  | Signature                                                                       | Returns                          |
| ----------------------- | ------------------------------------------------------------------------------- | -------------------------------- |
| `render`                | `(node: DocNode, format: OutputFormat \| string, options?: RenderOptions)`      | `Promise<string \| Uint8Array>`  |
| `createDocument`        | `(props?: DocumentProps)`                                                        | `DocumentBuilder`                |
| `download`              | `(node: DocNode, filename: string, options?: RenderOptions)`                    | `Promise<void>` (browser only)   |
| `registerRenderer`      | `(format: string, renderer: DocumentRenderer \| (() => Promise<DocumentRenderer>))` | `void`                       |
| `unregisterRenderer`    | `(format: string)`                                                               | `void`                           |
| `isDocNode`             | `(value: unknown)`                                                               | `value is DocNode` (type guard)  |

### Primitives

All primitives return a `DocNode` and double as plain functions. (`Document`, `Page`, `Section`, `Row`, `Column`, `Heading`, `Text`, `Link`, `Image`, `Table`, `List`, `ListItem`, `Code`, `Divider`, `Spacer`, `Button`, `Quote`, `PageBreak`.)

| Primitive   | Key props                                                                          |
| ----------- | ---------------------------------------------------------------------------------- |
| `Document`  | `title?`, `author?`, `subject?`, `keywords?`, `language?`                          |
| `Page`      | `size?`, `orientation?`, `margin?`, `header?`, `footer?`                            |
| `Section`   | `direction?`, `gap?`, `padding?`, `background?`, `borderRadius?`, `border?`         |
| `Row`       | `gap?`, `align?`                                                                    |
| `Column`    | `width?`, `align?`                                                                  |
| `Heading`   | `level?` (1–6, default 1), `color?`, `align?`                                       |
| `Text`      | `size?`, `color?`, `bold?`, `italic?`, `underline?`, `strikethrough?`, `align?`, `lineHeight?` |
| `Link`      | `href` (required), `color?`                                                         |
| `Image`     | `src` (required), `width?`, `height?`, `alt?`, `align?`, `caption?`                 |
| `Table`     | `columns` (required), `rows` (required), `headerStyle?`, `striped?`, `bordered?`, `caption?`, `keepTogether?` |
| `List`      | `ordered?`                                                                          |
| `ListItem`  | — (children only)                                                                  |
| `Code`      | `language?`                                                                         |
| `Divider`   | `color?`, `thickness?`                                                              |
| `Spacer`    | `height` (required)                                                                 |
| `Button`    | `href` (required), `background?`, `color?`, `borderRadius?`, `padding?`, `align?`   |
| `Quote`     | `borderColor?`                                                                      |
| `PageBreak` | — (no props)                                                                        |

### `DocumentBuilder` methods

Content methods return the builder (chainable). `build()` returns the `DocNode`. Every `to*()` method is async and renders the accumulated tree.

| Method                       | Returns               | Description                                          |
| ---------------------------- | --------------------- | ---------------------------------------------------- |
| `.heading(text, props?)`     | `DocumentBuilder`     | Add a heading                                        |
| `.text(text, props?)`        | `DocumentBuilder`     | Add a text paragraph                                 |
| `.paragraph(text, props?)`   | `DocumentBuilder`     | Alias for `.text()`                                  |
| `.image(src, props?)`        | `DocumentBuilder`     | Add an image                                         |
| `.table(props)`              | `DocumentBuilder`     | Add a table                                          |
| `.list(items, props?)`       | `DocumentBuilder`     | Add a list from a string array                       |
| `.code(text, props?)`        | `DocumentBuilder`     | Add a code block                                     |
| `.divider(props?)`           | `DocumentBuilder`     | Add a divider                                        |
| `.spacer(height)`            | `DocumentBuilder`     | Add vertical space                                   |
| `.quote(text, props?)`       | `DocumentBuilder`     | Add a block quote                                    |
| `.button(text, props)`       | `DocumentBuilder`     | Add a CTA button                                     |
| `.link(text, props)`         | `DocumentBuilder`     | Add a hyperlink                                      |
| `.pageBreak()`               | `DocumentBuilder`     | Force a page break                                   |
| `.add(node \| node[])`       | `DocumentBuilder`     | Add an arbitrary `DocNode` (e.g. JSX output)         |
| `.section(children)`         | `DocumentBuilder`     | Group nodes into a `Section`                         |
| `.chart(instance, props?)`   | `DocumentBuilder`     | Snapshot a `@pyreon/charts` instance as an image     |
| `.flow(instance, props?)`    | `DocumentBuilder`     | Snapshot a `@pyreon/flow` instance as an SVG image   |
| `.build()`                   | `DocNode`             | Get the raw node tree                                |
| `.toHtml(options?)`          | `Promise<string>`     | Render to HTML                                       |
| `.toPdf(options?)`           | `Promise<Uint8Array>` | Render to PDF                                        |
| `.toDocx(options?)`          | `Promise<Uint8Array>` | Render to DOCX                                       |
| `.toXlsx(options?)`          | `Promise<Uint8Array>` | Render to XLSX                                       |
| `.toPptx(options?)`          | `Promise<Uint8Array>` | Render to PPTX                                       |
| `.toSvg(options?)`           | `Promise<string>`     | Render to SVG                                        |
| `.toEmail(options?)`         | `Promise<string>`     | Render to Outlook-safe email HTML                    |
| `.toMarkdown(options?)`      | `Promise<string>`     | Render to Markdown                                   |
| `.toText(options?)`          | `Promise<string>`     | Render to plain text                                 |
| `.toCsv(options?)`           | `Promise<string>`     | Render to CSV                                        |
| `.toSlack(options?)`         | `Promise<string>`     | Render to Slack Block Kit JSON                       |
| `.toTeams(options?)`         | `Promise<string>`     | Render to Teams Adaptive Card JSON                   |
| `.toDiscord(options?)`       | `Promise<string>`     | Render to Discord embed JSON                         |
| `.toTelegram(options?)`      | `Promise<string>`     | Render to Telegram HTML subset                       |
| `.toNotion(options?)`        | `Promise<string>`     | Render to Notion block JSON                          |
| `.toConfluence(options?)`    | `Promise<string>`     | Render to Atlassian Document Format                  |
| `.toWhatsApp(options?)`      | `Promise<string>`     | Render to WhatsApp formatted text                    |
| `.toGoogleChat(options?)`    | `Promise<string>`     | Render to Google Chat Card v2 JSON                   |
| `.download(filename, opts?)` | `Promise<void>`       | Render by file extension + download (browser only)   |

### `OutputFormat`

```ts
type OutputFormat =
  | 'html' | 'pdf' | 'docx' | 'pptx' | 'email' | 'xlsx'
  | 'md' | 'text' | 'csv' | 'svg'
  | 'slack' | 'teams' | 'discord' | 'telegram'
  | 'notion' | 'confluence' | 'whatsapp' | 'google-chat'
  | 'json' | 'jsonl' // typed but not built-in — register your own
```

### Exported types

`DocNode`, `DocChild`, `NodeType`, `DocumentProps`, `DocumentBuilder`, `DocumentRenderer`, `RenderOptions`, `RenderResult`, `ResolvedStyles`, `OutputFormat`, `PageSize`, `PageOrientation`, and the per-primitive prop interfaces (`PageProps`, `SectionProps`, `RowProps`, `ColumnProps`, `HeadingProps`, `TextProps`, `LinkProps`, `ImageProps`, `TableProps`, `TableColumn`, `ListProps`, `ListItemProps`, `CodeProps`, `DividerProps`, `SpacerProps`, `ButtonProps`, `QuoteProps`).
