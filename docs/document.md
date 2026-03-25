# @pyreon/document

Universal document rendering for Pyreon. One template, every output format: HTML, PDF, DOCX, PPTX, email, XLSX, Markdown, plain text, CSV, SVG, and messaging platforms.

## Installation

```bash
bun add @pyreon/document
```

## Usage

### Defining a Document

```tsx
import { Document, Page, Heading, Text, Table, render } from "@pyreon/document"

const doc = (
  <Document title="Sales Report">
    <Page>
      <Heading>Q4 Results</Heading>
      <Text>Revenue increased 25% year-over-year.</Text>
      <Table
        columns={["Region", "Revenue", "Growth"]}
        rows={[
          ["US", "$1.2M", "+30%"],
          ["EU", "$800K", "+18%"],
        ]}
      />
    </Page>
  </Document>
)

const pdf = await render(doc, "pdf")     // Uint8Array
const html = await render(doc, "html")   // string
const email = await render(doc, "email") // email-safe HTML string
const md = await render(doc, "md")       // Markdown string
```

### Programmatic Builder

```ts
import { createDocument } from "@pyreon/document"

const doc = createDocument("Invoice")
  .page()
    .heading("Invoice #1234")
    .text("Due: 2026-04-01")
    .table(["Item", "Amount"], [["Widget", "$50"], ["Gadget", "$75"]])
  .build()

await render(doc, "pdf")
```

### Browser Download

```ts
import { download } from "@pyreon/document"

await download(doc, "pdf", "report.pdf")
```

### Custom Renderers

```ts
import { registerRenderer, unregisterRenderer } from "@pyreon/document"

registerRenderer("custom-format", {
  render: async (node, options) => {
    // traverse DocNode tree, return result
    return { content: "...", mimeType: "text/plain" }
  },
})
```

## Primitives

| Component | Description |
| --- | --- |
| `Document` | Root container with `title`, metadata |
| `Page` | Page boundary with optional `size`, `orientation` |
| `Heading` | Heading text (level 1-6) |
| `Text` | Paragraph text with optional styling |
| `Table` | Data table with `columns` and `rows` |
| `List` / `ListItem` | Ordered or unordered lists |
| `Image` | Image with `src`, `alt`, `width`, `height` |
| `Link` | Hyperlink with `href` |
| `Code` | Code block with optional `language` |
| `Quote` | Block quote |
| `Section` | Logical grouping |
| `Row` / `Column` | Layout primitives |
| `Divider` | Horizontal rule |
| `Spacer` | Vertical spacing |
| `PageBreak` | Force page break |
| `Button` | Call-to-action (email/HTML) |

## Output Formats

`html`, `pdf`, `docx`, `pptx`, `email`, `xlsx`, `md`, `text`, `csv`, `svg`, `slack`, `teams`, `discord`, `telegram`, `notion`, `confluence`, `whatsapp`, `google-chat`

## API Reference

| Export | Description |
| --- | --- |
| `render(doc, format, options?)` | Render a document to a target format |
| `createDocument(title)` | Programmatic document builder |
| `download(doc, format, filename)` | Browser file download |
| `registerRenderer(format, renderer)` | Register a custom output renderer |
| `unregisterRenderer(format)` | Remove a registered renderer |
| `isDocNode(value)` | Type guard for document nodes |
