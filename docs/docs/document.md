---
title: Document
description: Universal document rendering for Pyreon — one template, 14 output formats.
---

`@pyreon/document` renders a single document template to 14+ output formats — HTML, PDF, DOCX, email, XLSX, PPTX, Slack, Teams, Discord, Telegram, Notion, Confluence, WhatsApp, Google Chat, SVG, Markdown, plain text, and CSV. Heavy renderers are lazy-loaded. Custom formats are pluggable.

<PackageBadge name="@pyreon/document" href="/docs/document" />

## Installation

::: code-group
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

## Quick Start — Builder Pattern

```tsx
import { createDocument } from '@pyreon/document'

const doc = createDocument({ title: 'Sales Report' })
  .heading('Q4 Sales Report')
  .text('Revenue grew 25% quarter over quarter.')
  .table({
    columns: ['Region', 'Revenue', 'Growth'],
    rows: [
      ['US', '$1.2M', '+30%'],
      ['EU', '$800K', '+15%'],
      ['APAC', '$500K', '+40%'],
    ],
    striped: true,
    headerStyle: { background: '#1a1a2e', color: '#fff' },
  })
  .text('Total: $2.5M', { bold: true, align: 'right' })

// Export to any format
await doc.toPdf()       // PDF buffer
await doc.toDocx()      // Word document
await doc.toEmail()     // Outlook-safe HTML
await doc.toSlack()     // Slack Block Kit JSON
await doc.toNotion()    // Notion blocks
await doc.download('report.pdf')  // Browser download
```

## Quick Start — JSX Pattern

```tsx
import { Document, Page, Heading, Text, Table, Button, render } from '@pyreon/document'

function Invoice({ data }) {
  return (
    <Document title={`Invoice #${data.id}`}>
      <Page size="A4" margin={40}>
        <Heading>Invoice #{data.id}</Heading>
        <Text color="#666">{data.date}</Text>
        <Table
          columns={[
            { header: 'Item', width: '50%' },
            { header: 'Qty', align: 'center' },
            { header: 'Price', align: 'right' },
          ]}
          rows={data.items.map(i => [i.name, i.qty, `$${i.price}`])}
          striped
        />
        <Text bold align="right" size={18}>Total: ${data.total}</Text>
        <Button href={data.payUrl} background="#4f46e5" align="center">
          Pay Now
        </Button>
      </Page>
    </Document>
  )
}

// Same template → any format
const pdf = await render(<Invoice data={invoiceData} />, 'pdf')
const email = await render(<Invoice data={invoiceData} />, 'email')
const docx = await render(<Invoice data={invoiceData} />, 'docx')
```

## Output Formats

### Documents

| Format | Method | Library | Lazy |
|---|---|---|---|
| HTML | `render(doc, 'html')` | Built-in | No |
| PDF | `render(doc, 'pdf')` | pdfmake (~300KB) | Yes |
| DOCX | `render(doc, 'docx')` | docx (~100KB) | Yes |
| XLSX | `render(doc, 'xlsx')` | exceljs (~500KB) | Yes |
| PPTX | `render(doc, 'pptx')` | pptxgenjs (~200KB) | Yes |
| SVG | `render(doc, 'svg')` | Built-in | No |

### Communication

| Format | Method | Output |
|---|---|---|
| Email | `render(doc, 'email')` | Outlook-safe table-based HTML with VML buttons |
| Slack | `render(doc, 'slack')` | Block Kit JSON |
| Teams | `render(doc, 'teams')` | Adaptive Cards JSON |
| Discord | `render(doc, 'discord')` | Embed JSON |
| Telegram | `render(doc, 'telegram')` | HTML subset |
| WhatsApp | `render(doc, 'whatsapp')` | Formatted text (`*bold*`, `_italic_`) |
| Google Chat | `render(doc, 'google-chat')` | Card V2 JSON |

### Knowledge Bases

| Format | Method | Output |
|---|---|---|
| Notion | `render(doc, 'notion')` | Block JSON for Notion API |
| Confluence/Jira | `render(doc, 'confluence')` | Atlassian Document Format (ADF) |

### Data

| Format | Method | Output |
|---|---|---|
| Markdown | `render(doc, 'md')` | Markdown with pipe tables |
| Plain text | `render(doc, 'text')` | Aligned ASCII tables |
| CSV | `render(doc, 'csv')` | Comma-separated values |

## Primitives

| Primitive | Description |
|---|---|
| `<Document>` | Root container with metadata (title, author) |
| `<Page>` | Page with size, orientation, margin, header, footer |
| `<Section>` | Layout container with direction, gap, padding, background |
| `<Row>` / `<Column>` | Horizontal layout |
| `<Heading>` | Headings h1–h6 |
| `<Text>` | Paragraph with bold, italic, color, size, align |
| `<Link>` | Hyperlink |
| `<Image>` | Image with width, height, alt, caption |
| `<Table>` | Data table with columns, rows, striped, bordered, headerStyle |
| `<List>` / `<ListItem>` | Ordered or unordered list |
| `<Code>` | Code block with language |
| `<Divider>` | Horizontal rule |
| `<Spacer>` | Vertical gap |
| `<Button>` | CTA button (VML in email, styled link in PDF) |
| `<Quote>` | Block quote |
| `<PageBreak>` | Force page break (PDF/DOCX) |

## Table Options

```tsx
<Table
  columns={[
    { header: 'Name', width: '50%' },
    { header: 'Price', align: 'right', width: '25%' },
    { header: 'Qty', align: 'center', width: '25%' },
  ]}
  rows={[['Widget', '$10', '5'], ['Gadget', '$20', '3']]}
  striped              // alternating row colors
  bordered             // cell borders
  keepTogether         // avoid page breaks within table (PDF)
  headerStyle={{ background: '#1a1a2e', color: '#fff' }}
  caption="Order Items"
/>
```

## Chart and Flow Integration

Embed charts and flow diagrams from other Pyreon packages:

```tsx
// Builder pattern
const doc = createDocument()
  .heading('Dashboard')
  .chart(chartInstance, { width: 500, height: 300 })
  .flow(flowInstance, { width: 600, height: 400 })

// Charts use instance.getDataURL() → PNG
// Flow diagrams use instance.toSVG() → SVG
```

## Custom Renderers

```tsx
import { registerRenderer } from '@pyreon/document'

registerRenderer('thermal', {
  async render(node, options) {
    // Walk node tree → ESC/POS commands for receipt printers
    return escPosBuffer
  },
})

await render(doc, 'thermal')
```

## Browser Download

```tsx
import { download } from '@pyreon/document'

// File extension determines format
await download(doc, 'report.pdf')
await download(doc, 'report.docx')
await download(doc, 'data.xlsx')
await download(doc, 'slides.pptx')
```

## Render Options

```tsx
await render(doc, 'html', {
  direction: 'rtl',     // RTL text direction
  fonts: {               // Custom PDF fonts
    MyFont: { normal: 'path/to/font.ttf' },
  },
})
```

## Security

All renderers include built-in sanitization:

- **CSS injection** — `sanitizeColor()` validates all color/background values
- **XML injection** — `sanitizeXmlColor()` validates hex colors for DOCX/PPTX
- **Protocol validation** — `sanitizeHref()` blocks `javascript:`, `vbscript:` in all links
- **Image validation** — `sanitizeImageSrc()` validates image sources
