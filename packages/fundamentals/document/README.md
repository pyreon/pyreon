# @pyreon/document

Universal document rendering for Pyreon. One template, every output format: HTML, PDF, DOCX, email, XLSX, Markdown, plain text, CSV, and custom formats.

## Install

```bash
bun add @pyreon/document
```

## Quick Start

```tsx
import { Document, Page, Heading, Text, Table, render } from '@pyreon/document'

const doc = (
  <Document title="Report">
    <Page>
      <Heading>Sales Report</Heading>
      <Text>Q4 performance summary.</Text>
      <Table
        columns={['Region', 'Revenue']}
        rows={[['US', '$1M'], ['EU', '$800K']]}
      />
    </Page>
  </Document>
)

await render(doc, 'pdf')    // PDF Uint8Array
await render(doc, 'email')  // email-safe HTML string
await render(doc, 'md')     // Markdown string
```

## Browser Download

```tsx
import { download } from '@pyreon/document'

await download(doc, 'pdf', 'report.pdf')
```

## API

### Primitives

Layout: `Document`, `Page`, `PageBreak`, `Section`, `Row`, `Column`, `Spacer`, `Divider`

Content: `Heading`, `Text`, `Image`, `Link`, `Button`, `Code`, `Quote`, `List`, `ListItem`, `Table`

### `render(doc, format, options?)`

Render a document tree to the specified format. Returns a `RenderResult` (string or `Uint8Array` depending on format).

### `download(doc, format, filename, options?)`

Browser-only. Renders and triggers a file download.

### `registerRenderer(format, renderer)` / `unregisterRenderer(format)`

Register custom output formats.

### `createDocument()`

Imperative builder API for constructing documents without JSX.

## License

MIT
