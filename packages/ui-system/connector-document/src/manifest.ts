import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/connector-document',
  title: 'UI ↔ Document Bridge',
  tagline:
    'Bridge between ui-system JSX trees and @pyreon/document — extracts a DocNode tree for multi-format export',
  description:
    "The bridge between Pyreon's component layer and the `@pyreon/document` rendering pipeline. `extractDocumentTree(vnode)` walks a Pyreon JSX tree, finds components carrying a `_documentType` marker (the 18 `@pyreon/document-primitives`, or your own marked components), resolves their `_documentProps` and `$rocketstyle` CSS-in-JS styles, and produces a serializable `DocNode` tree that `@pyreon/document` renders to PDF, DOCX, XLSX, email, Markdown, and the other output formats. The hot path is fast: real rocketstyle primitives expose their accumulated `.attrs()` chain as `__rs_attrs`, and the extractor runs that chain directly — no styled-wrapper invocation, no dimension resolution.",
  category: 'browser',
  longExample: `import { extractDocumentTree, resolveStyles } from '@pyreon/connector-document'
import { render } from '@pyreon/document'
import { DocDocument, DocHeading, DocText } from '@pyreon/document-primitives'

const vnode = (
  <DocDocument title="Q4 Report" author="Acme Inc.">
    <DocHeading level="h1">Summary</DocHeading>
    <DocText>Revenue was up 12%.</DocText>
  </DocDocument>
)

// Walk the JSX tree → format-agnostic DocNode tree
const docTree = extractDocumentTree(vnode)
const pdf = await render(docTree, 'pdf')      // Buffer
const docx = await render(docTree, 'docx')    // Buffer
const md = await render(docTree, 'markdown')  // string

// Extraction is a SNAPSHOT — reactive accessors are resolved at extraction
// time, not subscribed. Re-extract after a signal change for a fresh tree:
const freshTree = extractDocumentTree(vnode)

// Under init({ cssVariables: true }), inline var(--…) values via resolveVar:
import { resolveModeVar } from '@pyreon/rocketstyle'
import { resolveCssVarReferences, themeToCssVars } from '@pyreon/unistyle'
const { registry } = themeToCssVars(theme)
const tree = extractDocumentTree(vnode, {
  resolveVar: (v) => resolveCssVarReferences(resolveModeVar(v, mode), registry),
})

// Standalone style resolution — $rocketstyle theme object → document styles:
const styles = resolveStyles({ fontSize: '1.5rem', color: '#222', padding: '12px 16px' }, 16)
// → { fontSize: 24, color: '#222', padding: [12, 16] }`,
  features: [
    'extractDocumentTree(vnode, options?) — walk a Pyreon JSX tree into a DocNode tree',
    '_documentType marker contract — rocketstyle `.statics()` metadata or a direct static on plain components',
    "Hoisted-attrs fast path — runs a rocketstyle primitive's __rs_attrs chain directly, no component invocation",
    'Reactive accessors resolved at extraction time — re-extract for a fresh snapshot after signal changes',
    'resolveStyles($rocketstyle, rootSize?, resolveVar?) — CSS-in-JS theme object → document ResolvedStyles',
    'CSS value parsers: parseCssDimension / parseBoxModel / parseFontWeight / parseLineHeight',
    'cssVariables-mode support — resolveVar inlines var(--…) references for PDF/DOCX targets',
    'DocNode / DocChild / NodeType / ResolvedStyles re-exported from @pyreon/document',
  ],
  api: [
    {
      name: 'extractDocumentTree',
      kind: 'function',
      signature: '(vnode: unknown, options?: ExtractOptions) => DocNode',
      summary:
        'Walk a Pyreon VNode tree and extract a `DocNode` tree for `@pyreon/document`. For each vnode whose component carries a `_documentType` marker it reads the marker → `DocNode.type`, resolves `_documentProps` → `DocNode.props` (pre-resolved vnode props → rocketstyle `__rs_attrs` fast path → full component invocation as legacy fallback), resolves `$rocketstyle` via `resolveStyles` → `DocNode.styles`, and recurses into children. Unmarked components are transparent (invoked; their children flatten into the parent); DOM elements (`div`, `span`) are transparent too. Function values in `_documentProps` and reactive accessor children are resolved (called) at extraction time. ALWAYS returns a `DocNode` — loose children are wrapped in `{ type: "document" }`.',
      example: `import { extractDocumentTree } from '@pyreon/connector-document'
import { render } from '@pyreon/document'
import { DocDocument, DocHeading, DocText } from '@pyreon/document-primitives'

const vnode = (
  <DocDocument title={() => reportTitle()} author="Acme Inc.">
    <DocHeading level="h1">Summary</DocHeading>
    <DocText>{() => summaryText()}</DocText>
  </DocDocument>
)

// Snapshot extraction — accessors read LIVE values at this moment
const tree = extractDocumentTree(vnode, { rootSize: 16, includeStyles: true })
const pdf = await render(tree, 'pdf')

// After a signal change, extract again for a fresh tree:
reportTitle.set('Q4 Report (final)')
const freshTree = extractDocumentTree(vnode)`,
      params: [
        {
          name: 'vnode',
          type: 'unknown',
          description:
            'A Pyreon VNode (JSX result), or a zero-arg component/template function — functions are called and their result extracted.',
        },
        {
          name: 'options',
          type: 'ExtractOptions',
          description:
            'rootSize (rem→px base, default 16), includeStyles (resolve $rocketstyle, default true), resolveVar (inline var(--…) values under cssVariables theming).',
          optional: true,
        },
      ],
      returns: {
        type: 'DocNode',
        description:
          'The extracted document tree. Loose children (no marked root) are wrapped in a `{ type: "document" }` node; a non-vnode input yields an empty document node.',
      },
      mistakes: [
        "Testing the extraction pipeline ONLY with hand-constructed mock vnodes that pre-attach `_documentProps` (the pre-resolved path) — the real rocketstyle path (`__rs_attrs` hoisted-attrs chain) is bypassed entirely. PR #197's silent metadata drop hid for the package's whole lifetime because no test ran a real `h()` primitive through extraction; always pair a mock-vnode test with a real-`h()` test",
        'Expecting extraction to SUBSCRIBE to signals — reactive accessor children and function-valued `_documentProps` are resolved ONCE per call; call `extractDocumentTree` again after a signal change to get a fresh tree',
        'Under `init({ cssVariables: true })`, forgetting `resolveVar` — `$rocketstyle` values are `var(--…)` reference strings PDF/DOCX/email cannot evaluate; compose `resolveModeVar` (`@pyreon/rocketstyle`) with `resolveCssVarReferences` (`@pyreon/unistyle`)',
        'Expecting a `DocNode | DocChild[] | null` return — the internal walker produces that union, but the public function ALWAYS returns a `DocNode`, wrapping loose children in `{ type: "document", props: {}, children }`',
        'Marking a non-rocketstyle component with `_documentType` and relying on side effects in its body — the legacy fallback path INVOKES the component to find `_documentProps`; keep marked components pure',
        'Expecting browser-only CSS (`transition`, `cursor`, `display`, animations) to reach the document — `resolveStyles` extracts only the properties `ResolvedStyles` supports and silently drops the rest',
      ],
      seeAlso: [
        'resolveStyles',
        'ExtractOptions',
        'DocumentMarker',
        '@pyreon/document',
        '@pyreon/document-primitives',
      ],
    },
    {
      name: 'resolveStyles',
      kind: 'function',
      signature:
        '(source: Record<string, unknown>, rootSize?: number, resolveVar?: VarResolver) => ResolvedStyles',
      summary:
        'Convert a rocketstyle `$rocketstyle` theme object into a `ResolvedStyles` object compatible with `@pyreon/document`. Extracts typography (fontSize/fontFamily/fontWeight/fontStyle/textDecoration/color/backgroundColor/textAlign/lineHeight/letterSpacing), box model (padding/margin as tuples), border (radius/width/color/style), sizing (width/height/maxWidth — numeric when parseable, raw string like `"100%"` otherwise), and opacity. Everything else (transitions, cursor, display) is silently dropped. Dimensions parse via `parseCssDimension` (rem/em × rootSize, pt × 4/3). `resolveVar` inlines `var(--…)` string values up front for cssVariables-mode apps.',
      example: `import { resolveStyles } from '@pyreon/connector-document'

const styles = resolveStyles(
  {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: '#222',
    padding: '12px 16px',
    transition: 'all 0.2s', // silently dropped — not a document property
  },
  16,
)
// → { fontSize: 24, fontWeight: 'bold', color: '#222', padding: [12, 16] }`,
      params: [
        {
          name: 'source',
          type: 'Record<string, unknown>',
          description: 'The `$rocketstyle` theme object (or any flat CSS-in-JS style object).',
        },
        {
          name: 'rootSize',
          type: 'number',
          description: 'Base font size for rem/em→px conversion. Default 16.',
          optional: true,
        },
        {
          name: 'resolveVar',
          type: 'VarResolver',
          description:
            'Optional value resolver that inlines `var(--…)` string values to raw values before parsing (cssVariables theming mode).',
          optional: true,
        },
      ],
      returns: {
        type: 'ResolvedStyles',
        description: 'Flat document-compatible style object; unsupported properties are absent.',
      },
      mistakes: [
        "Expecting `fontWeight: 'bold'` to resolve to `700` — `parseFontWeight` passes `'normal'` / `'bold'` through as string literals (both valid `ResolvedStyles` values); only numeric strings become numbers",
        "Expecting `em` to track the element's own font size — at extraction time there is no cascade, so `em` is treated like `rem` (multiplied by `rootSize`)",
        'Passing enum values outside the supported sets — `textAlign` accepts only left/center/right/justify, `borderStyle` only solid/dashed/dotted, `fontStyle` only normal/italic, `textDecoration` only none/underline/line-through; anything else is dropped',
        'Assuming percentage sizing parses to a number — `width: "100%"` is kept as the raw string (only px/rem/em/pt/unitless parse to numbers)',
      ],
      seeAlso: ['extractDocumentTree', 'VarResolver', 'parseCssDimension', 'parseBoxModel'],
    },
    {
      name: 'parseCssDimension',
      kind: 'function',
      signature:
        '(value: string | number | null | undefined, rootSize?: number) => number | undefined',
      summary:
        'Parse a CSS dimension to a number: numbers pass through, `"14px"` → 14, `"1.5rem"` / `"1.5em"` → 1.5 × rootSize, `"12pt"` → 16 (pt × 4/3), unitless numeric strings parse. Anything else (`"auto"`, percentages, calc/var expressions) returns `undefined`.',
      example: `parseCssDimension(14)          // 14
parseCssDimension('14px')      // 14
parseCssDimension('1.5rem', 16) // 24
parseCssDimension('12pt')      // 16
parseCssDimension('auto')      // undefined
parseCssDimension('50%')       // undefined`,
      mistakes: [
        'Feeding a `var(--…)` / `calc(…)` string — returns `undefined`; inline it first via a `VarResolver`',
      ],
      seeAlso: ['parseBoxModel', 'resolveStyles'],
    },
    {
      name: 'parseBoxModel',
      kind: 'function',
      signature:
        '(value: string | number | undefined, rootSize?: number) => number | [number, number] | [number, number, number, number] | undefined',
      summary:
        'Parse a CSS padding/margin shorthand to the document tuple format: `8` → `8`, `"8px 16px"` → `[8, 16]`, the 3-value shorthand `"8px 16px 12px"` expands to the CSS-equivalent 4-tuple `[8, 16, 12, 16]`, and 4 values map 1:1. Each segment parses via `parseCssDimension`.',
      example: `parseBoxModel(8)                  // 8
parseBoxModel('8px 16px')          // [8, 16]
parseBoxModel('8px 16px 12px')     // [8, 16, 12, 16]
parseBoxModel('0.5rem 1rem', 16)   // [8, 16]`,
      mistakes: [
        'One unparseable segment (`"8px auto"`) invalidates the WHOLE shorthand — the function returns `undefined`, not a partial tuple',
      ],
      seeAlso: ['parseCssDimension', 'resolveStyles'],
    },
    {
      name: 'parseFontWeight',
      kind: 'function',
      signature: "(value: string | number | undefined) => 'normal' | 'bold' | number | undefined",
      summary:
        'Parse a CSS font-weight: numbers pass through, the keywords `"normal"` / `"bold"` pass through AS STRINGS, numeric strings (`"600"`) parse to numbers. Other keywords (`"lighter"`, `"bolder"`) return `undefined`.',
      example: `parseFontWeight(600)      // 600
parseFontWeight('600')    // 600
parseFontWeight('bold')   // 'bold' (string, NOT 700)
parseFontWeight('bolder') // undefined`,
      mistakes: [
        "Expecting `'bold'` → `700` / `'normal'` → `400` — the keywords pass through unchanged as `ResolvedStyles`-valid string literals",
      ],
      seeAlso: ['resolveStyles'],
    },
    {
      name: 'parseLineHeight',
      kind: 'function',
      signature: '(value: string | number | undefined, rootSize?: number) => number | undefined',
      summary:
        'Parse a CSS line-height to a plain number: numbers pass through (a unitless ratio like `1.5` stays `1.5`), dimension strings parse via `parseCssDimension` (`"24px"` → 24, `"1.5rem"` → 24 with rootSize 16), and `"normal"` returns `undefined`. Note the return is a bare number — a unitless ratio and a px value are not distinguished in the type.',
      example: `parseLineHeight(1.5)          // 1.5 (ratio, passes through)
parseLineHeight('1.5')        // 1.5
parseLineHeight('24px')       // 24
parseLineHeight('1.5rem', 16) // 24
parseLineHeight('normal')     // undefined`,
      mistakes: [
        'Expecting a discriminated `{ ratio }` / `{ px }` result — the return is a plain `number | undefined`; callers must know which semantic they fed in',
      ],
      seeAlso: ['parseCssDimension', 'resolveStyles'],
    },
    {
      name: 'ExtractOptions',
      kind: 'type',
      signature:
        'interface ExtractOptions { rootSize?: number; includeStyles?: boolean; resolveVar?: VarResolver }',
      summary:
        'Options for `extractDocumentTree`. `rootSize` (default 16) is the rem→px base for style resolution; `includeStyles` (default true) toggles resolving `$rocketstyle` into `DocNode.styles`; `resolveVar` inlines `var(--…)` style values to raw values during extraction — required when the app runs under `init({ cssVariables: true })`, since PDF/DOCX/email targets cannot evaluate CSS custom properties.',
      example: `import { resolveModeVar } from '@pyreon/rocketstyle'
import { resolveCssVarReferences, themeToCssVars } from '@pyreon/unistyle'

const { registry } = themeToCssVars(theme)
const tree = extractDocumentTree(vnode, {
  rootSize: 16,
  includeStyles: true,
  resolveVar: (v) => resolveCssVarReferences(resolveModeVar(v, mode), registry),
})`,
      seeAlso: ['extractDocumentTree', 'VarResolver'],
    },
    {
      name: 'VarResolver',
      kind: 'type',
      signature: 'type VarResolver = (value: unknown) => unknown',
      summary:
        'Maps a style value to a render-target-evaluable one. Under cssVariables theming, `$rocketstyle` values can be `var(--…)` reference strings; a resolver (compose `resolveModeVar` from `@pyreon/rocketstyle` with `resolveCssVarReferences` from `@pyreon/unistyle`) inlines them to raw values at extraction time. Only own STRING values are remapped; non-strings pass through unchanged.',
      example: `const resolveVar: VarResolver = (v) =>
  resolveCssVarReferences(resolveModeVar(v, 'light'), registry)

const styles = resolveStyles(rocketstyleTheme, 16, resolveVar)`,
      seeAlso: ['ExtractOptions', 'resolveStyles'],
    },
    {
      name: 'DocumentMarker',
      kind: 'type',
      signature: 'interface DocumentMarker { _documentType: NodeType }',
      summary:
        'Marker interface: components carrying `_documentType` are extractable. Rocketstyle primitives set it via `.statics({ _documentType: "heading" })` (the extractor reads it from the component\'s `.meta`); plain function components set it as a direct static property. `@pyreon/document-primitives` ships 18 pre-marked primitives; follow the same convention for custom ones.',
      example: `import type { VNodeChild } from '@pyreon/core'

// Plain-function marked component (non-rocketstyle):
function Callout(props: { children?: VNodeChild }) {
  return <div _documentProps={{}}>{props.children}</div>
}
Callout._documentType = 'section'`,
      mistakes: [
        'Forgetting the marker — an unmarked component is TRANSPARENT: the extractor invokes it and flattens its children into the parent instead of producing a node',
      ],
      seeAlso: ['extractDocumentTree', '@pyreon/document-primitives'],
    },
    {
      name: 'DocNode',
      kind: 'type',
      signature:
        'interface DocNode { type: NodeType; props: Record<string, unknown>; children: DocChild[]; styles?: ResolvedStyles }',
      summary:
        'The format-agnostic document node — re-exported from `@pyreon/document` (along with `DocChild = DocNode | string`, the `NodeType` union of 18 node kinds, and `ResolvedStyles`) so extracted trees stay assignment-compatible across the package boundary without a duplicate type identity.',
      example: `import type { DocChild, DocNode, NodeType, ResolvedStyles } from '@pyreon/connector-document'

const node: DocNode = {
  type: 'heading',
  props: { level: 1 },
  children: ['Summary'],
}`,
      seeAlso: ['extractDocumentTree', '@pyreon/document'],
    },
  ],
  gotchas: [
    // First gotcha feeds the llms.txt one-liner teaser.
    'Extraction is a snapshot — reactive accessor children and function-valued `_documentProps` are resolved (called) at extraction time, not subscribed; re-run `extractDocumentTree` after a signal change to export the live state.',
    {
      label: 'Marker contract',
      note: 'A component is extractable when it carries `_documentType` — via rocketstyle `.statics()` (read from `.meta`) or as a direct static on a plain function. Unmarked components and DOM elements are transparent: their children flatten into the parent.',
    },
    {
      label: 'Test with real primitives',
      note: 'Mock vnodes that pre-attach `_documentProps` bypass the rocketstyle `__rs_attrs` fast path — the PR #197 silent-metadata-drop hid exactly there. Pair every mock-vnode test with a real-`h()` primitive test (see `.claude/rules/test-environment-parity.md`).',
    },
    {
      label: 'cssVariables mode',
      note: 'Under `init({ cssVariables: true })`, `$rocketstyle` values are `var(--…)` strings that PDF/DOCX/email cannot evaluate — pass `ExtractOptions.resolveVar` (compose `resolveModeVar` + `resolveCssVarReferences`) to inline them at extraction time.',
    },
  ],
})
