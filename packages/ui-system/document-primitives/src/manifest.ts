import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/document-primitives',
  title: 'Document Primitives',
  tagline:
    '18 rocketstyle document components — render in browser AND export to 14+ formats via the same tree',
  description:
    '18 rocketstyle-based document primitives — `DocDocument`, `DocPage`, `DocSection`, `DocRow`, `DocColumn`, `DocHeading`, `DocText`, `DocLink`, `DocImage`, `DocTable`, `DocList`, `DocListItem`, `DocCode`, `DocDivider`, `DocSpacer`, `DocButton`, `DocQuote`, `DocPageBreak`. The same JSX tree renders in the browser AND exports to 14+ output formats (PDF, DOCX, XLSX, PPTX, HTML, Markdown, email, Slack, Teams, etc.). Primitives carry `_documentType` static markers; `extractDocumentTree` (from `@pyreon/connector-document`) walks the tree to produce a `DocNode` for `@pyreon/document`\\\'s `render()` to consume. `DocDocument` accepts reactive accessors for `title` / `author` / `subject` — function values are stored in `_documentProps` and resolved at extraction time so each export click reads the LIVE value from the underlying signal.',
  category: 'browser',
  features: [
    '18 primitives covering structure, text, lists, tables, code, layout',
    'Same component tree renders in browser AND exports to 14+ formats',
    'extractDocNode(templateFn) — one-step extraction (recommended)',
    'createDocumentExport(templateFn) — two-step form (backward compat)',
    'DocDocument accepts reactive accessors for title / author / subject',
    'PR #197 fix: extractDocumentTree now calls rocketstyle components to read post-attrs metadata',
    'Layout props in .attrs() (direction / gap), CSS in .theme()',
  ],
  longExample: `import {
  DocDocument, DocPage, DocSection, DocRow, DocColumn,
  DocHeading, DocText, DocLink, DocImage, DocTable,
  DocList, DocListItem, DocCode, DocDivider, DocSpacer,
  DocButton, DocQuote, DocPageBreak,
  extractDocNode,
} from '@pyreon/document-primitives'
import { download } from '@pyreon/document'

interface Resume { name: string; headline: string }

function ResumeTemplate(props: { resume: () => Resume }) {
  return (
    // title and author accept reactive accessors — extractDocNode
    // resolves them at extraction time, so each export click reads
    // the LIVE value from the underlying signal
    <DocDocument
      title={() => \`\${props.resume().name} — Resume\`}
      author={() => props.resume().name}
    >
      <DocPage>
        <DocSection>
          <DocHeading level="h1">{() => props.resume().name}</DocHeading>
          <DocText>{() => props.resume().headline}</DocText>
        </DocSection>
      </DocPage>
    </DocDocument>
  )
}

// One-step extraction → render to any of 14+ formats
const tree = extractDocNode(() => <ResumeTemplate resume={store.resume} />)
await download(tree, 'resume.pdf')
await download(tree, 'resume.docx')
await download(tree, 'resume.html')
await download(tree, 'resume.md')`,
  api: [
    {
      name: 'extractDocNode',
      kind: 'function',
      signature: 'extractDocNode(templateFn: () => VNode, options?: ExtractOptions): DocNode',
      summary:
        "18 primitives: `DocDocument`, `DocPage`, `DocSection`, `DocRow`, `DocColumn`, `DocHeading`, `DocText`, `DocLink`, `DocImage`, `DocTable`, `DocList`, `DocListItem`, `DocCode`, `DocDivider`, `DocSpacer`, `DocButton`, `DocQuote`, `DocPageBreak`. Same component tree renders in browser AND exports — primitives carry `_documentType` statics that `extractDocumentTree` (from `@pyreon/connector-document`) walks to produce a `DocNode` for `@pyreon/document`\\\'s `render()` to consume. `DocDocument`\\\'s `title` / `author` / `subject` accept either a string OR a `() => string` accessor; function values are stored in `_documentProps` and resolved at extraction time so reactive metadata works without `const initial = get()` workarounds. PR #197 also fixed a latent bug in `extractDocumentTree`: it now CALLS rocketstyle component functions to read post-attrs `_documentProps`, where before it only looked at the JSX vnode\\\'s props directly — every primitive\\\'s metadata was silently dropped during export until that fix landed.",
      example: `import {
  DocDocument, DocPage, DocHeading, DocText,
  extractDocNode,
} from '@pyreon/document-primitives'
import { download } from '@pyreon/document'

const tree = extractDocNode(() => (
  <DocDocument title="Quarterly Report" author="Aisha">
    <DocPage>
      <DocHeading level="h1">Q4 Results</DocHeading>
      <DocText>Revenue grew 23% YoY.</DocText>
    </DocPage>
  </DocDocument>
))
await download(tree, 'report.pdf')
await download(tree, 'report.docx')`,
      mistakes: [
        'Calling `props.title()` at the top of a template body to "fix" reactivity — components run ONCE at mount, so this captures the initial value forever. Pass the accessor through to DocDocument as-is: `<DocDocument title={() => get().name}>`',
        "DocRow direction: layout props (direction, gap) go in `.attrs()` not `.theme()`. Element accepts `'inline'` | `'rows'` | `'reverseInline'` | `'reverseRows'` — `'row'` is NOT valid",
        "For text children reactivity, pass a signal accessor and read inside body: `<DocText>{() => store.field()}</DocText>`",
        "Don't declare runtime-filled fields (`tag`, `_documentProps`) in the rocketstyle `.attrs<P>()` generic — they leak as required JSX props",
        'Using `createDocumentExport(...).getDocNode()` in new code — prefer `extractDocNode(fn)` which is one call instead of two. `createDocumentExport` is kept for backward compat',
      ],
      seeAlso: ['createDocumentExport'],
    },
    {
      name: 'createDocumentExport',
      kind: 'function',
      signature:
        'createDocumentExport(templateFn: () => VNode): { getDocNode(): DocNode }',
      summary:
        'Wrapper around `extractDocNode`. The wrapper-object form is kept for callers that want to pass the helper around (e.g. to wrapper components that take a `DocumentExport` instance). New code should use `extractDocNode(templateFn)` which is one call instead of two.',
      example: `// Two-step form (kept for backward compat). New code should
// prefer the one-step extractDocNode helper.
import { createDocumentExport } from '@pyreon/document-primitives'

const helper = createDocumentExport(() => <Resume name="Aisha" />)
const tree = helper.getDocNode()`,
      seeAlso: ['extractDocNode'],
    },
    {
      name: 'DocDocument',
      kind: 'component',
      signature:
        '(props: { title?: string | (() => string); author?: string | (() => string); subject?: string | (() => string); children: VNodeChild }) => VNodeChild',
      summary:
        'Root container for a document tree — produces a `_documentType: "document"` node. Accepts optional metadata: `title`, `author`, `subject`. Each accepts either a plain string OR a `() => string` accessor; function values are stored in `_documentProps` and resolved at extraction time so each export call reads the LIVE value from any underlying signal.',
      example: `<DocDocument title="Quarterly Report" author="Aisha" subject="Q4 2025">
  <DocPage>...</DocPage>
</DocDocument>

// Reactive metadata via accessor
<DocDocument title={() => \`\${user().name} — Resume\`}>
  <DocPage>...</DocPage>
</DocDocument>`,
      seeAlso: ['DocPage', 'extractDocNode'],
    },
    {
      name: 'DocPage',
      kind: 'component',
      signature:
        "(props: { size?: string; orientation?: 'portrait' | 'landscape'; children: VNodeChild }) => VNodeChild",
      summary:
        'A page boundary inside a `DocDocument`. Paginated outputs (PDF, DOCX) treat each `DocPage` as a separate page; flow outputs (HTML, Markdown) render the contents inline with no page boundary. `size` and `orientation` configure paginated formats — common values: `"A4"`, `"Letter"`, `"Legal"`.',
      example: `<DocDocument>
  <DocPage size="A4" orientation="portrait">
    <DocHeading level="h1">Page 1</DocHeading>
  </DocPage>
  <DocPage size="A4" orientation="landscape">
    <DocHeading level="h1">Page 2 — landscape</DocHeading>
  </DocPage>
</DocDocument>`,
      seeAlso: ['DocDocument', 'DocPageBreak'],
    },
    {
      name: 'DocSection',
      kind: 'component',
      signature:
        "(props: { direction?: 'column' | 'row'; children: VNodeChild }) => VNodeChild",
      summary:
        'Semantic grouping inside a page. Default `direction` is `"column"` (children stack vertically); `"row"` arranges them horizontally. Use to group related content for visual rhythm and for export targets that emit semantic section markers (HTML `<section>`, DOCX section breaks).',
      example: `<DocPage>
  <DocSection direction="column">
    <DocHeading level="h2">Introduction</DocHeading>
    <DocText>Background paragraph.</DocText>
  </DocSection>
</DocPage>`,
      seeAlso: ['DocRow', 'DocColumn'],
    },
    {
      name: 'DocRow',
      kind: 'component',
      signature: '(props: { children: VNodeChild }) => VNodeChild',
      summary:
        'Horizontal layout container — children flow inline with a fixed 8px gap. Use for side-by-side content (label + value pairs, columns of metadata, button rows). Layout-only — no user-configurable props on this primitive; for columns with custom widths use `DocColumn` inside.',
      example: `<DocRow>
  <DocText>Name:</DocText>
  <DocText>Aisha Patel</DocText>
</DocRow>`,
      seeAlso: ['DocColumn', 'DocSection'],
    },
    {
      name: 'DocColumn',
      kind: 'component',
      signature:
        '(props: { width?: number | string; children: VNodeChild }) => VNodeChild',
      summary:
        'A column inside a row layout. Optional `width` controls the column\\\'s share of the row — accepts a number (interpreted as pixels) or a string (`"50%"`, `"1fr"`). When omitted, columns share available width equally. Most common shape is `<DocRow><DocColumn width="30%" /> <DocColumn width="70%" /></DocRow>`.',
      example: `<DocRow>
  <DocColumn width="30%">
    <DocText>Label</DocText>
  </DocColumn>
  <DocColumn width="70%">
    <DocText>Value</DocText>
  </DocColumn>
</DocRow>`,
      seeAlso: ['DocRow', 'DocSection'],
    },
    {
      name: 'DocHeading',
      kind: 'component',
      signature:
        "(props: { level?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'; children: VNodeChild }) => VNodeChild",
      summary:
        'Heading text — `level` (`"h1"` through `"h6"`) controls both visual size and the semantic level emitted to outputs (HTML `<h1>...<h6>`, DOCX heading styles, Markdown `#`...`######`). Default `level` is `"h1"`. Used for document structure that downstream tooling can build a TOC from.',
      example: `<DocHeading level="h1">Quarterly Report</DocHeading>
<DocHeading level="h2">Q4 Results</DocHeading>
<DocHeading level="h3">Revenue Breakdown</DocHeading>`,
      seeAlso: ['DocText', 'DocSection'],
    },
    {
      name: 'DocText',
      kind: 'component',
      signature: '(props: { children: VNodeChild }) => VNodeChild',
      summary:
        'Paragraph / inline text. The most common primitive — wraps any text content for the document. Children may be string literals OR signal accessors (`{() => store.field()}`) for reactive content. Visual styling (font weight, variant) is controlled via rocketstyle dimension props on the wrapping component definition.',
      example: `<DocText>Static paragraph content.</DocText>

// Reactive children
<DocText>{() => \`Hello, \${user().name}\`}</DocText>`,
      seeAlso: ['DocHeading', 'DocLink'],
    },
    {
      name: 'DocLink',
      kind: 'component',
      signature: '(props: { href?: string; children: VNodeChild }) => VNodeChild',
      summary:
        'Hyperlink within text. `href` is the URL — defaults to `"#"`. Outputs that support hyperlinks (HTML, PDF, DOCX, email) render this as a clickable link; flat outputs (plain text, certain Slack variants) render the link target inline as `text (href)`.',
      example: `<DocText>
  Read more on
  <DocLink href="https://pyreon.dev">our blog</DocLink>
  for the latest releases.
</DocText>`,
      seeAlso: ['DocText'],
    },
    {
      name: 'DocImage',
      kind: 'component',
      signature:
        '(props: { src: string; alt?: string; width?: number; height?: number; caption?: string }) => VNodeChild',
      summary:
        'An image embedded in the document. `src` is the image URL or data URI. `alt` is the accessible description (also used as fallback text in non-visual outputs). `width` / `height` constrain dimensions in pixels. Optional `caption` renders a caption beneath the image.',
      example: `<DocImage
  src="/charts/q4-revenue.png"
  alt="Revenue grew 23% in Q4"
  width={600}
  height={400}
  caption="Figure 1: Quarterly revenue, 2024-2025"
/>`,
      seeAlso: ['DocCode'],
    },
    {
      name: 'DocTable',
      kind: 'component',
      signature:
        '(props: { columns: TableColumn[]; rows: TableRow[]; headerStyle?: object; striped?: boolean; bordered?: boolean; caption?: string }) => VNodeChild',
      summary:
        'Tabular data. `columns` defines the header cells (label, key, optional alignment). `rows` is an array of data rows keyed by column key. `striped` adds alternating row backgrounds; `bordered` adds cell borders; `caption` renders an accessible table caption. Both `rows` and `columns` are filtered before reaching the DOM via `.attrs(..., { filter: [...] })` because `HTMLTableElement.rows` / `.cells` are read-only DOM properties — assignment would crash.',
      example: `<DocTable
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
/>`,
      seeAlso: ['DocList', 'DocSection'],
    },
    {
      name: 'DocList',
      kind: 'component',
      signature: '(props: { ordered?: boolean; children: VNodeChild }) => VNodeChild',
      summary:
        'Bulleted (default) or numbered (`ordered`) list. Children are typically `DocListItem` instances. Outputs map this to the right native list type — HTML `<ul>` / `<ol>`, Markdown `-` / `1.`, DOCX list styles.',
      example: `<DocList>
  <DocListItem>First bullet</DocListItem>
  <DocListItem>Second bullet</DocListItem>
</DocList>

<DocList ordered>
  <DocListItem>First step</DocListItem>
  <DocListItem>Second step</DocListItem>
</DocList>`,
      seeAlso: ['DocListItem'],
    },
    {
      name: 'DocListItem',
      kind: 'component',
      signature: '(props: { children: VNodeChild }) => VNodeChild',
      summary:
        'Single item inside a `DocList`. Children may be plain text, `DocText`, nested `DocList` for sublists, or any other inline primitive. Visual marker (bullet vs number) is decided by the parent list\\\'s `ordered` prop, not by the item.',
      example: `<DocList>
  <DocListItem>Top-level item</DocListItem>
  <DocListItem>
    Item with nested list
    <DocList>
      <DocListItem>Nested A</DocListItem>
      <DocListItem>Nested B</DocListItem>
    </DocList>
  </DocListItem>
</DocList>`,
      seeAlso: ['DocList'],
    },
    {
      name: 'DocCode',
      kind: 'component',
      signature: '(props: { language?: string; children: VNodeChild }) => VNodeChild',
      summary:
        'Monospace code block. Optional `language` hint enables syntax highlighting in outputs that support it (HTML via Prism / Shiki, Markdown fenced code blocks with language tag). Whitespace is preserved verbatim — pass code as a single string child to keep newlines.',
      example: `<DocCode language="typescript">{
\`const flow = createFlow({
  nodes: [{ id: '1', position: { x: 0, y: 0 } }],
  edges: [],
})\`
}</DocCode>`,
      seeAlso: ['DocText'],
    },
    {
      name: 'DocDivider',
      kind: 'component',
      signature: '(props: { color?: string; thickness?: number }) => VNodeChild',
      summary:
        'Horizontal rule — visual section separator. `color` controls the line color (any CSS color string); `thickness` controls the line thickness in pixels. Outputs map this to native dividers — HTML `<hr>`, Markdown `---`, DOCX horizontal rule.',
      example: `<DocText>Above the divider.</DocText>
<DocDivider color="#e5e7eb" thickness={1} />
<DocText>Below the divider.</DocText>`,
      seeAlso: ['DocSpacer'],
    },
    {
      name: 'DocSpacer',
      kind: 'component',
      signature: '(props: { height?: number }) => VNodeChild',
      summary:
        'Vertical whitespace — adds a blank vertical gap. `height` is in pixels (default 16). Use to space out content beyond what `DocSection` / `DocPage` margins provide. In flow outputs this becomes a styled blank block; in plain-text outputs, a sequence of newlines.',
      example: `<DocSection>
  <DocHeading level="h2">Section A</DocHeading>
  <DocText>Content...</DocText>
  <DocSpacer height={32} />
  <DocHeading level="h2">Section B</DocHeading>
  <DocText>More content...</DocText>
</DocSection>`,
      seeAlso: ['DocDivider'],
    },
    {
      name: 'DocButton',
      kind: 'component',
      signature: '(props: { href?: string; children: VNodeChild }) => VNodeChild',
      summary:
        'Call-to-action button. Renders as a styled clickable element in HTML / email outputs (mail-safe button table layout for email), and as a labeled link in PDF / DOCX. `href` is the action URL — defaults to `"#"`. Visual style (variant) is controlled via rocketstyle dimensions on the component definition.',
      example: `<DocButton href="https://pyreon.dev/signup">
  Get started
</DocButton>`,
      seeAlso: ['DocLink'],
    },
    {
      name: 'DocQuote',
      kind: 'component',
      signature: '(props: { borderColor?: string; children: VNodeChild }) => VNodeChild',
      summary:
        'Block quote — sets off a quoted passage with an indented left border. `borderColor` controls the indicator stripe (any CSS color). Outputs map this to native quote styling — HTML `<blockquote>`, Markdown `> ...`, DOCX quote style.',
      example: `<DocQuote borderColor="#3b82f6">
  <DocText>"The best way to predict the future is to build it."</DocText>
  <DocText>— Aisha Patel, Q4 keynote</DocText>
</DocQuote>`,
      seeAlso: ['DocText'],
    },
    {
      name: 'DocPageBreak',
      kind: 'component',
      signature: '() => VNodeChild',
      summary:
        'Explicit page boundary inside a `DocPage`. Forces the renderer to start a new page at this point in paginated outputs (PDF, DOCX). In flow outputs (HTML, Markdown), it renders as visible whitespace or is omitted entirely. Use for explicit pagination control beyond what `DocPage` boundaries already provide.',
      example: `<DocPage>
  <DocHeading level="h1">Section 1</DocHeading>
  <DocText>...long content...</DocText>
  <DocPageBreak />
  <DocHeading level="h1">Section 2 — new page</DocHeading>
</DocPage>`,
      seeAlso: ['DocPage'],
    },
  ],
  gotchas: [
    {
      label: 'Reactive metadata',
      note:
        '`DocDocument` `title` / `author` / `subject` accept either strings or `() => string` accessors. Function values are stored in `_documentProps` and resolved by `extractDocumentTree` at extraction time, so each export click reads the LIVE value from any underlying signal — no `const initial = get()` workaround needed.',
    },
    {
      label: 'PR #197 framework fix',
      note:
        'Before PR #197, `extractDocumentTree` only looked at the JSX vnode\\\'s direct props for `_documentProps` — but rocketstyle\\\'s attrs HOC stamps that field AFTER the component runs, so every real primitive\\\'s metadata was silently dropped during export. The extractor now CALLS the component function to capture the post-attrs vnode and reads `_documentProps` from there.',
    },
    {
      label: 'DocTable read-only DOM property collision',
      note:
        '`HTMLTableElement.rows` and `.cells` are read-only DOM properties — assigning to them throws. `DocTable` uses `.attrs(callback, { filter: ["rows", "columns", ...] })` to strip these props before they reach the DOM. Watch for similar collisions when adding new primitives that accept prop names matching native HTML element properties.',
    },
  ],
})
