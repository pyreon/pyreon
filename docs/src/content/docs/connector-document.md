---
title: Connector Document
description: The bridge between Pyreon UI-system / document-primitive components and @pyreon/document — walks a component tree into a format-agnostic DocNode for multi-format rendering.
---

`@pyreon/connector-document` is the **bridge** between Pyreon's component layer and the `@pyreon/document` rendering pipeline. It walks a Pyreon VNode tree, finds components carrying a `_documentType` marker, resolves their CSS-in-JS styles into a flat style object, and produces a format-agnostic `DocNode` tree that `@pyreon/document`'s `render()` can turn into PDF, DOCX, email, Slack, and 16 other formats.

<PackageBadge name="@pyreon/connector-document" href="/docs/connector-document" />

## Installation

:::code-group

```bash [npm]
npm install @pyreon/connector-document
```

```bash [bun]
bun add @pyreon/connector-document
```

```bash [pnpm]
pnpm add @pyreon/connector-document
```

```bash [yarn]
yarn add @pyreon/connector-document
```

:::

## The Bridge: One Tree, Two Destinations

Pyreon's headline document feature is that **the same JSX tree renders in the browser AND exports to 20 output formats**. That works because of a three-package split:

| Package | Role |
| --- | --- |
| [`@pyreon/document-primitives`](/docs/document-primitives) | The 18 rocketstyle components you author (`DocDocument`, `DocHeading`, `DocText`, …). Each carries a `_documentType` static marker. |
| `@pyreon/connector-document` | **This package.** Walks the primitive tree and extracts a `DocNode`. |
| [`@pyreon/document`](/docs/document) | The renderer. Takes a `DocNode` and produces PDF / DOCX / email / Markdown / etc. |

The connector is the seam between the **browser-rendered** view and the **exported** view. Document primitives are real components — they mount and render styled DOM in the browser like any other Pyreon component. When you want to export the same tree to a non-browser format, the connector traverses that exact VNode tree and lowers it to a `DocNode` the renderers understand.

```text
┌──────────────────────────────┐
│  DocDocument / DocHeading /…  │   @pyreon/document-primitives
│  (rocketstyle components,     │   — carry _documentType markers
│   _documentType markers)      │
└───────────────┬──────────────┘
                │ extractDocumentTree(vnode)
                ▼
┌──────────────────────────────┐
│        DocNode tree           │   @pyreon/connector-document
│  { type, props, children,     │   — format-agnostic
│    styles }                   │
└───────────────┬──────────────┘
                │ render(node, format)
                ▼
   PDF · DOCX · XLSX · email · Markdown · Slack · …   @pyreon/document
```

:::tip
You rarely call `@pyreon/connector-document` directly. `@pyreon/document-primitives` re-exports `extractDocumentTree` / `resolveStyles` and adds the higher-level `extractDocNode(templateFn)` helper that most apps use. Reach for this package directly when you build a custom document-primitive or need the low-level CSS parsers.
:::

## How Extraction Works

`extractDocumentTree(vnode)` walks the tree node by node:

1. **Component with a `_documentType` marker** → emit a `DocNode`:
   - `_documentType` → `DocNode.type` (e.g. `'document'`, `'heading'`, `'text'`)
   - `_documentProps` → `DocNode.props` (function values are resolved to their live value at this point)
   - `$rocketstyle` → `resolveStyles()` → `DocNode.styles`
   - Recurse into children.
2. **Component without a marker** → call it to get its VNode output, then recurse (transparent).
3. **DOM element** (`'div'`, `'span'`, …) → transparent: its children are flattened into the parent's children. Text content is collected.
4. **Strings / numbers** → collected as text children. `null` / `false` / `true` are skipped.

Reactive children (function getters) and nested arrays are flattened and resolved during the walk, so a tree built with signals exports its live state.

```tsx
import { extractDocumentTree } from '@pyreon/connector-document'
import { render } from '@pyreon/document'
import { DocDocument, DocPage, DocHeading, DocText } from '@pyreon/document-primitives'

// 1. Build a tree with document primitives (this same tree can render in the browser)
const tree = (
  <DocDocument title="Q4 Report" author="Alice">
    <DocPage>
      <DocHeading h1>Sales Report</DocHeading>
      <DocText>Revenue grew 24% quarter over quarter.</DocText>
    </DocPage>
  </DocDocument>
)

// 2. Extract a format-agnostic DocNode
const node = extractDocumentTree(tree)

// 3. Render to any format
const pdf = await render(node, 'pdf') // Uint8Array
const email = await render(node, 'email') // email-safe HTML string
const md = await render(node, 'md') // Markdown string
```

`extractDocumentTree` also accepts a component **function** directly (it will call it to obtain the tree):

```tsx
const node = extractDocumentTree(() => <ResumeTemplate resume={store.resume} />)
```

## `extractDocumentTree(vnode, options?)`

Walks a Pyreon VNode tree (or a component function) and returns a single `DocNode`. If the root produces loose children rather than a single document node, they are wrapped in a synthetic `{ type: 'document', props: {}, children }` node, so the return type is always a `DocNode`.

```ts
function extractDocumentTree(vnode: unknown, options?: ExtractOptions): DocNode
```

### `ExtractOptions`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `rootSize` | `number` | `16` | Root font size in px used for `rem` / `em` → px conversion when resolving styles. |
| `includeStyles` | `boolean` | `true` | Whether to resolve `$rocketstyle` into `DocNode.styles`. Set `false` to emit a structure-only tree. |
| `resolveVar` | `VarResolver` | — | Inline `var(--…)` style values to raw values during extraction. Needed under `init({ cssVariables: true })` because PDF/DOCX/email targets can't evaluate CSS custom properties. |

### Resolving CSS variables (cssVariables mode)

When your app runs under `init({ cssVariables: true })`, `$rocketstyle` style values can be `var(--px-…)` reference strings. PDF/DOCX/email render targets can't evaluate CSS custom properties, so they have to be inlined to raw values at extraction time. Supply a `resolveVar` that composes `resolveModeVar` (from [`@pyreon/rocketstyle`](/docs/rocketstyle), resolves `mode(a, b)` pairs) with `resolveCssVarReferences` (from [`@pyreon/unistyle`](/docs/unistyle), resolves theme-leaf vars via a `themeToCssVars(theme).registry`):

```ts
import { extractDocumentTree } from '@pyreon/connector-document'
import { resolveModeVar } from '@pyreon/rocketstyle'
import { resolveCssVarReferences, themeToCssVars } from '@pyreon/unistyle'

const { registry } = themeToCssVars(theme)

const node = extractDocumentTree(tree, {
  resolveVar: (v) => resolveCssVarReferences(resolveModeVar(v, mode), registry),
})
```

:::tip
`@pyreon/document-primitives`' `extractDocNode({ theme, mode })` builds this `resolveVar` for you automatically — pass `theme` and `mode` instead of hand-composing the resolver. Omit `resolveVar` entirely for the classic (non-cssVariables) path; style values are already raw there, and the resolver only ever rewrites strings that contain `var(`.
:::

## `resolveStyles(source, rootSize?, resolveVar?)`

Converts a rocketstyle `$rocketstyle` theme object into a `ResolvedStyles` object compatible with `@pyreon/document`. `extractDocumentTree` calls this internally for every marked node, but it is exported so custom primitives and tooling can resolve styles directly.

```ts
function resolveStyles(
  source: Record<string, unknown>,
  rootSize?: number,
  resolveVar?: VarResolver,
): ResolvedStyles
```

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `source` | `Record<string, unknown>` | — | The `$rocketstyle` theme object to convert. |
| `rootSize` | `number` | `16` | Root font size for `rem` / `em` → px conversion. |
| `resolveVar` | `VarResolver` | — | Optional `var(--…)` inliner (see cssVariables mode above). |

**Only properties that `ResolvedStyles` supports are extracted** — everything else (transitions, cursor, display, etc.) is silently ignored. The recognized properties are typography (`fontSize`, `fontFamily`, `fontWeight`, `fontStyle`, `textDecoration`, `color`, `backgroundColor`, `textAlign`, `lineHeight`, `letterSpacing`), box model (`padding`, `margin`), border (`borderRadius`, `borderWidth`, `borderColor`, `borderStyle`), sizing (`width`, `height`, `maxWidth`), and `opacity`. Enum-typed properties are validated against an allowlist — an unrecognized value (e.g. `textAlign: 'start'`) is dropped rather than passed through.

```ts
import { resolveStyles } from '@pyreon/connector-document'

resolveStyles({
  fontSize: '1.5rem',
  fontWeight: 'bold',
  color: '#222',
  padding: '8px 16px',
  textAlign: 'center',
})
// → {
//     fontSize: 24,        // 1.5rem × rootSize(16)
//     fontWeight: 'bold',
//     color: '#222',
//     padding: [8, 16],
//     textAlign: 'center',
//   }
```

## CSS Value Parsers

The package ships four pure parsers that normalize CSS values into the numeric units document renderers expect. They underpin `resolveStyles` but are exported for direct use in custom primitives or renderers.

### `parseCssDimension(value, rootSize?)`

Parses a CSS dimension into a px-equivalent number. Returns `undefined` for values it can't normalize (e.g. `'auto'`, `'100%'`).

```ts
function parseCssDimension(
  value: string | number | null | undefined,
  rootSize?: number,
): number | undefined
```

| Input | Output (rootSize = 16) | Notes |
| --- | --- | --- |
| `14` | `14` | Numbers pass through unchanged. |
| `'14px'` | `14` | |
| `'1.5rem'` | `24` | `value × rootSize`. |
| `'2em'` | `32` | `em` is treated like `rem` (× `rootSize`). |
| `'12pt'` | `16` | `pt × 4/3`. |
| `'1.5'` | `1.5` | Unitless numeric strings parse. |
| `'auto'` | `undefined` | Unrecognized → `undefined`. |

### `parseBoxModel(value, rootSize?)`

Parses a CSS `padding` / `margin` shorthand into the document tuple format. Returns `undefined` if any segment fails to parse.

```ts
function parseBoxModel(
  value: string | number | undefined,
  rootSize?: number,
): number | [number, number] | [number, number, number, number] | undefined
```

| Input | Output |
| --- | --- |
| `8` | `8` |
| `'8px'` | `8` |
| `'8px 16px'` | `[8, 16]` |
| `'8px 16px 12px'` | `[8, 16, 12, 16]` (CSS 3-value shorthand → top/right/bottom/left) |
| `'8px 16px 8px 16px'` | `[8, 16, 8, 16]` |

### `parseFontWeight(value)`

Normalizes a CSS `font-weight` keyword or number.

```ts
function parseFontWeight(
  value: string | number | undefined,
): 'normal' | 'bold' | number | undefined
```

| Input | Output |
| --- | --- |
| `700` | `700` |
| `'700'` | `700` |
| `'bold'` | `'bold'` |
| `'normal'` | `'normal'` |
| `'oblique'` | `undefined` |

### `parseLineHeight(value, rootSize?)`

Parses a CSS `line-height`. Unitless numbers pass through; dimensions are normalized via `parseCssDimension`; `'normal'` returns `undefined` (let the renderer apply its default).

```ts
function parseLineHeight(
  value: string | number | undefined,
  rootSize?: number,
): number | undefined
```

| Input | Output |
| --- | --- |
| `1.5` | `1.5` |
| `'1.5'` | `1.5` |
| `'24px'` | `24` |
| `'normal'` | `undefined` |

## Authoring a Custom Document Primitive

A document primitive is just a component that carries a `_documentType` marker the connector recognizes. The two requirements:

- A `_documentType` static set to one of the recognized [`NodeType`](#nodetype) values.
- A `_documentProps` object the connector reads as `DocNode.props`.

The connector finds these through three resolution paths, in order:

1. **`_documentProps` already on the JSX vnode props** — used by hand-constructed test fixtures.
2. **The `__rs_attrs` hoisted-attrs fast path** — when the component is a real rocketstyle primitive, it exposes its accumulated `.attrs()` callback chain as `__rs_attrs`. The connector runs that chain directly against the JSX props (`chain.reduce(Object.assign, {})`) to read `_documentProps` — no styled-wrapper invocation, no styling work, no dimension resolution. **This is the production path for every shipped primitive.**
3. **Full component invocation (legacy fallback)** — only when neither of the above applies (a non-rocketstyle component marked with `_documentType` directly).

The idiomatic rocketstyle authoring shape — taken from the real `DocDocument` source:

```tsx
import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const DocDocument = rocketstyle()({ name: 'DocDocument', component: Element })
  .statics({ _documentType: 'document' as const })
  .attrs<{
    title?: string | (() => string)
    author?: string | (() => string)
    subject?: string | (() => string)
  }>((props) => ({
    tag: 'div',
    _documentProps: {
      // Pass values through unmodified — extractDocumentTree resolves
      // any function (accessor) values at export time. Nullish values
      // are omitted so they don't appear as `title: undefined`.
      ...(props.title != null ? { title: props.title } : {}),
      ...(props.author != null ? { author: props.author } : {}),
      ...(props.subject != null ? { subject: props.subject } : {}),
    },
  }))
```

### Reactive metadata via accessor props

A `_documentProps` value may be a function (`() => T`). The connector resolves it at extraction time, so each export reads the **live** signal value rather than a value captured at component mount:

```tsx
function ResumeTemplate({ resume }: { resume: () => Resume }) {
  return (
    <DocDocument
      title={() => `${resume().name} — Resume`}
      author={() => resume().name}
    >
      {/* … */}
    </DocDocument>
  )
}
```

Because rocketstyle's `.attrs()` callback runs once at mount, a `string`-only prop bound to a live signal would freeze at its initial value. Storing the accessor in `_documentProps` and resolving it at extraction time keeps export metadata in sync with the live UI. See [`@pyreon/document-primitives`](/docs/document-primitives) for the full set of 18 primitives.

:::warning{title="Don't put runtime-filled fields in the .attrs<P>() generic"}
The `.attrs<P>()` generic is the **public** prop type. Runtime-filled fields like `tag` and `_documentProps` belong in the callback body, never in the generic — otherwise they leak as required JSX props on the component. Declare only the user-facing props (`title`, `author`, …) in the generic.
:::

## The DocNode Tree

`extractDocumentTree` produces a `DocNode` — the format-agnostic intermediate representation `@pyreon/document` renders. `DocNode`, `DocChild`, `NodeType`, and `ResolvedStyles` are re-exported from `@pyreon/document` so consumers can type the bridge without importing the renderer.

```ts
interface DocNode {
  type: NodeType
  props: Record<string, unknown>
  children: DocChild[]
  styles?: ResolvedStyles // resolved CSS from the ui-system connector
}

type DocChild = DocNode | string
```

### `NodeType`

The recognized document node types — set as the `_documentType` marker on a primitive:

```ts
type NodeType =
  | 'document'
  | 'page'
  | 'section'
  | 'row'
  | 'column'
  | 'heading'
  | 'text'
  | 'link'
  | 'image'
  | 'table'
  | 'list'
  | 'list-item'
  | 'page-break'
  | 'code'
  | 'divider'
  | 'spacer'
  | 'button'
  | 'quote'
```

### `ResolvedStyles`

The flat, render-target-friendly style shape `resolveStyles` produces. Every field is optional; only resolvable properties are emitted.

```ts
interface ResolvedStyles {
  fontSize?: number
  fontFamily?: string
  fontWeight?: 'normal' | 'bold' | number
  fontStyle?: 'normal' | 'italic'
  textDecoration?: 'none' | 'underline' | 'line-through'
  color?: string
  backgroundColor?: string
  textAlign?: 'left' | 'center' | 'right' | 'justify'
  lineHeight?: number
  letterSpacing?: number
  padding?: number | [number, number] | [number, number, number, number]
  margin?: number | [number, number] | [number, number, number, number]
  borderRadius?: number
  borderWidth?: number
  borderColor?: string
  borderStyle?: 'solid' | 'dashed' | 'dotted'
  width?: number | string
  height?: number | string
  maxWidth?: number | string
  opacity?: number
}
```

## API Reference

### Functions

| Export | Signature | Description |
| --- | --- | --- |
| `extractDocumentTree` | `(vnode: unknown, options?: ExtractOptions) => DocNode` | Walks a Pyreon VNode tree (or component function) and produces a `DocNode` for `@pyreon/document`. |
| `resolveStyles` | `(source, rootSize?, resolveVar?) => ResolvedStyles` | Converts a `$rocketstyle` theme object into a flat `ResolvedStyles`. |
| `parseCssDimension` | `(value, rootSize?) => number \| undefined` | Parses a CSS dimension to a px-equivalent number. |
| `parseBoxModel` | `(value, rootSize?) => number \| [number, number] \| [number, number, number, number] \| undefined` | Parses a `padding` / `margin` shorthand to a tuple. |
| `parseFontWeight` | `(value) => 'normal' \| 'bold' \| number \| undefined` | Normalizes a `font-weight` keyword or number. |
| `parseLineHeight` | `(value, rootSize?) => number \| undefined` | Parses a `line-height` to a number. |

### Types

| Type | Shape | Description |
| --- | --- | --- |
| `ExtractOptions` | `{ rootSize?, includeStyles?, resolveVar? }` | Options for `extractDocumentTree`. |
| `VarResolver` | `(value: unknown) => unknown` | Maps a style value to a render-target-evaluable one; inlines `var(--…)` references. Non-string / non-var values pass through unchanged. |
| `DocumentMarker` | `{ _documentType: NodeType }` | Marker interface — components carrying it are extractable. |
| `DocNode` | `{ type, props, children, styles? }` | A format-agnostic document node (re-exported from `@pyreon/document`). |
| `DocChild` | `DocNode \| string` | A child node — a nested `DocNode` or text (re-exported from `@pyreon/document`). |
| `NodeType` | union of 18 type strings | Document node type identifiers (re-exported from `@pyreon/document`). |
| `ResolvedStyles` | flat style object | The resolved style shape (re-exported from `@pyreon/document`). |

## Related Packages

- [`@pyreon/document-primitives`](/docs/document-primitives) — the 18 rocketstyle components you author; re-exports `extractDocumentTree` / `resolveStyles` and adds the higher-level `extractDocNode(templateFn)` / `createDocumentExport(templateFn)` helpers most apps use.
- [`@pyreon/document`](/docs/document) — the renderer. Takes a `DocNode` and produces 20 output formats (PDF, DOCX, XLSX, PPTX, HTML, email, Markdown, text, CSV, SVG, Slack, Teams, Discord, Telegram, Notion, Confluence, WhatsApp, Google Chat, JSON, JSONL).
- [`@pyreon/rocketstyle`](/docs/rocketstyle) / [`@pyreon/styler`](/docs/styler) / [`@pyreon/unistyle`](/docs/unistyle) — the CSS-in-JS layer the connector reads `$rocketstyle` and `var(--…)` values from.
