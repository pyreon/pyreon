---
title: Document Primitives
description: 18 rocketstyle document components that render in the browser AND export to 14+ formats from one tree.
---

`@pyreon/document-primitives` ships **18 rocketstyle-based document components** — `DocDocument`, `DocPage`, `DocSection`, `DocRow`, `DocColumn`, `DocHeading`, `DocText`, `DocLink`, `DocImage`, `DocTable`, `DocList`, `DocListItem`, `DocCode`, `DocDivider`, `DocSpacer`, `DocButton`, `DocQuote`, `DocPageBreak`. The **same JSX tree renders in the browser AND exports to 14+ formats** (PDF, DOCX, XLSX, PPTX, HTML, Markdown, email, Slack, Teams, and more) through the `@pyreon/document` pipeline.

<PackageBadge name="@pyreon/document-primitives" href="/docs/document-primitives" />

## Installation

:::code-group

```bash [npm]
npm install @pyreon/document-primitives
```

```bash [bun]
bun add @pyreon/document-primitives
```

```bash [pnpm]
pnpm add @pyreon/document-primitives
```

```bash [yarn]
yarn add @pyreon/document-primitives
```

:::

You also need the renderer to turn a tree into bytes:

```bash
bun add @pyreon/document
```

## Quick Start

```tsx
import { DocDocument, DocPage, DocHeading, DocText, extractDocNode } from '@pyreon/document-primitives'
import { download } from '@pyreon/document'

// 1. Build a document with primitives — this is a normal Pyreon component.
function Report() {
  return (
    <DocDocument title="Quarterly Report" author="Aisha">
      <DocPage>
        <DocHeading level="h1">Q4 Results</DocHeading>
        <DocText>Revenue grew 23% YoY.</DocText>
      </DocPage>
    </DocDocument>
  )
}

// 2. The SAME tree renders in the browser for a live preview…
function Preview() {
  return <Report />
}

// 3. …and extracts to a format-neutral DocNode for export.
const tree = extractDocNode(() => <Report />)
await download(tree, 'report.pdf')
await download(tree, 'report.docx')
await download(tree, 'report.html')
await download(tree, 'report.md')
```

## The Dual-Render Model

The defining idea of this package is that **one component tree powers both a live browser preview and a multi-format export** — what the user sees on screen is exactly what they download. There is no second "export template" to keep in sync.

This works because every primitive is a [`@pyreon/rocketstyle`](/docs/rocketstyle) component built on top of [`@pyreon/elements`](/docs/elements), so it renders to real DOM in the browser. At the same time, each primitive carries a static `_documentType` marker (`"document"`, `"page"`, `"heading"`, `"table"`, …) and stamps any export-relevant metadata onto a `_documentProps` field. A bridge then walks that tree to build a format-neutral `DocNode`, which the renderer turns into PDF/DOCX/HTML/etc.

```text
            ┌─────────────────────────────────────────────┐
            │  Your JSX tree (DocDocument > DocPage > …)    │
            │  rocketstyle components, _documentType marks  │
            └───────────────┬───────────────┬───────────────┘
                            │               │
              renders to    │               │   extractDocNode(fn)
              real DOM       │               │   walks the tree
              (live preview) ▼               ▼
            ┌───────────────────┐   ┌─────────────────────────────┐
            │  Browser preview   │   │  DocNode (format-neutral)    │
            │  (rocketstyle CSS) │   │  via @pyreon/connector-      │
            └───────────────────┘   │  document's extractDocumentTree
                                     └───────────────┬─────────────┘
                                                     │  render() / download()
                                                     ▼
                                     ┌─────────────────────────────┐
                                     │  @pyreon/document renderer    │
                                     │  PDF · DOCX · XLSX · PPTX ·   │
                                     │  HTML · Markdown · email ·    │
                                     │  Slack · Teams · …  (14+)     │
                                     └─────────────────────────────┘
```

Three packages collaborate:

| Package | Role |
| --- | --- |
| `@pyreon/document-primitives` | **This package.** The 18 styled building blocks you author with. |
| [`@pyreon/connector-document`](/docs/connector-document) | The **bridge** — `extractDocumentTree()` walks a primitive tree, resolves its rocketstyle styles, and produces a `DocNode`. |
| [`@pyreon/document`](/docs/document) | The **renderer** — takes a `DocNode` and emits any of the 14+ output formats via `render()` / `download()`. |

:::note
`extractDocumentTree` and `resolveStyles` are re-exported from `@pyreon/document-primitives` for convenience — you can import them from either package and they're the same functions.
:::

## Authoring a Document

Compose primitives the same way you'd write any JSX. The tree below renders to DOM in a browser and exports to any format:

```tsx
import {
  DocDocument, DocPage, DocSection, DocHeading, DocText,
  DocTable, DocDivider, DocList, DocListItem,
} from '@pyreon/document-primitives'

function Invoice(props: { id: string; date: string; items: Item[]; total: string }) {
  return (
    <DocDocument title={`Invoice #${props.id}`} author="Acme Inc.">
      <DocPage size="A4" orientation="portrait">
        <DocSection>
          <DocHeading level="h1">Invoice #{props.id}</DocHeading>
          <DocText>Issued {props.date}</DocText>
        </DocSection>

        <DocDivider color="#e5e7eb" thickness={1} />

        <DocTable
          caption="Line items"
          bordered
          striped
          columns={[
            { key: 'name', label: 'Item', align: 'left' },
            { key: 'qty', label: 'Qty', align: 'center' },
            { key: 'price', label: 'Price', align: 'right' },
          ]}
          rows={props.items.map((i) => ({ name: i.name, qty: i.qty, price: `$${i.price}` }))}
        />

        <DocText variant="label">Total: {props.total}</DocText>
      </DocPage>
    </DocDocument>
  )
}
```

## Reactive Metadata

Components in Pyreon run **once** at mount. `DocDocument`'s `title`, `author`, and `subject` props each accept either a plain `string` **or** a `() => string` accessor. Function values are stored in `_documentProps` and resolved by the bridge **at extraction time** — so every export click reads the **live** value from the underlying signal, without a `const initial = get()` workaround.

```tsx
function ResumeTemplate(props: { resume: () => Resume }) {
  return (
    // title/author resolve at export time — each download reads the LIVE name
    <DocDocument
      title={() => `${props.resume().name} — Resume`}
      author={() => props.resume().name}
    >
      <DocPage>
        <DocSection>
          <DocHeading level="h1">{props.resume().name}</DocHeading>
          <DocText>{props.resume().headline}</DocText>
        </DocSection>
      </DocPage>
    </DocDocument>
  )
}

// Each export reads the live signal value:
const tree = extractDocNode(() => <ResumeTemplate resume={store.resume} />)
await download(tree, 'resume.pdf')
```

:::warning{title="Don't call the accessor at the top of the body"}
Calling `props.title()` at the top of a template body to "fix" reactivity captures the **initial value forever** — components run once at mount. Pass the accessor straight through to `DocDocument`: `<DocDocument title={() => get().name}>`.
:::

For reactive **text** content (not metadata), pass a signal accessor and read it inside the body via a per-text-node thunk, so only that node patches when the signal changes:

```tsx
<DocText>{() => store.field()}</DocText>
```

## Layout: `direction`, `gap`, `alignX`, `alignY`

These primitives are built on `@pyreon/elements`, so **layout props live in `.attrs()`** (the component definition), not in `.theme()`. The most important consequence for authors: the `Element` base accepts `direction: 'inline' | 'rows' | 'reverseInline' | 'reverseRows'`.

`DocRow` already configures `direction: 'inline'` with an 8px `gap`, and `DocSection` exposes `direction` as a dimension (`'column'` default, `'row'`). You rarely set these by hand — the primitive picks the right value.

:::warning{title="`'row'` is not a valid Element direction"}
The `@pyreon/elements` `Element` base uses `'inline'` for horizontal layout, **not** `'row'`. If you build your own derived primitives, use `direction: 'inline'` / `'reverseInline'` / `'rows'` / `'reverseRows'`. `DocSection` accepts a friendlier `direction="row"` and maps it internally; the raw Element value is `'inline'`.
:::

:::warning{title="Don't put runtime-filled fields in the rocketstyle generic"}
Fields the `.attrs()` callback fills at runtime — `tag`, `_documentProps` — must NOT appear in the rocketstyle `.attrs<P>()` public-prop generic, or they leak as required JSX props on every call site. Keep the generic to the props a consumer actually passes (`title`, `href`, `columns`, …).
:::

## Rocketstyle Dimensions

Several primitives expose rocketstyle dimensions for visual variation. These are confirmed in the source:

| Primitive | Dimension | Values |
| --- | --- | --- |
| `DocHeading` | `level` | `h1` `h2` `h3` `h4` `h5` `h6` (controls font size + semantic level) |
| `DocText` | `variant` | `body` `caption` `label` |
| `DocText` | `weight` | `normal` `bold` |
| `DocButton` | `variant` | `primary` `secondary` |
| `DocTable` | `variant` | (custom variants via the definition) |

```tsx
<DocHeading level="h2">Section heading</DocHeading>
<DocText variant="caption">Supporting caption text.</DocText>
<DocButton variant="primary" href="/signup">Get started</DocButton>
```

## Exporting to a Format

### `extractDocNode` (recommended)

The one-step helper. Pass a template function that returns a primitive tree; get a `DocNode` you can hand to `@pyreon/document`'s `render()` or `download()`:

```tsx
import { extractDocNode } from '@pyreon/document-primitives'
import { download, render } from '@pyreon/document'

const tree = extractDocNode(() => (
  <DocDocument title="Quarterly Report" author="Aisha">
    <DocPage>
      <DocHeading level="h1">Q4 Results</DocHeading>
      <DocText>Revenue grew 23% YoY.</DocText>
    </DocPage>
  </DocDocument>
))

// download triggers a browser download; render returns the bytes/string
await download(tree, 'report.pdf')
await download(tree, 'report.docx')
const html = await render(tree, 'html')
```

### `createDocumentExport` (two-step, backward compat)

`createDocumentExport(fn)` returns a `{ getDocNode() }` helper object — the wrapper-object form, kept for callers that want to pass a `DocumentExport` instance around. New code should prefer `extractDocNode`, which is the same operation in one call:

```tsx
import { createDocumentExport } from '@pyreon/document-primitives'

const helper = createDocumentExport(() => <Resume name="Aisha" />)
const tree = helper.getDocNode()
```

:::tip
`extractDocNode(fn)` is exactly `createDocumentExport(fn).getDocNode()` without the indirection. Reach for `createDocumentExport` only when something downstream actually consumes the `DocumentExport` object itself.
:::

### Resolving CSS-variable themes at export time

Both helpers accept an optional second argument. Under an app running `init({ cssVariables: true })`, theme values become `var(--px-…)` references and `mode(a, b)` pairs that a PDF/DOCX renderer can't evaluate. Pass `theme` and `mode` so the bridge inlines them to raw values during extraction:

```tsx
const tree = extractDocNode(() => <Report />, {
  theme: myThemeObject, // inlines theme-leaf var(--px-…) refs
  mode: 'dark',         // resolves mode(a, b) pairs (default 'light')
})
```

When the app is on the classic (non-CSS-variable) path, most primitives emit raw literals already, so the resolver is just a cheap safety net — it only rewrites strings that contain `var(`.

## Live Preview

Because every primitive renders to real DOM, the export tree can also drive an interactive preview. The package ships a `DocumentPreview` wrapper for this — a paginated "page on a canvas" frame (A4/A3/A5/letter/legal) you can mount around your document in the browser:

```tsx
import DocumentPreview from '@pyreon/document-primitives/dist/DocumentPreview'
// (or: import { DocumentPreview } from '@pyreon/document-primitives')

function Editor(props: { resume: () => Resume }) {
  return (
    <DocumentPreview size="A4">
      <ResumeTemplate resume={props.resume} />
    </DocumentPreview>
  )
}
```

`DocumentPreview` is a presentation wrapper for the browser only — it is **not** one of the 18 export primitives, and it isn't required to export. To get fine-grained per-text-node preview updates (instead of re-mounting the whole tree on every keystroke), pass signal **accessors** into your template and read them lazily in the body, as shown in [Reactive Metadata](#reactive-metadata).

## Primitive Reference

All 18 export primitives, the components they map to, and the underlying HTML tag they render in the browser:

| Primitive | `_documentType` | Tag | Key props | Description |
| --- | --- | --- | --- | --- |
| `DocDocument` | `document` | `div` | `title?`, `author?`, `subject?` | Root container + metadata. Each prop is `string \| (() => string)`. |
| `DocPage` | `page` | `div` | `size?`, `orientation?` | Page boundary. `size` (`"A4"`, `"Letter"`, …) + `orientation` configure paginated outputs. |
| `DocSection` | `section` | `div` | `direction?` (`'column'` \| `'row'`) | Semantic grouping; default `column`. |
| `DocRow` | `row` | `div` | — | Horizontal inline layout, fixed 8px gap. |
| `DocColumn` | `column` | `div` | `width?` (`number \| string`) | Column inside a row; `width` like `"30%"` / `"1fr"`. |
| `DocHeading` | `heading` | `h1`–`h6` | `level?` (`'h1'`–`'h6'`) | Heading; `level` sets size **and** semantic level. Default `h1`. |
| `DocText` | `text` | `p` | `variant?`, `weight?` | Paragraph/inline text. `variant`: body/caption/label. |
| `DocLink` | `link` | `a` | `href?` | Hyperlink. `href` defaults to `"#"`. |
| `DocImage` | `image` | `img` | `src`, `alt?`, `width?`, `height?`, `caption?` | Embedded image; optional caption beneath. |
| `DocTable` | `table` | `table` | `columns`, `rows`, `headerStyle?`, `striped?`, `bordered?`, `caption?` | Tabular data; `columns`/`rows` are export-only (filtered from the DOM). |
| `DocList` | `list` | `ul`/`ol` | `ordered?` | Bulleted (default) or numbered list. |
| `DocListItem` | `list-item` | `li` | — | A single list item; can nest a `DocList`. |
| `DocCode` | `code` | `pre` | `language?` | Monospace code block; `language` enables highlighting. |
| `DocDivider` | `divider` | `hr` | `color?`, `thickness?` | Horizontal rule. |
| `DocSpacer` | `spacer` | `div` | `height?` (default 16) | Vertical whitespace, in pixels. |
| `DocButton` | `button` | `a` | `href?`, `variant?` | CTA button (mail-safe table in email, styled link in PDF/DOCX). |
| `DocQuote` | `quote` | `blockquote` | `borderColor?` | Block quote with an indented left border. |
| `DocPageBreak` | `page-break` | `div` | — | Forces a new page in paginated outputs. |

## Working with Primitives

### Headings & text

```tsx
<DocHeading level="h1">Quarterly Report</DocHeading>
<DocHeading level="h2">Q4 Results</DocHeading>

<DocText>Plain paragraph content.</DocText>
<DocText variant="caption">Smaller, muted caption.</DocText>
<DocText variant="label" weight="bold">EMPHASIZED LABEL</DocText>

<DocText>
  Read more on
  <DocLink href="https://pyreon.dev">our blog</DocLink>.
</DocText>
```

### Layout: rows, columns, sections

```tsx
<DocSection direction="column">
  <DocHeading level="h2">Contact</DocHeading>
  <DocRow>
    <DocColumn width="30%">
      <DocText variant="label">Email</DocText>
    </DocColumn>
    <DocColumn width="70%">
      <DocText>aisha@example.com</DocText>
    </DocColumn>
  </DocRow>
</DocSection>
```

### Lists (including nested)

```tsx
<DocList>
  <DocListItem>Top-level item</DocListItem>
  <DocListItem>
    Item with a sublist
    <DocList ordered>
      <DocListItem>First step</DocListItem>
      <DocListItem>Second step</DocListItem>
    </DocList>
  </DocListItem>
</DocList>
```

### Tables

```tsx
<DocTable
  caption="Q4 results by region"
  bordered
  striped
  columns={[
    { key: 'region', label: 'Region', align: 'left' },
    { key: 'revenue', label: 'Revenue', align: 'right' },
    { key: 'growth', label: 'YoY Growth', align: 'right' },
  ]}
  rows={[
    { region: 'NA', revenue: '$12.4M', growth: '+23%' },
    { region: 'EU', revenue: '$8.7M', growth: '+18%' },
    { region: 'APAC', revenue: '$5.1M', growth: '+41%' },
  ]}
/>
```

:::warning{title="`DocTable` props collide with read-only DOM properties"}
`HTMLTableElement.rows` (and `.cells`) are read-only DOM getters — assigning to them throws `Cannot set property rows of [object Object] which has only a getter`. `DocTable` strips `columns`, `rows`, `headerStyle`, `striped`, `bordered`, and `caption` before they reach the `<table>` via `.attrs(callback, { filter: [...] })`. If you build a new primitive whose prop names match a native HTML element property, do the same.
:::

### Images, code, dividers, spacers

```tsx
<DocImage
  src="/charts/q4-revenue.png"
  alt="Revenue grew 23% in Q4"
  width={600}
  height={400}
  caption="Figure 1: Quarterly revenue, 2024–2025"
/>

<DocCode language="typescript">{
`const flow = createFlow({
  nodes: [{ id: '1', position: { x: 0, y: 0 } }],
  edges: [],
})`
}</DocCode>

<DocText>Above the divider.</DocText>
<DocDivider color="#e5e7eb" thickness={1} />
<DocSpacer height={32} />
<DocText>Below, after extra space.</DocText>
```

:::note
Pass code to `DocCode` as a single string child so newlines and indentation are preserved verbatim.
:::

### Quotes & buttons

```tsx
<DocQuote borderColor="#3b82f6">
  <DocText>"The best way to predict the future is to build it."</DocText>
  <DocText variant="caption">— Aisha Patel, Q4 keynote</DocText>
</DocQuote>

<DocButton variant="primary" href="https://pyreon.dev/signup">
  Get started
</DocButton>
```

### Pages & explicit breaks

A `DocPage` is a page boundary in paginated outputs (PDF, DOCX); flow outputs (HTML, Markdown) render its contents inline. `DocPageBreak` forces a new page mid-content:

```tsx
<DocDocument>
  <DocPage size="A4" orientation="portrait">
    <DocHeading level="h1">Section 1</DocHeading>
    <DocText>…long content…</DocText>
    <DocPageBreak />
    <DocHeading level="h1">Section 2 — new page</DocHeading>
  </DocPage>
  <DocPage size="A4" orientation="landscape">
    <DocHeading level="h1">Appendix (landscape)</DocHeading>
  </DocPage>
</DocDocument>
```

## How Outputs Differ

The same tree maps to whatever a target format supports — paginated formats honor page boundaries; flow formats inline them:

| Primitive | Paginated (PDF / DOCX) | Flow (HTML / Markdown) | Plain text / chat |
| --- | --- | --- | --- |
| `DocPage` / `DocPageBreak` | Real page boundary / page break | Inline, no boundary | Omitted or whitespace |
| `DocHeading` | Heading style / `<h1>`–`<h6>` | `<h1>`–`<h6>` / `#`…`######` | Uppercased / prefixed line |
| `DocLink` | Clickable link | `<a href>` / `[text](href)` | `text (href)` |
| `DocButton` | Labeled link | Styled link / mail-safe button | Plain label + URL |
| `DocTable` | Native table | `<table>` / pipe table | Best-effort columns |
| `DocDivider` | Horizontal rule | `<hr>` / `---` | A line of dashes |

The renderer (`@pyreon/document`) owns these mappings — see its [reference](/docs/document) for the full per-format behavior and the complete list of supported output formats.

## A Latent Framework Bug, Fixed (PR #197)

Before PR #197, the bridge (`extractDocumentTree`) only read `_documentProps` off the JSX vnode's **direct** props. But rocketstyle's `.attrs()` HOC stamps `_documentProps` **after** the component function runs — so every real primitive's metadata was silently dropped on export. The extractor now **calls** the component function to capture the post-`.attrs()` vnode and reads `_documentProps` from there.

This is purely background context for how the bridge resolves metadata — there's nothing to do in your code. It explains why primitives must be invoked (not merely inspected) during extraction.

## API Reference

### Helper functions

| Function | Signature | Description |
| --- | --- | --- |
| `extractDocNode` | `extractDocNode(templateFn: () => VNode, options?: DocumentExportOptions): DocNode` | **One-step** extraction (recommended). Walks the template's tree into a format-neutral `DocNode`. |
| `createDocumentExport` | `createDocumentExport(templateFn: () => VNode, options?): { getDocNode(): DocNode }` | **Two-step** wrapper kept for backward compat; delegates to `extractDocNode`. |
| `extractDocumentTree` | `extractDocumentTree(vnode, options?): DocNode` | Re-exported from `@pyreon/connector-document` — the bridge that walks a primitive tree. |
| `resolveStyles` | `resolveStyles(...)` | Re-exported from `@pyreon/connector-document` — resolves a primitive's rocketstyle styles. |

### `DocumentExportOptions`

Passed as the optional 2nd argument to `extractDocNode` / `createDocumentExport`:

| Field | Type | Description |
| --- | --- | --- |
| `theme?` | `Record<string, unknown>` | Theme to resolve CSS-variable (`var(--px-…)`) style values against. Needed for export under `init({ cssVariables: true })`. |
| `mode?` | `'light' \| 'dark'` | Active mode for resolving `mode(a, b)` var pairs. Default `'light'`. |
| `resolveVar?` | `VarResolver` | (from `ExtractOptions`) An explicit var resolver; takes precedence over `theme` / `mode`. |

### Components

The 18 export primitives are listed in the [Primitive Reference](#primitive-reference) table above. One extra component ships for browser preview only:

| Component | Description |
| --- | --- |
| `DocumentPreview` | Browser-only paginated preview frame (`size`: A4/A3/A5/letter/legal). Not part of the export pipeline. |

### Re-exported types

From `@pyreon/connector-document`: `DocNode`, `DocChild`, `ExtractOptions`, `NodeType`, `ResolvedStyles`. From this package: `DocumentExport`, `DocumentExportOptions`, `DocumentTheme` (+ the `documentTheme` token object).

## Related

- [`@pyreon/connector-document`](/docs/connector-document) — the bridge (`extractDocumentTree`) that turns a primitive tree into a `DocNode`.
- [`@pyreon/document`](/docs/document) — the renderer that emits PDF / DOCX / HTML / Markdown / email / Slack / Teams / … from a `DocNode`.
- [`@pyreon/rocketstyle`](/docs/rocketstyle) — the multi-dimensional styling engine every primitive is built on.
- [`@pyreon/elements`](/docs/elements) — the layout base (`Element`, `Text`) the primitives wrap.
