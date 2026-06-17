# @pyreon/document-primitives

18 rocketstyle document components that render in the browser AND export to 14+ formats.

`@pyreon/document-primitives` ships a complete set of styled, themeable document primitives — `DocDocument`, `DocPage`, `DocSection`, `DocRow`, `DocColumn`, `DocHeading`, `DocText`, `DocLink`, `DocImage`, `DocTable`, `DocList`, `DocListItem`, `DocCode`, `DocDivider`, `DocSpacer`, `DocButton`, `DocQuote`, `DocPageBreak` — built on `@pyreon/rocketstyle` + `@pyreon/elements`. Each primitive carries a `_documentType` marker via `.statics()` so `@pyreon/connector-document` can walk the same JSX tree and produce a serializable `DocNode` for `@pyreon/document`'s renderers (PDF, DOCX, XLSX, PPTX, HTML email, Markdown, plain text, …). **Write one template, render it in the browser AS PREVIEW, then export the same tree to any format.**

## Install

```bash
bun add @pyreon/document-primitives @pyreon/document @pyreon/connector-document
```

## Quick start

```tsx
import {
  DocDocument, DocPage, DocHeading, DocText, DocList, DocListItem,
  extractDocNode,
} from '@pyreon/document-primitives'
import { render, download } from '@pyreon/document'

function ReportTemplate({ data }: { data: () => Report }) {
  return (
    <DocDocument
      title={() => `${data().org} — Q4 report`}
      author={() => data().author}
    >
      <DocPage>
        <DocHeading level={1}>Q4 Highlights</DocHeading>
        <DocText>Revenue grew {() => data().revenueDelta}% year-over-year.</DocText>
        <DocList>
          {() => data().bullets.map((b) => <DocListItem>{b}</DocListItem>)}
        </DocList>
      </DocPage>
    </DocDocument>
  )
}

// Live preview — render the same tree into the DOM
<ReportTemplate data={() => store.report} />

// Export — extract + render to a format
const tree = extractDocNode(() => <ReportTemplate data={() => store.report} />)
const pdfBuffer = await render(tree, 'pdf')
await download(tree, 'q4-report.pdf')   // browser shortcut
const markdown = await render(tree, 'markdown')
const docxBuffer = await render(tree, 'docx')
```

## The 18 primitives

| Component | `_documentType` | Base | Notes |
|---|---|---|---|
| `DocDocument` | `'document'` | `Element` | Root container; accepts `title` / `author` / `subject` (string or `() => string` accessor) |
| `DocPage` | `'page'` | `Element` | Logical page; carries page-level metadata for paginated formats |
| `DocSection` | `'section'` | `Element` | Semantic section grouping |
| `DocRow` | `'row'` | `Element` | Horizontal layout row |
| `DocColumn` | `'column'` | `Element` | Vertical layout column with optional `width` |
| `DocHeading` | `'heading'` | `Text` | `level` 1-6 (or `h1`-`h6` flags) |
| `DocText` | `'text'` | `Text` | Paragraph text |
| `DocLink` | `'link'` | `Text` | `href` |
| `DocImage` | `'image'` | `Element` | `src` / `alt` / `width` / `height` |
| `DocTable` | `'table'` | `Element` | Tabular data with column definitions |
| `DocList` | `'list'` | `Element` | `ordered: boolean` |
| `DocListItem` | `'list-item'` | `Element` | List item |
| `DocCode` | `'code'` | `Text` | Optional `language` for syntax-highlighted exports |
| `DocDivider` | `'divider'` | `Element` | Horizontal rule |
| `DocSpacer` | `'spacer'` | `Element` | Vertical spacing; `height` (default 16) |
| `DocButton` | `'button'` | `Text` | CTA with `href` |
| `DocQuote` | `'quote'` | `Element` | Blockquote with optional `borderColor` |
| `DocPageBreak` | `'page-break'` | `Element` | Forces a page break in paginated formats |

Every primitive is themeable via rocketstyle's `.theme()` and `.attrs()` chain — wrap, restyle, restyle again, all while preserving the `_documentType` marker.

## Reactive metadata via accessor props

`DocDocument`'s `title` / `author` / `subject` accept either a plain `string` or `() => string`. Function values are stored in `_documentProps` and **resolved by the extractor at extraction time** — so every export click reads the LIVE value from any underlying signal. You don't need a `const initial = signal()` workaround.

```tsx
// Both work; the accessor form is what you want for templates that drive
// a live preview AND export the same tree.
<DocDocument title="Static" />
<DocDocument title={() => `${name()} — ${date()}`} />
```

The same accessor pattern works for reactive children — pass a thunk inside the JSX slot and the extractor resolves it on each extraction:

```tsx
<DocText>{store.summary()}</DocText>
```

## Export helpers

### `extractDocNode(templateFn, options?)`

One-step helper — wrap your template render in a thunk and get a serializable `DocNode`.

```ts
const tree = extractDocNode(() => <ReportTemplate data={store.report} />)
await render(tree, 'pdf')
```

### `createDocumentExport(templateFn, options?)`

Two-step form — returns `{ getDocNode(): DocNode }`. Kept for callers that need to pass the helper object around (e.g. an "Export" component that takes a `DocumentExport` prop). New code should prefer `extractDocNode`.

```ts
const doc = createDocumentExport(() => <ReportTemplate data={store.report} />)
const tree = doc.getDocNode()
```

`DocumentExportOptions` extends `ExtractOptions` from `@pyreon/connector-document` (`rootSize`, `includeStyles`) plus `theme` and `mode: 'light' | 'dark'` for export-time theming.

## Theme

`documentTheme` ships sensible defaults (font sizes, spacing, colors) that match the on-screen render. Compose with your own theme via `PyreonUI` or pass per-primitive via the rocketstyle `.theme()` chain.

```ts
import { documentTheme, DocumentTheme } from '@pyreon/document-primitives'
```

## `<DocumentPreview>`

Convenience component that renders a tree-shaped template into a styled preview frame. Use it when you want a quick "what will this look like when exported?" pane without building your own preview layout.

```tsx
import { DocumentPreview } from '@pyreon/document-primitives'

<DocumentPreview>
  <ReportTemplate data={store.report} />
</DocumentPreview>
```

## Connector re-exports

`extractDocumentTree`, `resolveStyles`, and the related types from `@pyreon/connector-document` are re-exported so `@pyreon/document-primitives` can be your single import.

```ts
import {
  extractDocumentTree,    // walk a vnode → DocNode
  resolveStyles,          // $rocketstyle → ResolvedStyles
  type DocNode, type DocChild, type NodeType, type ResolvedStyles,
  type ExtractOptions,
} from '@pyreon/document-primitives'
```

## Gotchas

- **JSX slot expressions are resolved at extraction time, not subscribed.** Calling `extractDocNode` again is what produces a fresh tree after signal changes.
- **Rocketstyle `.attrs<P>()` is your PUBLIC prop type** — never include runtime-filled fields like `_documentProps` in the generic, or they'll leak as required props. They live inside the callback body, not in the type parameter.
- **Watch for prop names that collide with read-only DOM properties.** `HTMLTableElement.rows` / `.columns` are read-only `HTMLCollection` getters; if those names reach the rendered DOM, the runtime throws `Cannot set property rows of [object Object] which has only a getter`. `DocTable` strips them via rocketstyle's `.attrs(callback, { filter: ['rows', 'columns', ...] })` — apply the same pattern if you author new primitives.
- **The browser and export trees are the SAME tree.** A debug session that breaks the preview will also break the export. Test both paths.
- **`DocDocument.title` accessor stores a function in `_documentProps`** — `extractDocumentTree` calls it once per extraction. Plain strings pass through unchanged.

## Documentation

Full docs: [pyreon.dev/docs/document-primitives](https://pyreon.dev/docs/document-primitives) (or `docs/src/content/docs/document-primitives.md` in this repo).

## License

MIT
