# @pyreon/connector-document

Bridge between `@pyreon/ui-system` JSX trees and `@pyreon/document` for multi-format export.

`@pyreon/connector-document` walks a Pyreon JSX tree of document-primitive components (`DocDocument`, `DocHeading`, `DocText`, …) and produces a serializable `DocNode` tree that `@pyreon/document` can render to PDF, DOCX, XLSX, PPTX, email, Markdown, HTML, and 10+ other formats. Components carry `_documentType` markers (set via `attrs().statics()` on rocketstyle primitives, or directly on user components); the extractor finds them, resolves `_documentProps` and `$rocketstyle` styles, and recursively walks children. The hot path is fast — for real rocketstyle primitives it runs the accumulated `.attrs()` chain directly instead of invoking the full component (no JSX tree creation, no dimension resolution).

## Install

```bash
bun add @pyreon/connector-document @pyreon/document @pyreon/core
```

## Quick start

```tsx
import { extractDocumentTree } from '@pyreon/connector-document'
import { render } from '@pyreon/document'
import { DocDocument, DocHeading, DocText } from '@pyreon/document-primitives'

const vnode = (
  <DocDocument title="Q4 Report" author="Acme Inc.">
    <DocHeading level={1}>Summary</DocHeading>
    <DocText>Revenue was up 12%.</DocText>
  </DocDocument>
)

const docTree = extractDocumentTree(vnode)
const pdf = await render(docTree, 'pdf')      // Buffer
const docx = await render(docTree, 'docx')    // Buffer
const md = await render(docTree, 'markdown')  // string
```

In practice, you'll usually call `extractDocNode` from `@pyreon/document-primitives` — a one-step alias that wraps a template function in an extraction-friendly shape — rather than `extractDocumentTree` directly. Use `extractDocumentTree` when you already have a vnode in hand (a captured render result, a test fixture).

## API

### `extractDocumentTree(vnode, options?)`

Walk a JSX vnode and produce a `DocNode` tree.

```ts
const tree = extractDocumentTree(vnode, {
  rootSize: 16,         // base font size for rem→px (default 16)
  includeStyles: true,  // resolve $rocketstyle into the DocNode.styles field (default true)
})
```

Returns `DocNode | DocChild[] | null` (re-exported from `@pyreon/document`). String/number children are inlined as text; reactive accessors (`() => signal()`) are resolved at extraction time, so calling `extractDocumentTree` again after a signal change produces a fresh tree reflecting the live values.

**Extraction resolution order for `_documentProps`** (per primitive):

1. **Pre-resolved on the vnode** — for test fixtures that hand-attach `_documentProps` directly.
2. **Hoisted-attrs fast path** — real rocketstyle primitives expose `__rs_attrs` (the accumulated `.attrs()` callback chain) as a typed static. The extractor runs the chain directly: `chain.reduce((acc, fn) => Object.assign(acc, fn(props)), {})`. No styled-wrapper invocation, no dimension resolution. Production path for every Pyreon doc primitive.
3. **Full component invocation** — legacy fallback for hand-rolled `_documentType`-marked components that don't go through rocketstyle.

### `resolveStyles(rocketstyle, rootSize?)`

Convert a `$rocketstyle` theme object into a `ResolvedStyles` (typography, color, spacing, borders) compatible with `@pyreon/document`. Properties the document renderer doesn't support (transitions, cursor, display) are silently dropped.

```ts
import { resolveStyles } from '@pyreon/connector-document'

const styles = resolveStyles({
  fontSize: '1.5rem',
  fontWeight: 'bold',
  color: '#222',
  padding: '12px 16px',
}, 16)
// → { fontSize: 24, fontWeight: 700, color: '#222', paddingTop: 12, paddingRight: 16, ... }
```

### CSS value parsers

Low-level helpers that `resolveStyles` uses internally. Useful when you need to bridge values from elsewhere into the document model.

```ts
import {
  parseCssDimension,    // '1.5rem' → 24 (with rootSize=16)
  parseBoxModel,        // '12px 16px' → { top: 12, right: 16, bottom: 12, left: 16 }
  parseFontWeight,      // 'bold' → 700; 'normal' → 400; numeric strings → number
  parseLineHeight,      // '1.5' → { ratio: 1.5 }; '24px' → { px: 24 }
} from '@pyreon/connector-document'
```

### Marker contract

A component is extractable when one of these holds:

- It's a rocketstyle primitive with `_documentType` in `.meta` (set via `.statics({ _documentType: 'document' | 'heading' | ... })`).
- It's a plain function with `_documentType` as a direct static property.

`@pyreon/document-primitives` ships 18 such primitives ready to use; you can add your own following the same marker convention.

## Types

`DocNode`, `DocChild`, `NodeType`, `ResolvedStyles` are re-exported from `@pyreon/document` — your trees stay assignment-compatible across the boundary.

```ts
import type { DocNode, DocChild, NodeType, ResolvedStyles } from '@pyreon/connector-document'
```

## Gotchas

- **Reactive accessor children are resolved at extraction time, not subscribed.** Each `extractDocumentTree(vnode)` call reads the live value once. To produce a document that reflects later signal changes, call extract again.
- **`$rocketstyle` is keyed by object identity.** A theme that was constructed fresh on every render won't share the same resolved-styles bundle across extractions — minor perf concern only.
- **Unsupported CSS is silently dropped** in `resolveStyles`. `transition`, `cursor`, `display`, animations, and any non-document property fall away. The same primitive will render correctly in the browser and produce a clean PDF without modification.
- **Function values in `_documentProps` are resolved on every extraction.** `DocDocument`'s `title?: string | (() => string)` reads the LIVE accessor value at extraction time — perfect for "export current state" buttons.

## Documentation

Full docs: [docs.pyreon.dev/docs/connector-document](https://docs.pyreon.dev/docs/connector-document) (or `docs/src/content/docs/connector-document.md` in this repo).

## License

MIT
