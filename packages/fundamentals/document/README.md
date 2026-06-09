# @pyreon/document

Universal document rendering — one template, 20+ output formats.

A platform-agnostic document tree (18 primitives) plus a renderer registry that produces HTML, PDF, DOCX, PPTX, XLSX, email-safe HTML, Markdown, plain text, CSV, SVG, JSON / JSONL, and direct payloads for Slack / Teams / Discord / Telegram / Notion / Confluence / WhatsApp / Google Chat. Use it for invoices, reports, exports, transactional emails, and "send to anywhere" surfaces — write the document tree once, render to whatever the caller needs. Heavy renderers (PDF, DOCX, XLSX, PPTX) lazy-load — they ship in the published `lib/` but only land in the consumer's bundle when their format is invoked.

## Install

```bash
bun add @pyreon/document @pyreon/core @pyreon/reactivity
```

## Quick start — JSX form

```tsx
import { Document, Page, Heading, Text, Table, render } from '@pyreon/document'

const doc = (
  <Document title="Q4 Report" author="Finance">
    <Page>
      <Heading>Sales Report</Heading>
      <Text>Q4 2026 performance summary.</Text>
      <Table
        columns={['Region', 'Revenue']}
        rows={[
          ['US', '$1M'],
          ['EU', '$800K'],
        ]}
      />
    </Page>
  </Document>
)

await render(doc, 'pdf') // Uint8Array
await render(doc, 'email') // email-safe HTML string
await render(doc, 'md') // Markdown string
await render(doc, 'docx') // Uint8Array
```

## Quick start — builder form

```ts
import { createDocument } from '@pyreon/document'

const doc = createDocument({ title: 'Report' })
  .heading('Sales Report')
  .text('Q4 performance summary.')
  .table({ columns: ['Region', 'Revenue'], rows: [['US', '$1M']] })

const pdf = await doc.toPdf()
const md = await doc.toMarkdown()
const slack = await doc.toSlack()
```

Builder methods mirror every renderer: `toHtml` / `toPdf` / `toDocx` / `toPptx` / `toXlsx` / `toEmail` / `toMarkdown` / `toText` / `toCsv` / `toSvg` / `toSlack` / `toTeams` / `toDiscord` / `toTelegram` / `toNotion` / `toConfluence` / `toWhatsApp` / `toGoogleChat`.

## Primitives — 18 nodes

| Category | Primitives |
|---|---|
| Layout | `Document`, `Page`, `PageBreak`, `Section`, `Row`, `Column`, `Spacer`, `Divider` |
| Content | `Heading`, `Text`, `Image`, `Link`, `Button`, `Code`, `Quote` |
| Lists | `List`, `ListItem` |
| Tables | `Table` |

Every primitive is a pure factory returning a `DocNode` — no runtime, no JSX runtime needed if you build the tree imperatively. `isDocNode(value)` narrows at boundaries.

## Output formats (20)

`'html'` · `'pdf'` · `'docx'` · `'pptx'` · `'email'` · `'xlsx'` · `'md'` · `'text'` · `'csv'` · `'svg'` · `'slack'` · `'teams'` · `'discord'` · `'telegram'` · `'notion'` · `'confluence'` · `'whatsapp'` · `'google-chat'` · `'json'` · `'jsonl'`

Different formats return different result types — `string` for the textual ones (HTML, Markdown, text, CSV, JSON, the chat payloads), `Uint8Array` for binary ones (PDF, DOCX, XLSX, PPTX), and `string` for SVG.

## `render(doc, format, options?)`

```ts
import { render } from '@pyreon/document'

await render(doc, 'pdf', {
  baseUrl: 'https://example.com/', // resolve relative <Image> sources
  direction: 'ltr', // or 'rtl'
  fonts: { Inter: { normal: 'https://…/Inter.ttf' } },
  styles: { heading: { color: '#1F2937', fontSize: 24 } },
})
```

## Browser download

```ts
import { download } from '@pyreon/document'

await download(doc, 'pdf', 'report.pdf')
await download(doc, 'docx', 'report.docx')
await download(doc, 'xlsx', 'data.xlsx')
```

Renders + triggers a blob URL download. Browser-only.

## Custom renderers

```ts
import { registerRenderer, unregisterRenderer, type DocumentRenderer } from '@pyreon/document'

const sapRenderer: DocumentRenderer = {
  render(node, options) {
    return convertToSapIdoc(node)
  },
}

registerRenderer('sap-idoc', sapRenderer)

await render(doc, 'sap-idoc' as never) // user-extended format

unregisterRenderer('sap-idoc')
```

For tests: `_resetRenderers()` restores the built-in registry.

## Reactive metadata via `@pyreon/document-primitives`

If you need the document tree to also render in the browser (live preview + export from the same source), use `@pyreon/document-primitives` for rocketstyle-based components that render in the DOM AND export here via `@pyreon/connector-document`. `@pyreon/document` itself is purely a renderer — no DOM mounting.

## Lazy-loaded heavy renderers

Approximate chunk sizes (already vendored in `lib/`):

| Renderer | Approx chunk |
|---|---|
| PDF (pdfmake + fonts) | ~3 MB |
| DOCX | ~700 KB |
| XLSX | ~1.1 MB |
| PPTX | ~400 KB |

These load only when their format is invoked. The 14 MB published `lib/` is the trade-off for a single-install batteries-included experience; consumers tree-shake at their build step so unused renderers don't ship to end users.

## Gotchas

- **Result type varies by format** — `render(doc, 'pdf')` returns `Uint8Array`, `render(doc, 'md')` returns `string`. The TypeScript return type is the union; narrow with the format literal.
- **`download()` is browser-only** — calling it in Node throws.
- **Tables with mismatched column / row widths** silently truncate or pad — validate upstream.
- **Relative `<Image>` sources** need `options.baseUrl` to resolve under PDF / DOCX renderers (they fetch the image bytes server-side).
- **PDF requires external font URLs** for non-default typefaces — pass via `options.fonts`. The default font is Roboto, served by pdfmake's CDN at build time of the vendored chunk.
- **The chat-platform renderers** (`slack` / `teams` / `discord` / `telegram` / `notion` / `confluence` / `whatsapp` / `google-chat`) produce platform-specific payload strings — they are NOT generic markdown. Test against the real platform's preview before relying on a render.

## Documentation

Full docs: [docs.pyreon.dev/docs/document](https://docs.pyreon.dev/docs/document) (or `docs/src/content/docs/document.md` in this repo).

## License

MIT
