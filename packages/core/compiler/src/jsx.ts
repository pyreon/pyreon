/**
 * JSX transform — wraps dynamic JSX expressions in `() =>` so the Pyreon runtime
 * receives reactive getters instead of eagerly-evaluated snapshot values.
 *
 * Rules:
 *  - `<div>{expr}</div>`          → `<div>{() => expr}</div>`   (child)
 *  - `<div class={expr}>`         → `<div class={() => expr}>`  (prop)
 *  - `<button onClick={fn}>`      → unchanged                   (event handler)
 *  - `<div>{() => expr}</div>`    → unchanged                   (already wrapped)
 *  - `<div>{"literal"}</div>`     → unchanged                   (static)
 *
 * Static VNode hoisting:
 *  - Fully static JSX in expression containers is hoisted to module scope:
 *    `{<span>Hello</span>}` → `const _$h0 = <span>Hello</span>` + `{_$h0}`
 *  - Hoisted nodes are created ONCE at module initialisation, not per-instance.
 *  - A JSX node is static if: all props are string literals / booleans / static
 *    values, and all children are text nodes or other static JSX nodes.
 *
 * Template emission:
 *  - JSX element trees with ≥ 1 DOM elements (no components, no spread attrs on
 *    inner elements) are compiled to `_tpl(html, bindFn)` calls instead of nested
 *    `h()` calls.
 *  - The HTML string is parsed once via <template>.innerHTML, then cloneNode(true)
 *    for each instance (~5-10x faster than sequential createElement calls).
 *  - Static attributes are baked into the HTML string; dynamic attributes and
 *    text content use renderEffect in the bind function.
 *
 * Implementation: Rust native binary (napi-rs) when available, JS fallback via oxc-parser.
 */

import MagicString from 'magic-string'
import { parseSync } from 'oxc-parser'
import { REACT_EVENT_REMAP } from './event-names'
import { loadNativeBinding } from './load-native'

/**
 * V3 source map shape returned by the JS backend. Structurally exactly
 * magic-string's `SourceMap` (a valid V3 map plus `.toString()`/`.toUrl()`),
 * declared locally so `TransformResult` carries no hard type dependency on
 * magic-string's exported types.
 */
export interface GeneratedSourceMap {
  version: number
  file?: string
  sources: string[]
  sourcesContent?: (string | null)[]
  names: string[]
  mappings: string
  toString(): string
  toUrl(): string
}

// ─── Native binary auto-detection ────────────────────────────────────────────
// Two-path resolution: in-tree binary first (dev mode), then per-platform
// npm package (production install via optionalDependencies). Falls through
// to the JS implementation below when both paths fail (wrong platform, CI
// environment, WASM runtime like StackBlitz, missing per-platform package).
//
// See `load-native.ts` for the resolution logic.
/** The napi `CollapseConfig` shape — the JS `collapseRocketstyle` config
 * lowered from `Set`/`Map` to the array/Record form napi reads (camelCase
 * site fields auto-map to the Rust struct's snake_case). Built by
 * {@link toNativeCollapse} and threaded as `transformJsx`'s 6th arg. */
interface NativeCollapseSite {
  templateHtml: string
  lightClass: string
  darkClass: string
  rules: string[]
  ruleKey: string
}
interface NativeCollapseConfig {
  candidates: string[]
  sites: Record<string, NativeCollapseSite>
  mode: { name: string; source: string }
  runtimeDomSource?: string
  stylerSource?: string
}
type NativeTransformFn = (
  code: string,
  filename: string,
  ssr: boolean,
  knownSignals: string[] | null,
  reactivityLens: boolean,
  collapse?: NativeCollapseConfig,
) => TransformResult
const nativeBinding = loadNativeBinding(import.meta.url)
const nativeTransformJsx: NativeTransformFn | null = nativeBinding
  ? (nativeBinding.transformJsx as NativeTransformFn)
  : null

export interface CompilerWarning {
  /** Warning message */
  message: string
  /** Source file line number (1-based) */
  line: number
  /** Source file column number (0-based) */
  column: number
  /** Warning code for filtering */
  code:
    | 'signal-call-in-jsx'
    | 'missing-key-on-for'
    | 'signal-in-static-prop'
    | 'circular-prop-derived'
    | 'duplicate-jsx-attr'
}

/**
 * Reactivity-lens kinds. Each is a RECORD of a codegen decision the compiler
 * already made — never an approximation. Positive claims (`reactive*`) are
 * emitted ONLY where the compiler provably wrapped/tracked the span; absence
 * of a span is "not asserted", never an implicit static claim. `static-text`
 * is the high-precision negative: the literal `else` branch of the
 * reactive-vs-static text decision (the "this `{x}` is baked once / dead"
 * footgun signal when the author expected reactivity).
 */
export type ReactivityKind =
  | 'reactive' // expression re-evaluates on signal change (_bind/_bindText/`() =>` wrap)
  | 'reactive-prop' // component prop tracked into the child (_rp(() => …))
  | 'reactive-attr' // DOM attribute re-applied on signal change
  | 'static-text' // text expression baked once into the DOM, never re-renders
  | 'hoisted-static' // JSX hoisted to module scope, never re-evaluated

export interface ReactivitySpan {
  /** Source byte offset (start) of the spanned expression in the INPUT. */
  start: number
  /** Source byte offset (end). */
  end: number
  /** 1-based start line. */
  line: number
  /** 0-based start column. */
  column: number
  /** 1-based end line. */
  endLine: number
  /** 0-based end column. */
  endColumn: number
  /** Which codegen decision this span records. */
  kind: ReactivityKind
  /** Human-readable, editor-facing one-liner explaining the decision. */
  detail: string
}

export interface TransformResult {
  /** Transformed source code (JSX preserved, only expression containers modified) */
  code: string
  /** Whether the output uses _tpl/_re template helpers (needs auto-import) */
  usesTemplates?: boolean
  /** Compiler warnings for common mistakes */
  warnings: CompilerWarning[]
  /**
   * Source map (V3) for the transform — present on the JS backend whenever a
   * transformation actually occurred. `undefined` when nothing changed (the
   * emitted code is byte-identical to the input, so no remapping is needed)
   * and on the native backend (a Rust-side map is a scoped follow-up). The
   * object is magic-string's `SourceMap`: it is a valid V3 map AND has
   * `.toString()` / `.toUrl()`, so Vite/Rollup consume it directly.
   */
  map?: GeneratedSourceMap
  /**
   * Reactivity-lens spans — populated ONLY when `TransformOptions.reactivityLens`
   * is `true`. Additive: codegen output is byte-identical whether or not this is
   * collected. Each span is a faithful record of a reactivity decision the
   * compiler made for that source range. See {@link ReactivitySpan}.
   */
  reactivityLens?: ReactivitySpan[]
}

// Props that should never be wrapped in a reactive getter
const SKIP_PROPS = new Set(['key', 'ref'])
// Event handler pattern: onClick, onInput, onMouseEnter, …
const EVENT_RE = /^on[A-Z]/
// Events delegated to the container — must match runtime DELEGATED_EVENTS set
const DELEGATED_EVENTS = new Set([
  'click',
  'dblclick',
  'contextmenu',
  'focusin',
  'focusout',
  'input',
  'change',
  'keydown',
  'keyup',
  'mousedown',
  'mouseup',
  'mousemove',
  'mouseover',
  'mouseout',
  'pointerdown',
  'pointerup',
  'pointermove',
  'pointerover',
  'pointerout',
  'touchstart',
  'touchend',
  'touchmove',
  'submit',
])

export interface TransformOptions {
  /**
   * Compile for server-side rendering. When true, the compiler skips the
   * `_tpl()` template optimization and falls back to plain `h()` calls so
   * `@pyreon/runtime-server` can walk the VNode tree. Default: false.
   */
  ssr?: boolean

  /**
   * Compile-to-string SSR fast path (opt-in; requires `ssr: true`). When
   * enabled, an eligible static-skeleton JSX subtree is lowered to an `_ssr`
   * string template (`_ssr(["<li>…","</li>"], hole0, …)`) instead of a `h()`
   * VNode tree — the SSR analog of the DOM `_tpl()` cloneNode fast path. The
   * runtime `_ssr`/`_ssrChildren` resolve every dynamic hole through the SAME
   * `renderNode` the h() path uses, so the produced HTML is BYTE-IDENTICAL to
   * the h() walk it replaces (hydration is unaffected). Eligibility is
   * deliberately conservative — the compiler bails to `h()` on ANY shape it
   * can't prove renders byte-identically (dynamic attrs, `<select>`, spreads,
   * component children, void-with-content, …). Default `false`. NOTE: the
   * native (Rust) backend does not yet implement this — with the flag off both
   * backends stay byte-identical (the equivalence gates run flag-off), and the
   * fast path is exercised through the JS backend + dedicated differential
   * tests. Native parity + a `pyreon({ ssrTemplate: true })` vite-plugin
   * option are the tracked follow-up.
   */
  ssrTemplate?: boolean

  /**
   * Known signal variable names from resolved imports.
   * The Vite plugin maintains a cross-module signal export registry and
   * passes imported signal names here so the compiler can auto-call them
   * in JSX even though the `signal()` declaration is in another file.
   *
   * @example
   * // store.ts: export const count = signal(0)
   * // component.tsx: import { count } from './store'
   * transformJSX(code, 'component.tsx', { knownSignals: ['count'] })
   * // {count} in JSX → {() => count()}
   */
  knownSignals?: string[]

  /**
   * Collect the {@link ReactivitySpan} sidecar (`TransformResult.reactivityLens`).
   * Default `false`. Purely additive — the emitted `code` is byte-identical
   * whether this is on or off (asserted by the compiler equivalence tests).
   * The lens records reactivity decisions the compiler ALREADY makes for
   * codegen; it never runs a second analysis pass.
   */
  reactivityLens?: boolean

  /**
   * P0 — compile-time rocketstyle wrapper collapse. OFF unless the Vite
   * plugin supplies this (opt-in `pyreon({ collapse: true })`). The plugin
   * scans the module's imports for collapsible component candidates,
   * SSR-resolves each literal-prop call site once (real component, light
   * + dark), and passes the resolved `sites` map keyed by
   * {@link rocketstyleCollapseKey}. The compiler only DETECTS the
   * collapsible shape (bail catalogue — every dimension prop a string
   * literal, no spread, static-text children) and EMITS the collapsed
   * `_rsCollapse` call + the once-per-module rule injection; it never
   * runs the rocketstyle chain itself (RFC decision 2).
   */
  collapseRocketstyle?: {
    /** Component names imported into this module that MAY collapse. */
    candidates: Set<string>
    /** key → resolved emission data (absent ⇒ bail, keep normal mount). */
    sites: Map<
      string,
      {
        templateHtml: string
        lightClass: string
        darkClass: string
        rules: string[]
        ruleKey: string
      }
    >
    /** Live mode accessor to thread for dual-emit (RFC decision 1). */
    mode: { name: string; source: string }
    /** Module specifier for `_rsCollapse`. Default `@pyreon/runtime-dom`. */
    runtimeDomSource?: string
    /** Module specifier for the styler `sheet`. Default `@pyreon/styler`. */
    stylerSource?: string
  }
}

/**
 * Canonical key for a collapsible rocketstyle call site. The Vite plugin
 * computes this when it resolves a site; the compiler recomputes the
 * IDENTICAL key from the JSX node to look the resolution up. Stable
 * ordering of props so attribute order in source doesn't change the key.
 */
export function rocketstyleCollapseKey(
  componentName: string,
  props: Record<string, string>,
  childrenText: string,
): string {
  const propStr = Object.keys(props)
    .sort()
    .map((k) => `${k}=${props[k]}`)
    .join('\u0001')
  const src = `${componentName}\u0000${propStr}\u0000${childrenText}`
  let h = 2166136261
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

// ─── oxc ESTree helpers ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any // ESTree node — untyped for speed, matches the lint package approach

function getLang(filename: string): 'tsx' | 'jsx' {
  if (filename.endsWith('.jsx')) return 'jsx'
  // Default to tsx so JSX is always parsed — matches the original TypeScript
  // parser behavior which forced ScriptKind.TSX for all files.
  return 'tsx'
}

/** Binary search for line/column from byte offset. */
function makeLineIndex(code: string): (offset: number) => { line: number; column: number } {
  const lineStarts = [0]
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '\n') lineStarts.push(i + 1)
  }
  return (offset: number) => {
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1
      if (lineStarts[mid]! <= offset) lo = mid + 1
      else hi = mid - 1
    }
    return { line: lo, column: offset - lineStarts[lo - 1]! }
  }
}

/** Iterate all direct children of an ESTree node via known property keys. */
function forEachChild(node: N, cb: (child: N) => void): void {
  if (!node || typeof node !== 'object') return
  const keys = Object.keys(node)
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!
    // Skip metadata fields for speed
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range')
      continue
    const val = node[key]
    if (Array.isArray(val)) {
      for (let j = 0; j < val.length; j++) {
        const item = val[j]
        if (item && typeof item === 'object' && item.type) cb(item)
      }
    } else if (val && typeof val === 'object' && val.type) {
      cb(val)
    }
  }
}

// ─── JSX element helpers ────────────────────────────────────────────────────

function jsxTagName(node: N): string {
  const opening = node.openingElement
  if (!opening) return ''
  const name = opening.name
  return name?.type === 'JSXIdentifier' ? name.name : ''
}

function isSelfClosing(node: N): boolean {
  return node.type === 'JSXElement' && node.openingElement?.selfClosing === true
}

function jsxAttrs(node: N): N[] {
  return node.openingElement?.attributes ?? []
}

function jsxChildren(node: N): N[] {
  return node.children ?? []
}

/**
 * A collapsible call site found by {@link scanCollapsibleSites}.
 * `componentName` is the LOCAL JSX tag (post-import-alias) — it MUST be
 * what `rocketstyleCollapseKey` is computed from on BOTH sides so the
 * plugin's resolved `sites` map keys match the compiler's lookups.
 */
export interface CollapsibleSite {
  /** Local JSX tag name (the key + the compiler's detection use this). */
  componentName: string
  /** Module specifier the component was imported from (for the resolver). */
  source: string
  /** Imported binding name at `source` (may differ from local if aliased). */
  importedName: string
  /** Literal string-valued props (the only shape the slice collapses). */
  props: Record<string, string>
  /** Static text children (trimmed; empty ⇒ none). For element-child
   * sites this is the `serializeStaticChildren` key-string (carries C0
   * structure markers) — the resolver renders `childTree`, NOT this. */
  childrenText: string
  /** Element-child sites only: the recursively-static child subtree the
   * resolver rebuilds via `h()` to bake the full HTML. Absent for
   * full / dynamic sites (they use `childrenText` as a plain string). */
  childTree?: StaticChild[]
  /** `rocketstyleCollapseKey(componentName, props, childrenText)`. */
  key: string
}

/**
 * Build a `localName → { imported, source }` table from a module's
 * import declarations. Only named imports (`import { X as Y }`) are
 * relevant — the collapsible components are always named exports.
 */
function collectImportTable(program: N): Map<string, { imported: string; source: string }> {
  const table = new Map<string, { imported: string; source: string }>()
  for (const stmt of program.body ?? []) {
    if (stmt.type !== 'ImportDeclaration') continue
    const source = stmt.source?.value
    if (typeof source !== 'string') continue
    for (const spec of stmt.specifiers ?? []) {
      if (spec.type !== 'ImportSpecifier') continue
      const local = spec.local?.name
      const imported = spec.imported?.name ?? local
      if (typeof local === 'string') table.set(local, { imported, source })
    }
  }
  return table
}

/**
 * Pure detector — finds every collapsible rocketstyle call site in a
 * module. Used by `@pyreon/vite-plugin` to know which (component, props,
 * text) tuples to SSR-resolve. The bail catalogue here MUST stay
 * byte-identical to `tryRocketstyleCollapse`'s (RFC decision 3): a
 * candidate PascalCase tag whose import source is in `collapsibleSources`,
 * every attr a plain string literal (no spread, no `{expr}`, no boolean
 * attr), children empty or static text only. A consistency test asserts
 * the keys this produces equal the keys the compiler looks up.
 */
export function scanCollapsibleSites(
  code: string,
  filename: string,
  collapsibleSources: Set<string>,
): CollapsibleSite[] {
  let program: N
  try {
    program = parseSync(filename, code, { sourceType: 'module', lang: getLang(filename) }).program
  } catch {
    return []
  }
  const imports = collectImportTable(program)
  const out: CollapsibleSite[] = []
  const visit = (node: N): void => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'JSXElement') {
      const tag = jsxTagName(node)
      const imp = tag ? imports.get(tag) : undefined
      if (
        tag &&
        tag.charAt(0) !== tag.charAt(0).toLowerCase() &&
        imp &&
        collapsibleSources.has(imp.source)
      ) {
        const site = detectCollapsibleShape(node, tag)
        if (site) {
          out.push({
            componentName: tag,
            source: imp.source,
            importedName: imp.imported,
            props: site.props,
            childrenText: site.childrenText,
            key: rocketstyleCollapseKey(tag, site.props, site.childrenText),
          })
        } else {
          // Dynamic-prop fallthrough: if the full detector bailed but
          // the site matches the ternary-of-two-literals shape, expand
          // into TWO CollapsibleSite entries — one per literal value.
          // Each expanded site is byte-identical to a static-collapse
          // site for that value, so the resolver pre-renders both via
          // the existing SSR pipeline and the compiler emit looks up
          // both by their respective keys to build the dispatcher.
          //
          // No-handler sites route to `__rsCollapseDyn`; handler-bearing
          // sites route to `__rsCollapseDynH` (handlers are orthogonal
          // to the SSR-resolved styler class — see `tryDynamicCollapse`
          // in this file). The scan does NOT distinguish here because
          // the resolver only cares about (componentName, props, text);
          // handlers don't affect the resolution.
          const dyn = detectDynamicCollapsibleShape(node, tag)
          if (dyn) {
            for (const value of [dyn.dynamicProp.valueTruthy, dyn.dynamicProp.valueFalsy]) {
              const expandedProps = { ...dyn.props, [dyn.dynamicProp.name]: value }
              out.push({
                componentName: tag,
                source: imp.source,
                importedName: imp.imported,
                props: expandedProps,
                childrenText: dyn.childrenText,
                key: rocketstyleCollapseKey(tag, expandedProps, dyn.childrenText),
              })
            }
          } else {
            // Element-child fallthrough (PR 2): literal root props +
            // recursively-static element children. The resolver renders
            // the real `childTree` via `h()` and bakes the full subtree
            // HTML; the emit is the unchanged `__rsCollapse`. Key uses
            // the serialized child subtree so distinct subtrees resolve
            // to distinct templates.
            const elem = detectElementChildCollapsibleShape(node, tag)
            if (elem) {
              out.push({
                componentName: tag,
                source: imp.source,
                importedName: imp.imported,
                props: elem.props,
                childrenText: elem.childrenKey,
                childTree: elem.childTree,
                key: rocketstyleCollapseKey(tag, elem.props, elem.childrenKey),
              })
            }
          }
        }
      }
    }
    for (const k in node) {
      const v = node[k]
      if (Array.isArray(v)) for (const c of v) visit(c)
      else if (v && typeof v === 'object' && typeof v.type === 'string') visit(v)
    }
  }
  visit(program)
  return out
}

/**
 * The shared bail catalogue — every attr a string literal (no spread, no
 * `{expr}`, no boolean attr), children empty or static text. Returns the
 * extracted {props, childrenText} or null (bail). `tryRocketstyleCollapse`
 * inlines the identical checks; a consistency test locks them together.
 */
function detectCollapsibleShape(
  node: N,
  _tag: string,
): { props: Record<string, string>; childrenText: string } | null {
  const props: Record<string, string> = {}
  for (const attr of jsxAttrs(node)) {
    if (attr.type !== 'JSXAttribute') return null // spread → bail
    const nm = attr.name?.type === 'JSXIdentifier' ? attr.name.name : null
    if (!nm) return null
    const v = attr.value
    if (!v) return null // boolean attr → bail
    const isStr =
      v.type === 'StringLiteral' || (v.type === 'Literal' && typeof v.value === 'string')
    if (!isStr) return null // `{expr}` / dynamic → bail
    props[nm] = String(v.value)
  }
  let childrenText = ''
  for (const c of jsxChildren(node)) {
    if (c.type === 'JSXText') childrenText += (c.value ?? '') as string
    else return null // element / expression child → bail
  }
  return { props, childrenText: childrenText.trim() }
}

// ─── Element-child collapse — recursively-static child detection ─────────────
//
// P0 element-child collapse (open-work #1 frontier). `detectCollapsibleShape`
// bails on ANY element child. This detector recognises the SAFE subset:
// element children whose ENTIRE subtree is provably static, so the SSR
// resolver can bake the full subtree into the `_rsCollapse` template with
// nothing reactive lost. Conservative by construction — a child carrying
// ANY reactivity (component tag, `{expr}` prop, `on*` handler, `{expr}`
// child) is a hard bail.
//
// PR 1 (this) is measurement-only: the detector + a deterministic
// serializer feed the bail census so we can size the addressable surface
// before wiring the resolver (PR 2). Nothing here is yet called by the
// emit path.

/** A statically-bakeable child element subtree. */
export interface StaticChildNode {
  /** Lowercase DOM tag (component children are never static). */
  tag: string
  /** String-literal attributes only. */
  props: Record<string, string>
  /** Child text segments + nested static elements, in source order. */
  children: StaticChild[]
}

export type StaticChild = string | StaticChildNode

/**
 * Recursively check a single JSX child element for static-bakeability.
 * Returns a `StaticChildNode` tree or `null` (bail).
 *
 * Accepts iff ALL hold, recursively:
 *   - lowercase (DOM) tag — NOT a component
 *   - every attribute is a string literal (no spread, boolean, `{expr}`,
 *     or `on*` handler — a child handler can't survive baking)
 *   - children are static text OR recursively-static elements
 */
export function detectStaticElementChild(node: N): StaticChildNode | null {
  if (node?.type !== 'JSXElement') return null
  const tag = jsxTagName(node)
  // Component (uppercase first char) → has its own reactivity → bail.
  if (!tag || tag.charAt(0) !== tag.charAt(0).toLowerCase()) return null

  const props: Record<string, string> = {}
  for (const attr of jsxAttrs(node)) {
    if (attr.type !== 'JSXAttribute') return null // spread → bail
    const nm = attr.name?.type === 'JSXIdentifier' ? attr.name.name : null
    if (!nm) return null
    // No handlers on a baked child — a static clone can't carry them.
    if (/^on[A-Z]/.test(nm)) return null
    const v = attr.value
    if (!v) return null // boolean attr → bail
    const isStr =
      v.type === 'StringLiteral' || (v.type === 'Literal' && typeof v.value === 'string')
    if (!isStr) return null // `{expr}` / dynamic → bail
    props[nm] = String(v.value)
  }

  const children = collectStaticChildren(node)
  if (children === null) return null
  return { tag, props, children }
}

/**
 * Process a parent element's children into a `StaticChild[]` list, or
 * `null` if ANY child is non-static. Text segments are normalized via
 * the SAME `cleanJsxText` the compiler applies to its own JSX text emit
 * — inline spaces preserved (`"Press "` keeps its trailing space before
 * a sibling `<kbd>`), newline-adjacent / whitespace-only lines dropped.
 * This keeps the tree FAITHFUL so a later pass (PR 2) reconstructing via
 * `h()` renders byte-identically to a real mount. Element children
 * recurse via `detectStaticElementChild`.
 */
export function collectStaticChildren(parent: N): StaticChild[] | null {
  const out: StaticChild[] = []
  for (const c of jsxChildren(parent)) {
    if (c.type === 'JSXText') {
      const t = cleanJsxText((c.value ?? '') as string)
      if (t) out.push(t)
      continue
    }
    if (c.type === 'JSXElement') {
      const child = detectStaticElementChild(c)
      if (!child) return null
      out.push(child)
      continue
    }
    // JSXExpressionContainer / JSXFragment / JSXSpreadChild → bail.
    return null
  }
  return out
}

/**
 * Deterministic serialization of a static child list — used as the
 * `childrenText` argument to {@link rocketstyleCollapseKey} for
 * element-child sites. Two structurally-different subtrees MUST produce
 * different strings so collapse keys never collide. Uses control-char
 * delimiters (matching `rocketstyleCollapseKey`'s own `\u0000` / `\u0001`
 * convention) that can't appear in JSX source.
 */
export function serializeStaticChildren(children: StaticChild[]): string {
  const parts: string[] = []
  for (const c of children) {
    if (typeof c === 'string') {
      parts.push(`t\u0002${c}`)
    } else {
      const propStr = Object.keys(c.props)
        .sort()
        .map((k) => `${k}=${c.props[k]}`)
        .join('\u0001')
      parts.push(`e\u0002${c.tag}\u0003${propStr}\u0004${serializeStaticChildren(c.children)}`)
    }
  }
  return parts.join('\u0005')
}

/**
 * Element-child collapse detector (PR 2). The EXACT `detectCollapsibleShape`
 * root-prop bail catalogue (every attr a string literal — no spread,
 * boolean, `{expr}`, or handler) with ONE relaxation: element children
 * are allowed WHEN the whole child list is recursively static
 * (`collectStaticChildren` succeeds). Returns `null` for the text-only
 * case (no element child) so the FULL-collapse path stays byte-unchanged
 * and the two detectors never both claim a site.
 *
 * The `childrenKey` is `serializeStaticChildren(childTree)` — fed to
 * `rocketstyleCollapseKey` as the `childrenText` arg so the collapse key
 * incorporates the subtree (distinct subtrees → distinct keys, never
 * colliding with a text-only full-collapse key whose `childrenText` is
 * plain text without the C0 structure markers). The resolver renders the
 * real `childTree` via `h()` and bakes the full subtree HTML; the emit
 * is the UNCHANGED `__rsCollapse(...)` (no new runtime helper — the
 * baked template already contains the children).
 */
export function detectElementChildCollapsibleShape(
  node: N,
  _tag: string,
): { props: Record<string, string>; childTree: StaticChild[]; childrenKey: string } | null {
  const props: Record<string, string> = {}
  for (const attr of jsxAttrs(node)) {
    if (attr.type !== 'JSXAttribute') return null // spread → bail
    const nm = attr.name?.type === 'JSXIdentifier' ? attr.name.name : null
    if (!nm) return null
    const v = attr.value
    if (!v) return null // boolean attr → bail
    const isStr =
      v.type === 'StringLiteral' || (v.type === 'Literal' && typeof v.value === 'string')
    if (!isStr) return null // `{expr}` / handler / dynamic → bail
    props[nm] = String(v.value)
  }
  const childTree = collectStaticChildren(node)
  if (childTree === null) return null // any non-static child → bail
  // Must contain ≥1 element child — a text-only list is the FULL-collapse
  // shape; defer to `detectCollapsibleShape` so that path stays unchanged.
  if (!childTree.some((c) => typeof c !== 'string')) return null
  return { props, childTree, childrenKey: serializeStaticChildren(childTree) }
}

/** A residual event handler peeled off a partially-collapsible site. */
export interface CollapsibleHandler {
  /** JSX attribute name, e.g. `onClick`. */
  name: string
  /** Source span of the handler expression (the `{...}` contents). */
  exprStart: number
  exprEnd: number
}

/**
 * Partial-collapse detector — PR 1 of the partial-collapse spec
 * (`CLAUDE.md` ("Compile-time rocketstyle collapse") collapse-tail). The `on*`-handler-only
 * subset the bail-reason census measured at 7.8% of all
 * `@pyreon/ui-components` call sites (`collapse-bail-census.test.ts`).
 *
 * It is the EXACT `detectCollapsibleShape` bail catalogue with ONE
 * relaxation: a `{expr}`-valued attribute whose name matches `on[A-Z]…`
 * (an event handler) does NOT bail — it is peeled into `handlers[]`
 * instead. Handlers are orthogonal to the SSR-resolved styler class (an
 * event binding never changes rendered CSS), so the literal-prop subset
 * still feeds the UNCHANGED `rocketstyleCollapseKey` and the resolver's
 * pre-resolved `templateHtml` / `lightClass` / `darkClass` are
 * byte-identical to a full-collapse site's. The collapsed runtime node
 * just re-attaches the residual handlers (PR 2 — `_rsCollapseH`).
 *
 * Every OTHER non-literal shape still bails (spread, non-handler
 * `{expr}` prop, boolean attr, element/expression child) — conservative
 * by construction, exactly like the full detector. Returns `null` when
 * there are ZERO handlers so the full-collapse path stays byte-unchanged
 * and the two detectors never both claim the same site (full-collapse
 * sites have no handlers; partial sites have ≥1). A consistency test
 * will lock this catalogue against the plugin scan in PR 3, mirroring
 * the existing `detectCollapsibleShape` ↔ `scanCollapsibleSites`
 * invariant — keys cannot drift.
 */
export function detectPartialCollapsibleShape(
  node: N,
  _tag: string,
): { props: Record<string, string>; childrenText: string; handlers: CollapsibleHandler[] } | null {
  const props: Record<string, string> = {}
  const handlers: CollapsibleHandler[] = []
  for (const attr of jsxAttrs(node)) {
    if (attr.type !== 'JSXAttribute') return null // spread → bail
    const nm = attr.name?.type === 'JSXIdentifier' ? attr.name.name : null
    if (!nm) return null
    const v = attr.value
    if (!v) return null // boolean attr → bail
    const isStr =
      v.type === 'StringLiteral' || (v.type === 'Literal' && typeof v.value === 'string')
    if (isStr) {
      props[nm] = String(v.value)
      continue
    }
    // Non-literal: ONLY an `on[A-Z]…` handler in a `{expr}` container is
    // peelable. Everything else (non-handler dynamic prop, shorthand
    // `onClick` without a container, etc.) is a hard bail — same
    // conservatism as the full detector.
    if (
      /^on[A-Z]/.test(nm) &&
      v.type === 'JSXExpressionContainer' &&
      v.expression &&
      typeof v.expression.start === 'number' &&
      typeof v.expression.end === 'number'
    ) {
      handlers.push({ name: nm, exprStart: v.expression.start, exprEnd: v.expression.end })
      continue
    }
    return null // `{expr}` non-handler / dynamic → bail
  }
  let childrenText = ''
  for (const c of jsxChildren(node)) {
    if (c.type === 'JSXText') childrenText += (c.value ?? '') as string
    else return null // element / expression child → bail
  }
  // Zero handlers ⇒ this is the FULL-collapse shape; defer to
  // `detectCollapsibleShape` so the existing path stays byte-unchanged.
  if (handlers.length === 0) return null
  return { props, childrenText: childrenText.trim(), handlers }
}

/**
 * A dynamic dimension prop on a collapsible call site. A ConditionalExpression
 * (ternary) where both branches are string literals — `state={cond ? 'a' : 'b'}`
 * is the canonical shape. Pre-resolution: the prop's value belongs to the
 * enumerable set `[valueA, valueB]`. The compiler emits one collapsed
 * variant per literal value + a dispatcher on the original `cond`.
 */
export interface DynamicCollapsibleProp {
  /** JSX attribute name, e.g. `state`. */
  name: string
  /** Source span of the ternary condition (the `cond` part), re-emitted into the runtime dispatcher. */
  condStart: number
  condEnd: number
  /** Literal value for the `cond === truthy` branch (consequent). */
  valueTruthy: string
  /** Literal value for the `cond === falsy` branch (alternate). */
  valueFalsy: string
}

/**
 * Dynamic-prop partial-collapse detector — PR 2 of the dynamic-prop
 * partial-collapse build (`CLAUDE.md` "Compile-time rocketstyle collapse";
 * dynamic-prop bucket = 15.3% of all real-corpus sites; the next-bigger
 * bite after the `on*`-handler partial-collapse).
 *
 * Mirrors `detectPartialCollapsibleShape`'s "extend the bail catalogue
 * with ONE relaxation" pattern (see that detector's docstring +
 * `_rsCollapseDyn` runtime helper). The single relaxation: a
 * `JSXExpressionContainer` wrapping a `ConditionalExpression` whose
 * `consequent` AND `alternate` are BOTH `StringLiteral` is acceptable as
 * a "ternary-of-two-literals" dynamic prop — captured as a {@link DynamicCollapsibleProp}
 * with the cond source span + the two literal values.
 *
 * Constraint: **AT MOST ONE** such dynamic prop per site. Multiple
 * ternaries would compound into a 2^N value-set per site at build time
 * and an N-axis dispatcher at runtime — that's a separable scope
 * (potential PR 5+), NOT this PR. Sites with 2+ ternaries bail (return
 * null), keeping the normal mount; same conservative shape as the rest
 * of the detector family.
 *
 * Constraint: the FULL `on*`-handler relaxation is also folded in — a
 * site can have ONE ternary AND `on*` handlers in the same call. This
 * matches the real-corpus shape (a Button with `state={cond ? 'a' : 'b'}`
 * almost always also has an `onClick`). The two relaxations compose
 * cleanly because they're orthogonal at the resolver layer (handlers
 * don't change rendered CSS; the ternary picks among pre-resolved
 * classes). PR 3's emit will use `_rsCollapseDyn` when handlers are
 * absent and a future combined helper when both are present — for THIS
 * PR (detector-only) the structure carries both so PR 3 can dispatch.
 *
 * Every OTHER non-literal shape still bails (spread, non-handler
 * non-ternary `{expr}` prop, multi-literal ternary anywhere, computed-
 * expression ternary, element/expression child, boolean attr) —
 * conservative by construction, exactly like the rest of the family.
 * Returns `null` when there are ZERO ternaries so the on*-only path
 * (`detectPartialCollapsibleShape`) and the full-collapse path
 * (`detectCollapsibleShape`) stay byte-unchanged and no detector both
 * claims the same site.
 *
 * A consistency test (PR 3) will lock this catalogue against the
 * plugin scan, mirroring the `detectCollapsibleShape` ↔ `scanCollapsibleSites`
 * + `detectPartialCollapsibleShape` ↔ scan invariants — keys cannot drift.
 */
export function detectDynamicCollapsibleShape(
  node: N,
  _tag: string,
): {
  props: Record<string, string>
  childrenText: string
  handlers: CollapsibleHandler[]
  dynamicProp: DynamicCollapsibleProp
} | null {
  const props: Record<string, string> = {}
  const handlers: CollapsibleHandler[] = []
  const dynamicProps: DynamicCollapsibleProp[] = []
  for (const attr of jsxAttrs(node)) {
    if (attr.type !== 'JSXAttribute') return null // spread → bail
    const nm = attr.name?.type === 'JSXIdentifier' ? attr.name.name : null
    if (!nm) return null
    const v = attr.value
    if (!v) return null // boolean attr → bail
    const isStr =
      v.type === 'StringLiteral' || (v.type === 'Literal' && typeof v.value === 'string')
    if (isStr) {
      props[nm] = String(v.value)
      continue
    }
    // Non-literal in a `{expr}` container — three possible relaxations:
    //   (a) `on[A-Z]…` handler with any expression → peeled
    //   (b) any other prop whose expression is a ternary of two string
    //       literals → peeled as a DynamicCollapsibleProp
    //   (c) anything else → bail
    if (
      v.type === 'JSXExpressionContainer' &&
      v.expression &&
      typeof v.expression.start === 'number' &&
      typeof v.expression.end === 'number'
    ) {
      if (/^on[A-Z]/.test(nm)) {
        handlers.push({ name: nm, exprStart: v.expression.start, exprEnd: v.expression.end })
        continue
      }
      const expr = v.expression
      if (
        expr.type === 'ConditionalExpression' &&
        expr.test &&
        typeof expr.test.start === 'number' &&
        typeof expr.test.end === 'number' &&
        expr.consequent &&
        expr.alternate
      ) {
        // Both branches must be StringLiteral. We deliberately do NOT
        // accept TemplateLiteral / `as`-casted literals / any other
        // shape — keep the static-resolvable set narrow + provable.
        const isLitStr = (n: unknown): n is { type: 'StringLiteral'; value: string } => {
          const x = n as { type?: string; value?: unknown }
          return (
            x?.type === 'StringLiteral' || (x?.type === 'Literal' && typeof x.value === 'string')
          )
        }
        if (isLitStr(expr.consequent) && isLitStr(expr.alternate)) {
          dynamicProps.push({
            name: nm,
            condStart: expr.test.start,
            condEnd: expr.test.end,
            valueTruthy: String((expr.consequent as { value: string }).value),
            valueFalsy: String((expr.alternate as { value: string }).value),
          })
          continue
        }
      }
    }
    return null // `{expr}` non-handler non-ternary, or non-literal ternary branch → bail
  }
  let childrenText = ''
  for (const c of jsxChildren(node)) {
    if (c.type === 'JSXText') childrenText += (c.value ?? '') as string
    else return null // element / expression child → bail
  }
  // Exactly ONE dynamic prop is the scope of this PR. Zero ⇒ defer to
  // the existing detectors (full / on*-handler partial); 2+ ⇒ bail
  // (multi-axis combinatorics is a separable scope).
  if (dynamicProps.length !== 1) return null
  return {
    props,
    childrenText: childrenText.trim(),
    handlers,
    dynamicProp: dynamicProps[0]!,
  }
}

// ─── Main transform ─────────────────────────────────────────────────────────

export function transformJSX(
  code: string,
  filename = 'input.tsx',
  options: TransformOptions = {},
): TransformResult {
  // Compile-to-string SSR fast path (`ssrTemplate`) is implemented in the JS
  // backend ONLY for now — the native backend ignores the flag, so route
  // through JS when it's set (SSR compilation is build-time; the win is the
  // per-request `_ssr` render). With the flag OFF (the default, and what every
  // equivalence gate uses) native runs as before and both backends stay
  // byte-identical. Native `ssrTemplate` parity is the tracked follow-up.
  if (options.ssrTemplate === true && options.ssr === true) {
    return transformJSX_JS(code, filename, options)
  }
  // Try Rust native binary first (3.7-8.2x faster). The native backend now
  // implements ALL FOUR rocketstyle-collapse variants byte-identically (locked
  // by the cross-backend equivalence suite), so `collapseRocketstyle` is lowered
  // to the napi shape and threaded as the 6th arg instead of forcing the JS path.
  // Per-call try/catch: if the native binary panics on an edge case (bad UTF-8,
  // unexpected AST shape), fall back gracefully instead of crashing the dev server.
  if (nativeTransformJsx) {
    try {
      return nativeTransformJsx(
        code,
        filename,
        options.ssr === true,
        options.knownSignals ?? null,
        options.reactivityLens === true,
        options.collapseRocketstyle ? toNativeCollapse(options.collapseRocketstyle) : undefined,
      )
    } catch {
      // Native transform failed — fall through to JS implementation
    }
  }
  return transformJSX_JS(code, filename, options)
}

/** Lower the JS `collapseRocketstyle` config (`Set`/`Map`) to the napi
 * array/Record shape. Site objects keep their camelCase keys (napi maps them to
 * the Rust struct's snake_case fields). Optional source overrides are only
 * included when present (exactOptionalPropertyTypes — never assigned `undefined`). */
function toNativeCollapse(
  c: NonNullable<TransformOptions['collapseRocketstyle']>,
): NativeCollapseConfig {
  const out: NativeCollapseConfig = {
    candidates: [...c.candidates],
    sites: Object.fromEntries(c.sites),
    mode: c.mode,
  }
  if (c.runtimeDomSource !== undefined) out.runtimeDomSource = c.runtimeDomSource
  if (c.stylerSource !== undefined) out.stylerSource = c.stylerSource
  return out
}

/** JS fallback implementation — used when the native binary isn't available. */
export function transformJSX_JS(
  code: string,
  filename = 'input.tsx',
  options: TransformOptions = {},
): TransformResult {
  const ssr = options.ssr === true
  const ssrTemplate = ssr && options.ssrTemplate === true

  let program: N
  try {
    const result = parseSync(filename, code, {
      sourceType: 'module',
      lang: getLang(filename),
    })
    program = result.program
  } catch {
    return { code, warnings: [] }
  }

  const locate = makeLineIndex(code)

  type Replacement = { start: number; end: number; text: string }
  const replacements: Replacement[] = []
  const warnings: CompilerWarning[] = []

  function warn(node: N, message: string, warnCode: CompilerWarning['code']): void {
    const { line, column } = locate(node.start as number)
    warnings.push({ message, line, column, code: warnCode })
  }

  // ── Reactivity lens (opt-in, additive — never affects `result`) ───────────
  const collectLens = options.reactivityLens === true
  const reactivityLens: ReactivitySpan[] = []
  function lens(start: number, end: number, kind: ReactivityKind, detail: string): void {
    if (!collectLens) return
    const a = locate(start)
    const b = locate(end)
    reactivityLens.push({
      start,
      end,
      line: a.line,
      column: a.column,
      endLine: b.line,
      endColumn: b.column,
      kind,
      detail,
    })
  }

  // ── Parent + children maps (built once, eliminates repeated Object.keys) ──
  const parentMap = new WeakMap<object, N>()
  const childrenMap = new WeakMap<object, N[]>()

  /** Build parent pointers + cached children arrays for the entire AST. */
  function buildMaps(node: N): void {
    const kids: N[] = []
    const keys = Object.keys(node)
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range')
        continue
      const val = node[key]
      if (Array.isArray(val)) {
        for (let j = 0; j < val.length; j++) {
          const item = val[j]
          if (item && typeof item === 'object' && item.type) kids.push(item)
        }
      } else if (val && typeof val === 'object' && val.type) {
        kids.push(val)
      }
    }
    childrenMap.set(node, kids)
    for (let i = 0; i < kids.length; i++) {
      parentMap.set(kids[i]!, node)
      buildMaps(kids[i]!)
    }
  }
  buildMaps(program)

  function findParent(node: N): N | undefined {
    return parentMap.get(node)
  }

  /** Fast child iteration using pre-computed children array. */
  function forEachChildFast(node: N, cb: (child: N) => void): void {
    const kids = childrenMap.get(node)
    if (!kids) return
    for (let i = 0; i < kids.length; i++) cb(kids[i]!)
  }

  // ── Static hoisting state ─────────────────────────────────────────────────
  type Hoist = { name: string; text: string }
  const hoists: Hoist[] = []
  let hoistIdx = 0
  let needsTplImport = false
  let needsRpImport = false
  let needsWrapSpreadImport = false
  let needsBindTextImportGlobal = false
  let needsBindDirectImportGlobal = false
  let needsBindImportGlobal = false
  let needsBindPolyImportGlobal = false
  let needsSetChildImportGlobal = false
  let needsSetChildAtImportGlobal = false
  let needsApplyPropsImportGlobal = false
  let needsMountSlotImportGlobal = false
  let needsCxImportGlobal = false
  let needsSetStyleImportGlobal = false
  let needsSetClassImportGlobal = false
  let needsSetAttrImportGlobal = false
  // Compile-to-string SSR fast path (`options.ssrTemplate`): which
  // `@pyreon/runtime-server` helpers this module used.
  let needsSsrImport = false
  let needsSsrChildrenImport = false
  let needsSsrItemImport = false
  let needsEscImport = false
  let needsSsrAttrImport = false
  let needsSsrAttrGenImport = false
  let needsSsrAttrUrlImport = false

  // ── P0 rocketstyle-collapse state ─────────────────────────────────────────
  let needsCollapse = false
  let needsCollapseH = false
  let needsCollapseDyn = false
  let needsCollapseDynH = false
  const collapseRuleKeys = new Set<string>()
  const collapseRules: Array<{ ruleKey: string; rules: string[] }> = []

  /**
   * Detect + collapse a literal-prop rocketstyle call site. Conservative
   * bail catalogue (RFC decision 3): PascalCase candidate, every attr a
   * StringLiteral (no spread, no `{expr}`, no boolean attr), children
   * empty or a single static JSXText. The plugin must already have
   * SSR-resolved this exact (component, props, text) tuple — an absent
   * `sites` entry is a hard bail (covers resolver-bailed shapes,
   * cross-package-without-data, anything uncertain). Emits ONE
   * `_rsCollapse(tpl, light, dark, () => mode()==='dark')` (dual-emit)
   * plus a once-per-module idempotent `injectRules`. A false negative is
   * correct-but-slow; a false positive is wrong output — so every
   * uncertain signal returns false.
   */
  function tryRocketstyleCollapse(node: N): boolean {
    const cfg = options.collapseRocketstyle
    if (!cfg) return false
    const tag = jsxTagName(node)
    if (!tag || tag.charAt(0) === tag.charAt(0).toLowerCase()) return false
    if (!cfg.candidates.has(tag)) return false
    // Shared bail catalogue — IDENTICAL to scanCollapsibleSites (the
    // plugin scans with the same predicate, so its resolved `sites`
    // keys match these lookups exactly; no drift possible).
    const shape = detectCollapsibleShape(node, tag)
    // Fallthrough chain — same conservative discipline at each layer:
    //   1. on*-handler-only partial (literal dim props + handlers)
    //   2. dynamic-prop partial (ternary-of-two-literals on ≤1 dim prop,
    //      no handlers — handler-combined dynamic is a future PR's scope)
    if (!shape)
      return (
        tryPartialCollapse(node, tag) ||
        tryDynamicCollapse(node, tag) ||
        tryElementChildCollapse(node, tag)
      )
    const { props, childrenText } = shape
    const key = rocketstyleCollapseKey(tag, props, childrenText)
    const site = cfg.sites.get(key)
    if (!site) return false // not resolved → keep normal rocketstyle mount
    const call =
      `__rsCollapse(${JSON.stringify(site.templateHtml)}, ` +
      `${JSON.stringify(site.lightClass)}, ${JSON.stringify(site.darkClass)}, ` +
      `() => __pyrMode() === "dark")`
    const start = node.start as number
    const end = node.end as number
    const parent = findParent(node)
    const needsBraces = parent && (parent.type === 'JSXElement' || parent.type === 'JSXFragment')
    replacements.push({ start, end, text: needsBraces ? `{${call}}` : call })
    needsCollapse = true
    if (!collapseRuleKeys.has(site.ruleKey)) {
      collapseRuleKeys.add(site.ruleKey)
      collapseRules.push({ ruleKey: site.ruleKey, rules: site.rules })
    }
    return true
  }

  /**
   * PR 3 of the partial-collapse build (open-work #1). The `on*`-handler-
   * only fallback `tryRocketstyleCollapse` defers to when the FULL
   * `detectCollapsibleShape` bails. Identical site-resolution contract as
   * the full path — handlers are orthogonal to the SSR-resolved styler
   * class, so the literal-prop subset feeds the UNCHANGED
   * `rocketstyleCollapseKey` and the resolver's pre-resolved
   * `templateHtml`/`lightClass`/`darkClass` are byte-identical to a
   * full-collapse site's. The ONLY difference vs the full emit is
   * `__rsCollapseH(...)` with a handlers object literal built from the
   * sliced source spans `detectPartialCollapsibleShape` (PR 1) returned;
   * the runtime helper (`_rsCollapseH`, PR 2 / #681) re-attaches them
   * through the canonical event path. Same conservative discipline: an
   * unresolved key, the option absent, or any non-handler non-literal
   * shape ⇒ keep the normal mount (return false).
   */
  function tryPartialCollapse(node: N, tag: string): boolean {
    const cfg = options.collapseRocketstyle
    if (!cfg) return false
    const partial = detectPartialCollapsibleShape(node, tag)
    if (!partial) return false
    const { props, childrenText, handlers } = partial
    const key = rocketstyleCollapseKey(tag, props, childrenText)
    const site = cfg.sites.get(key)
    if (!site) return false // not resolved → keep normal rocketstyle mount
    // `{ "onClick": (<sliced expr>), … }` — each handler expression is
    // re-emitted verbatim from its source span (paren-wrapped so an
    // arrow / sequence expr stays a single argument).
    const handlerObj = `{ ${handlers
      .map((h) => `${JSON.stringify(h.name)}: (${code.slice(h.exprStart, h.exprEnd)})`)
      .join(', ')} }`
    const call =
      `__rsCollapseH(${JSON.stringify(site.templateHtml)}, ` +
      `${JSON.stringify(site.lightClass)}, ${JSON.stringify(site.darkClass)}, ` +
      `() => __pyrMode() === "dark", ${handlerObj})`
    const start = node.start as number
    const end = node.end as number
    const parent = findParent(node)
    const needsBraces = parent && (parent.type === 'JSXElement' || parent.type === 'JSXFragment')
    replacements.push({ start, end, text: needsBraces ? `{${call}}` : call })
    needsCollapse = true
    needsCollapseH = true
    if (!collapseRuleKeys.has(site.ruleKey)) {
      collapseRuleKeys.add(site.ruleKey)
      collapseRules.push({ ruleKey: site.ruleKey, rules: site.rules })
    }
    return true
  }

  /**
   * PR 3 of the dynamic-prop partial-collapse build (open-work #1
   * dynamic-prop bucket = 15.3% of all real-corpus sites; the
   * next-bigger bite after the just-shipped `on*`-handler partial).
   * The dynamic-prop fallback `tryRocketstyleCollapse` defers to when
   * BOTH the full and the on*-handler-partial paths bail.
   *
   * Same site-resolution contract as the full path — the dynamic prop
   * is replaced with EACH literal value to compute TWO keys; the
   * resolver pre-renders both via the existing SSR pipeline; if both
   * lookups succeed AND the structural template is byte-identical
   * across values, emit `__rsCollapseDyn(html, [classes...], () =>
   * cond ? 0 : 1, () => __pyrMode() === "dark")` — the runtime helper
   * dispatches across `(value × mode)` with a stride-2
   * value-major class layout.
   *
   * Conservative discipline:
   *   - Either expanded key missing from sites map ⇒ bail (an
   *     intermittent resolver failure on one value mustn't half-collapse)
   *   - Divergent template HTML across values ⇒ bail (the dispatcher
   *     assumes a shared template; deriveCollapseDyn cannot be done
   *     across values that produce structurally different markup —
   *     this is the cross-value parallel of `deriveCollapse`'s
   *     light↔dark template-divergence bail)
   *
   * Handler-combined sites: when the detected dynamic site has `on*`
   * handlers (the most common real-corpus shape — bail-census measured
   * the no-handler subset at 0.2% of all sites; handler-combined is
   * the bulk of the 15.4% dynamic-prop bucket), emit
   * `__rsCollapseDynH(...)` (PR A: runtime helper) instead of
   * `__rsCollapseDyn(...)`. Handlers are orthogonal to the SSR-
   * resolved styler class (the resolver pre-renders both values
   * identically regardless of handlers); the union helper just
   * re-attaches them through the same canonical `_bindEvent` path
   * `tryPartialCollapse` uses.
   *
   * Rule injection unions the rule sets across both values (each value
   * may inject distinct CSS rules — e.g. `state="primary"` and
   * `state="secondary"` produce different background-color rules); the
   * union is the byte-set the dispatcher will need at runtime regardless
   * of which value the cond resolves to. Idempotent by per-value
   * `ruleKey` so a re-resolve / HMR is a no-op.
   */
  function tryDynamicCollapse(node: N, tag: string): boolean {
    const cfg = options.collapseRocketstyle
    if (!cfg) return false
    const dyn = detectDynamicCollapsibleShape(node, tag)
    if (!dyn) return false
    const { props, childrenText, dynamicProp, handlers } = dyn
    // Look up BOTH expanded sites (one per literal value). The scan's
    // dynamic-prop fallthrough (above in this file) emits a CollapsibleSite
    // for each value with identical key construction, so these lookups
    // must succeed iff both resolved.
    const truthyProps = { ...props, [dynamicProp.name]: dynamicProp.valueTruthy }
    const falsyProps = { ...props, [dynamicProp.name]: dynamicProp.valueFalsy }
    const truthyKey = rocketstyleCollapseKey(tag, truthyProps, childrenText)
    const falsyKey = rocketstyleCollapseKey(tag, falsyProps, childrenText)
    const truthySite = cfg.sites.get(truthyKey)
    const falsySite = cfg.sites.get(falsyKey)
    if (!truthySite || !falsySite) return false // half-resolved ⇒ keep normal mount
    // Cross-value template parity — the dispatcher reuses ONE `_tpl`
    // across both values; divergent markup means we'd silently pick
    // the truthy variant's HTML for falsy too. Bail conservatively.
    if (truthySite.templateHtml !== falsySite.templateHtml) return false

    // Build the stride-2 value-major class array (consumed by
    // `_rsCollapseDyn`): `[v0_light, v0_dark, v1_light, v1_dark]` where
    // v0 = truthy (cond → 0), v1 = falsy (cond → 1).
    const classes = [
      truthySite.lightClass,
      truthySite.darkClass,
      falsySite.lightClass,
      falsySite.darkClass,
    ]
    const condSrc = code.slice(dynamicProp.condStart, dynamicProp.condEnd)

    // Handler-combined sites route to `__rsCollapseDynH(...)` (PR A
    // runtime helper) — handlers re-attached after the class dispatcher
    // via the canonical `_bindEvent` path, byte-identical to how
    // `tryPartialCollapse` re-emits handlers via `__rsCollapseH`.
    // No-handler sites stay on `__rsCollapseDyn(...)` (lighter — no
    // handlers parameter, no loop allocation).
    let call: string
    if (handlers.length > 0) {
      const handlerObj = `{ ${handlers
        .map((h) => `${JSON.stringify(h.name)}: (${code.slice(h.exprStart, h.exprEnd)})`)
        .join(', ')} }`
      call =
        `__rsCollapseDynH(${JSON.stringify(truthySite.templateHtml)}, ` +
        `${JSON.stringify(classes)}, ` +
        `() => (${condSrc}) ? 0 : 1, ` +
        `() => __pyrMode() === "dark", ` +
        `${handlerObj})`
      needsCollapseDynH = true
    } else {
      call =
        `__rsCollapseDyn(${JSON.stringify(truthySite.templateHtml)}, ` +
        `${JSON.stringify(classes)}, ` +
        `() => (${condSrc}) ? 0 : 1, ` +
        `() => __pyrMode() === "dark")`
      needsCollapseDyn = true
    }
    const start = node.start as number
    const end = node.end as number
    const parent = findParent(node)
    const needsBraces = parent && (parent.type === 'JSXElement' || parent.type === 'JSXFragment')
    replacements.push({ start, end, text: needsBraces ? `{${call}}` : call })
    // Union BOTH value's rule bundles into the per-module injection.
    // De-dupe by ruleKey (the FNV-1a hash from the resolver) so two
    // dynamic sites sharing a value pay one injection.
    for (const site of [truthySite, falsySite]) {
      if (!collapseRuleKeys.has(site.ruleKey)) {
        collapseRuleKeys.add(site.ruleKey)
        collapseRules.push({ ruleKey: site.ruleKey, rules: site.rules })
      }
    }
    return true
  }

  /**
   * Element-child collapse (PR 2). The fallback `tryRocketstyleCollapse`
   * reaches LAST (after full / partial / dynamic all bail). Literal root
   * props + recursively-static element children. Because the resolver
   * SSR-renders the REAL component WITH its child subtree and bakes the
   * full output HTML, the emit is the UNCHANGED `__rsCollapse(...)` — no
   * new runtime helper (the cloned template already contains the
   * children). The key uses `serializeStaticChildren` so the lookup
   * matches the scan's element-child entry. Conservative: an unresolved
   * key (resolver bailed) keeps the normal mount.
   */
  function tryElementChildCollapse(node: N, tag: string): boolean {
    const cfg = options.collapseRocketstyle
    if (!cfg) return false
    const elem = detectElementChildCollapsibleShape(node, tag)
    if (!elem) return false
    const key = rocketstyleCollapseKey(tag, elem.props, elem.childrenKey)
    const site = cfg.sites.get(key)
    if (!site) return false // not resolved → keep normal mount
    const call =
      `__rsCollapse(${JSON.stringify(site.templateHtml)}, ` +
      `${JSON.stringify(site.lightClass)}, ${JSON.stringify(site.darkClass)}, ` +
      `() => __pyrMode() === "dark")`
    const start = node.start as number
    const end = node.end as number
    const parent = findParent(node)
    const needsBraces = parent && (parent.type === 'JSXElement' || parent.type === 'JSXFragment')
    replacements.push({ start, end, text: needsBraces ? `{${call}}` : call })
    needsCollapse = true
    if (!collapseRuleKeys.has(site.ruleKey)) {
      collapseRuleKeys.add(site.ruleKey)
      collapseRules.push({ ruleKey: site.ruleKey, rules: site.rules })
    }
    return true
  }

  function maybeHoist(node: N): string | null {
    if ((node.type === 'JSXElement' || node.type === 'JSXFragment') && isStaticJSXNode(node)) {
      const name = `_$h${hoistIdx++}`
      const text = code.slice(node.start as number, node.end as number)
      hoists.push({ name, text })
      lens(
        node.start as number,
        node.end as number,
        'hoisted-static',
        'static — hoisted once to module scope, never re-evaluated',
      )
      return name
    }
    return null
  }

  function wrap(expr: N): void {
    const start = expr.start as number
    const end = expr.end as number
    const sliced = sliceExpr(expr)
    const text = expr.type === 'ObjectExpression' ? `() => (${sliced})` : `() => ${sliced}`
    replacements.push({ start, end, text })
    lens(start, end, 'reactive', 'live — re-evaluates whenever its signals change')
  }

  function hoistOrWrap(expr: N): void {
    const hoistName = maybeHoist(expr)
    if (hoistName) {
      replacements.push({ start: expr.start as number, end: expr.end as number, text: hoistName })
    } else if (shouldWrap(expr)) {
      wrap(expr)
    }
  }

  // ── Template emit ─────────────────────────────────────────────────────────

  function tryTemplateEmit(node: N): boolean {
    if (ssr) return false
    if (isSelfClosing(node)) return false
    const elemCount = templateElementCount(node, true)
    if (elemCount < 1) return false
    const tplCall = buildTemplateCall(node)
    if (!tplCall) return false
    const start = node.start as number
    const end = node.end as number
    const parent = findParent(node)
    const needsBraces = parent && (parent.type === 'JSXElement' || parent.type === 'JSXFragment')
    replacements.push({ start, end, text: needsBraces ? `{${tplCall}}` : tplCall })
    needsTplImport = true
    return true
  }

  // ── Compile-to-string SSR fast path (`options.ssrTemplate`) ────────────────
  //
  // Lowers an eligible static-skeleton element tree to a single
  // `_ssr(["<li>…","</li>"], hole0, …)` string template — the SSR analog of
  // the DOM `_tpl()` cloneNode path. Correctness rests entirely on the runtime
  // resolving each hole through the SAME `renderNode` the h() path uses, so the
  // produced bytes are byte-identical to walking the equivalent `h()` tree.
  //
  // Eligibility is CONSERVATIVE: `buildSsrCall` returns null (→ bail to h()) on
  // ANY shape it can't prove renders byte-identically. A false negative (h()
  // when `_ssr` would have worked) is fine; a false positive is a hydration bug.
  //
  // TWO serialization modes: elements the compiler WOULD recurse into (the root
  // + directly-nested child elements) wrap dynamic children in `() =>` accessors
  // → `<!--$-->…<!--/$-->` markers, matching `handleJsxExpression`'s wrap. A
  // `.map` CALLBACK BODY is never compiler-recursed (the outer `.map` is wrapped
  // whole), so inside it every expression child is a PLAIN VALUE child (no
  // markers) — 'mapitem' mode emits bare holes throughout.

  type SsrMode = 'recursed' | 'mapitem'

  interface SsrBuf {
    statics: string[]
    holes: string[]
  }

  function ssrEmitStatic(buf: SsrBuf, s: string): void {
    buf.statics[buf.statics.length - 1] += s
  }
  function ssrEmitHole(buf: SsrBuf, exprText: string): void {
    buf.holes.push(exprText)
    buf.statics.push('')
  }

  /** A generic attribute (`_ssrAttrGen` fast path is byte-identical): lowercase
   * name, not class/style, not aria-*, not URL-bearing. Everything else needs
   * `renderProp`'s full logic (`_ssrAttr`). */
  function ssrAttrIsGeneric(name: string): boolean {
    if (/[A-Z]/.test(name)) return false
    if (name === 'class' || name === 'style') return false
    if (name.charCodeAt(0) === 97 && name.startsWith('aria-')) return false
    if (SSR_URL_ATTRS.has(name)) return false
    return true
  }

  // ── Proven-non-null-non-boolean dynamic-attr baking ────────────────────────
  // When a dynamic attr's value EXPRESSION is syntactically provably a
  // string/number (never null/undefined/false/true), `renderProp`'s null-omit +
  // boolean branches are DEAD, so ` name="` + `_esc(value)` + `"` is byte-
  // identical to `renderProp` — and matches Solid's template baking (name +
  // quotes static, only the value escaped at runtime). Anything not provable
  // keeps the runtime `_ssrAttr*` (null-omit safety preserved).

  /** The expression provably evaluates to a STRING (never null/bool). */
  function ssrProvablyString(node: N): boolean {
    node = unwrapTypeLayers(node)
    if (
      node.type === 'StringLiteral' ||
      (node.type === 'Literal' && typeof node.value === 'string') ||
      node.type === 'TemplateLiteral'
    ) {
      return true
    }
    if (node.type === 'CallExpression') {
      const callee = node.callee
      // `String(x)` global coercion → always a string.
      if (callee?.type === 'Identifier' && callee.name === 'String') return true
      // `x.method(...)` for a method that ALWAYS returns a string (unambiguous
      // receiver — Array#join / Number#toFixed / String#* all return string).
      if (
        callee?.type === 'MemberExpression' &&
        !callee.computed &&
        callee.property?.type === 'Identifier' &&
        SSR_STRING_METHODS.has(callee.property.name)
      ) {
        return true
      }
      return false
    }
    // `a + b` where EITHER operand is provably a string → string concat coerces
    // the other side, so the whole expression is a string regardless of it.
    if (node.type === 'BinaryExpression' && node.operator === '+') {
      return ssrProvablyString(node.left) || ssrProvablyString(node.right)
    }
    if (node.type === 'ConditionalExpression') {
      return ssrProvablyString(node.consequent) && ssrProvablyString(node.alternate)
    }
    return false
  }

  /** The expression provably evaluates to a string OR number (never null/bool). */
  function ssrProvablyNonNullNonBoolean(node: N): boolean {
    node = unwrapTypeLayers(node)
    if (ssrProvablyString(node)) return true
    if (
      node.type === 'NumericLiteral' ||
      (node.type === 'Literal' && typeof node.value === 'number')
    ) {
      return true
    }
    // `Number(x)` → always a number (NaN is still a number).
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'Number') {
      return true
    }
    // `a + b` with both operands non-null-non-boolean → number-or-string.
    if (node.type === 'BinaryExpression' && node.operator === '+') {
      return ssrProvablyNonNullNonBoolean(node.left) && ssrProvablyNonNullNonBoolean(node.right)
    }
    if (node.type === 'ConditionalExpression') {
      return (
        ssrProvablyNonNullNonBoolean(node.consequent) &&
        ssrProvablyNonNullNonBoolean(node.alternate)
      )
    }
    return false
  }

  /** A URL char-code that `isUnsafeUrl`'s fast path proves SAFE (no leading ws,
   * not the start of `javascript:`/`data:`): printable ASCII 33–126, ≠ j/J/d/D. */
  function ssrUrlCharSafe(c: number): boolean {
    return c > 32 && c < 127 && (c | 32) !== 106 && (c | 32) !== 100
  }

  /** The URL value provably starts with a safe char (so `isUnsafeUrl` is always
   * false → the guard branch of `renderProp`/`_ssrAttrUrl` is dead). */
  function ssrProvablySafeUrl(node: N): boolean {
    node = unwrapTypeLayers(node)
    if (
      (node.type === 'StringLiteral' || node.type === 'Literal') &&
      typeof node.value === 'string'
    ) {
      const s = node.value as string
      return s.length > 0 && ssrUrlCharSafe(s.charCodeAt(0))
    }
    // Template literal: the first quasi's first char determines the start.
    if (node.type === 'TemplateLiteral') {
      const first = node.quasis?.[0]
      const raw = (first?.value?.cooked ?? first?.value?.raw ?? '') as string
      return raw.length > 0 && ssrUrlCharSafe(raw.charCodeAt(0))
    }
    // `left + right`: the start is `left`'s start.
    if (node.type === 'BinaryExpression' && node.operator === '+') {
      return ssrProvablySafeUrl(node.left)
    }
    if (node.type === 'ConditionalExpression') {
      return ssrProvablySafeUrl(node.consequent) && ssrProvablySafeUrl(node.alternate)
    }
    return false
  }

  /** Bake a proven-non-null(-safe-for-url) dynamic attr as ` name="` + `_esc(v)`
   * + `"` — byte-identical to renderProp with dead null/omit/guard branches.
   * Returns false when not provable (caller keeps the runtime `_ssrAttr*`). */
  function ssrTryBakeDynamicAttr(buf: SsrBuf, name: string, valueText: string, expr: N): boolean {
    const generic = ssrAttrIsGeneric(name)
    const url = !generic && SSR_URL_ATTRS.has(name)
    if (!generic && !url) return false // class/style/aria/camelCase → renderProp
    if (!ssrProvablyNonNullNonBoolean(expr)) return false
    if (url && !ssrProvablySafeUrl(expr)) return false
    ssrEmitStatic(buf, ` ${name}="`)
    emitEscHole(buf, valueText)
    ssrEmitStatic(buf, '"')
    return true
  }

  /** Emit a dynamic attribute — byte-identical to the h() element path.
   * Generic names take the lean `_ssrAttrGen(name, value)`; URL / class / style
   * / aria / camelCase names take `_ssrAttr(tag, name, value)` (renderProp). */
  function emitSsrAttr(buf: SsrBuf, tag: string, name: string, valueText: string): void {
    if (ssrAttrIsGeneric(name)) {
      ssrEmitHole(buf, `_ssrAttrGen(${JSON.stringify(name)}, ${valueText})`)
      needsSsrAttrGenImport = true
    } else if (SSR_URL_ATTRS.has(name)) {
      // Lowercase URL attr — lean url-guard helper (byte-identical to renderProp).
      ssrEmitHole(buf, `_ssrAttrUrl(${JSON.stringify(tag)}, ${JSON.stringify(name)}, ${valueText})`)
      needsSsrAttrUrlImport = true
    } else {
      ssrEmitHole(buf, `_ssrAttr(${JSON.stringify(tag)}, ${JSON.stringify(name)}, ${valueText})`)
      needsSsrAttrImport = true
    }
  }

  /**
   * Serialize one attribute. Provable-static, lowercase-safe values BAKE into
   * the open tag (fast); everything else — DYNAMIC values, object class/style,
   * camelCase/renamed names, URL-unsafe literals — emits `_ssrAttr(tag, name,
   * expr)`, which reuses `renderProp` VERBATIM and is therefore byte-identical.
   * Returns false to BAIL the whole element (spread, innerHTML content, or a
   * raw JSX-string value carrying `&` — an oxc↔esbuild entity-decode divergence
   * the compiler can't reproduce).
   */
  function ssrSerializeAttr(buf: SsrBuf, attr: N, tag: string): boolean {
    if (attr.type === 'JSXSpreadAttribute') return false // spread → bail
    if (attr.type !== 'JSXAttribute') return false
    const name = attr.name?.type === 'JSXIdentifier' ? attr.name.name : ''
    if (!name) return false
    // renderPropSkipped: key/ref/on* render NOTHING server-side — safe to omit.
    if (name === 'key' || name === 'ref') return true
    if (EVENT_RE.test(name)) return true
    // innerHTML / dangerouslySetInnerHTML are INNER CONTENT, not attrs → bail.
    if (name === 'innerHTML' || name === 'dangerouslySetInnerHTML') return false
    const isAria = name.charCodeAt(0) === 97 /* a */ && name.startsWith('aria-')
    // `toAttrName` maps camelCase/SVG/renamed names via a runtime table we don't
    // replicate at BAKE time — so an uppercase-named attr can only go through
    // `_ssrAttr` (renderProp does the mapping), never a compile-time bake.
    const hasUpper = /[A-Z]/.test(name)

    // No value: `<x disabled>` → props.x = true.
    if (!attr.value) {
      if (hasUpper) {
        emitSsrAttr(buf, tag, name, 'true')
        return true
      }
      ssrEmitStatic(buf, isAria ? ` ${name}="true"` : ` ${name}`)
      return true
    }
    // Raw JSX string-literal value (`title="…"`). Entity-safety bail: oxc keeps
    // `&amp;` LITERAL here but the h() path (esbuild) may decode it — a raw JSX
    // string carrying `&` can't be reproduced from the compiler → bail. (A JS
    // string, `title={'a & b'}`, is unaffected — JS literals never HTML-decode.)
    if (
      attr.value.type === 'StringLiteral' ||
      (attr.value.type === 'Literal' && typeof attr.value.value === 'string')
    ) {
      const v = attr.value.value as string
      if (v.includes('&')) return false
      // Bake the lowercase-safe case; URL-unsafe / uppercase → _ssrAttr (which
      // runs the SAME url-guard / name-map renderProp does).
      if (!hasUpper && ssrBakeStringAttr(buf, name, v)) return true
      emitSsrAttr(buf, tag, name, escapeJsString(v))
      return true
    }
    // Expression container.
    if (attr.value.type === 'JSXExpressionContainer') {
      const raw = attr.value.expression
      if (!raw || raw.type === 'JSXEmptyExpression') return false
      const expr = unwrapTypeLayers(raw)
      // false / null / undefined → omit (compile-time; renderProp would too).
      if (
        ((expr.type === 'BooleanLiteral' || expr.type === 'Literal') && expr.value === false) ||
        expr.type === 'NullLiteral' ||
        (expr.type === 'Literal' && expr.value === null) ||
        (expr.type === 'Identifier' && expr.name === 'undefined')
      ) {
        return true
      }
      // Provable static literals bake (lowercase-safe); else fall to _ssrAttr.
      if (!hasUpper) {
        if (
          (expr.type === 'StringLiteral' || expr.type === 'Literal') &&
          typeof expr.value === 'string'
        ) {
          if (ssrBakeStringAttr(buf, name, expr.value)) return true
        } else if (
          (expr.type === 'NumericLiteral' || expr.type === 'Literal') &&
          typeof expr.value === 'number'
        ) {
          if (name !== 'class' && name !== 'style' && !SSR_URL_ATTRS.has(name)) {
            ssrEmitStatic(buf, ` ${name}="${expr.value}"`)
            return true
          }
        } else if ((expr.type === 'BooleanLiteral' || expr.type === 'Literal') && expr.value === true) {
          ssrEmitStatic(buf, isAria ? ` ${name}="true"` : ` ${name}`)
          return true
        }
      }
      // DYNAMIC value. A syntactically-proven non-null-non-boolean (and, for a
      // url attr, proven-safe) value BAKES ` name="` + `_esc(v)` + `"` — Solid-
      // style template baking, byte-identical because renderProp's null-omit /
      // boolean / url-guard branches are provably dead. Otherwise the runtime
      // `_ssrAttr*` (renderProp verbatim → null-omit safety) is kept.
      const valueText = sliceExpr(expr)
      if (ssrTryBakeDynamicAttr(buf, name, valueText, expr)) return true
      emitSsrAttr(buf, tag, name, valueText)
      return true
    }
    return false
  }

  /** Bake a static string-valued attribute, mirroring `renderPropValue`. */
  function ssrBakeStringAttr(buf: SsrBuf, name: string, value: string): boolean {
    if (name === 'class') {
      // cx(string) === string; empty → renderPropValue returns null (omit).
      if (value === '') return true
      ssrEmitStatic(buf, ` class="${escapeHtmlSsr(value)}"`)
      return true
    }
    if (name === 'style') {
      // normalizeStyle(string) === string; empty → omit.
      if (value === '') return true
      ssrEmitStatic(buf, ` style="${escapeHtmlSsr(value)}"`)
      return true
    }
    if (SSR_URL_ATTRS.has(name)) {
      // Unsafe (`javascript:`/`data:`) → renderProp drops it (or keeps it only
      // for safe image data URIs) — too subtle to bake; bail to h().
      if (SSR_UNSAFE_URL_RE.test(value)) return false
      ssrEmitStatic(buf, ` ${name}="${escapeHtmlSsr(value)}"`)
      return true
    }
    ssrEmitStatic(buf, ` ${name}="${escapeHtmlSsr(value)}"`)
    return true
  }

  /**
   * `.map(item => <eligibleEl>)` fast path (recursed mode only). Bakes the
   * accessor markers the h() wrap adds and emits
   * `_ssrChildren(recv.map(param => <item _ssr>))`. Returns false to fall back
   * to the general wrapped-hole delegation (still byte-identical, just not
   * item-fast).
   */
  function ssrTryMap(buf: SsrBuf, expr: N): boolean {
    if (expr.type !== 'CallExpression') return false
    const callee = expr.callee
    if (!callee || callee.type !== 'MemberExpression' || callee.computed) return false
    if (callee.property?.type !== 'Identifier' || callee.property.name !== 'map') return false
    const args = expr.arguments ?? []
    if (args.length !== 1) return false
    const cb = args[0]
    if (!cb || cb.type !== 'ArrowFunctionExpression') return false
    if (cb.body?.type === 'BlockStatement') return false // only concise arrows
    const body = unwrapTypeLayers(cb.body)
    if (body.type !== 'JSXElement') return false
    if (isSelfClosing(body)) return false
    const itemCall = buildSsrCall(body, 'mapitem')
    if (itemCall === null) return false
    const recv = sliceExpr(callee.object)
    const params = cb.params ?? []
    const paramText =
      params.length === 0
        ? ''
        : code.slice(params[0]!.start as number, params[params.length - 1]!.end as number)
    ssrEmitStatic(buf, '<!--$-->')
    ssrEmitHole(buf, `_ssrChildren(${recv}.map((${paramText}) => ${itemCall}))`)
    ssrEmitStatic(buf, '<!--/$-->')
    needsSsrChildrenImport = true
    return true
  }

  /** Emit a text/expression child as `_esc(expr)` — byte-identical to
   * `renderNode(value)` (primitive → escaped, VNode → mounted). */
  function emitEscHole(buf: SsrBuf, exprText: string): void {
    ssrEmitHole(buf, `_esc(${exprText})`)
    needsEscImport = true
  }

  /** Serialize one expression child. Returns false to bail the element. */
  function ssrSerializeExprChild(buf: SsrBuf, child: N, mode: SsrMode): boolean {
    const raw = child.expression
    if (!raw || raw.type === 'JSXEmptyExpression') return true // {} / {/* */} → nothing
    const expr = unwrapTypeLayers(raw)
    // mapitem mode: every expression child is a PLAIN VALUE child (the compiler
    // never recursed into the map callback) → `_esc(expr)`, no markers.
    if (mode === 'mapitem') {
      emitEscHole(buf, sliceExpr(expr))
      return true
    }
    // recursed mode: matches handleJsxExpression's wrap decision.
    if (ssrTryMap(buf, expr)) return true
    if (shouldWrap(expr)) {
      // The h() path wraps a dynamic child in `() => expr` → renderNode adds
      // `<!--$-->…<!--/$-->` markers. Bake the markers into the statics + emit
      // `_esc(expr)`: byte-identical, since renderNode(() => v) === `<!--$-->` +
      // renderNode(v) + `<!--/$-->` and `_esc(v)` === renderNode(v).
      ssrEmitStatic(buf, '<!--$-->')
      emitEscHole(buf, sliceExpr(expr))
      ssrEmitStatic(buf, '<!--/$-->')
    } else {
      emitEscHole(buf, sliceExpr(expr))
    }
    return true
  }

  /** Serialize one child (text / element / expression). Returns false to bail. */
  function ssrSerializeChild(buf: SsrBuf, child: N, mode: SsrMode): boolean {
    if (child.type === 'JSXText') {
      const cleaned = cleanJsxText(child.value ?? child.raw ?? '')
      // Entity-safety bail: oxc keeps HTML entities (`&amp;`) LITERAL in
      // JSXText, but the h() path's JSX runtime (esbuild) may DECODE them — so
      // any `&` in baked text risks diverging from the current SSR bytes. Bail
      // to h() (which owns the decode). `<`/`>` can't occur in JSXText (parse
      // error); a JS-string child (`{'a & b'}`) is a hole, unaffected.
      if (cleaned.includes('&')) return false
      if (cleaned) ssrEmitStatic(buf, escapeHtmlSsr(cleaned))
      return true
    }
    if (child.type === 'JSXElement') return ssrSerializeElement(buf, child, mode)
    if (child.type === 'JSXExpressionContainer') return ssrSerializeExprChild(buf, child, mode)
    // JSXFragment / JSXSpreadChild → bail.
    return false
  }

  /** Serialize an element (open tag + attrs + children + close). False = bail. */
  function ssrSerializeElement(buf: SsrBuf, el: N, mode: SsrMode): boolean {
    const tag = jsxTagName(el)
    if (!tag || !isLowerCase(tag)) return false // component / empty → bail
    if (isSelfClosing(el)) return false // self-closing → bail (rare; go to h())
    if (SSR_VOID_TAGS.has(tag)) return false // void tag w/ content → bail
    if (tag === 'select' || tag === 'option') return false // PZ-09 complexity → bail
    // Duplicate plain attrs (JSX last-wins) — baking both is parser-first-wins.
    // Rare; bail to let the h() path dedupe.
    const seen = new Set<string>()
    for (const a of jsxAttrs(el)) {
      if (a.type === 'JSXAttribute' && a.name?.type === 'JSXIdentifier') {
        if (seen.has(a.name.name as string)) return false
        seen.add(a.name.name as string)
      }
    }
    ssrEmitStatic(buf, `<${tag}`)
    for (const attr of jsxAttrs(el)) {
      if (!ssrSerializeAttr(buf, attr, tag)) return false
    }
    ssrEmitStatic(buf, '>')
    for (const child of jsxChildren(el)) {
      if (!ssrSerializeChild(buf, child, mode)) return false
    }
    ssrEmitStatic(buf, `</${tag}>`)
    return true
  }

  /** Build the `_ssr([...statics], ...holes)` call text, or null to bail. A
   * `.map` ITEM (mapitem mode) uses `_ssrItem` — a plain-string variant that
   * `_ssrChildren` concatenates without a per-item `RawHtml` wrap. */
  function buildSsrCall(el: N, mode: SsrMode): string | null {
    const buf: SsrBuf = { statics: [''], holes: [] }
    if (!ssrSerializeElement(buf, el, mode)) return null
    const staticsArr = buf.statics.map((s) => JSON.stringify(s)).join(', ')
    const holesArr = buf.holes.length > 0 ? `, ${buf.holes.join(', ')}` : ''
    const fn = mode === 'mapitem' ? '_ssrItem' : '_ssr'
    if (mode === 'mapitem') needsSsrItemImport = true
    return `${fn}([${staticsArr}]${holesArr})`
  }

  function trySsrTemplateEmit(node: N): boolean {
    if (isSelfClosing(node)) return false
    const call = buildSsrCall(node, 'recursed')
    if (call === null) return false
    const start = node.start as number
    const end = node.end as number
    const parent = findParent(node)
    const needsBraces = parent && (parent.type === 'JSXElement' || parent.type === 'JSXFragment')
    replacements.push({ start, end, text: needsBraces ? `{${call}}` : call })
    needsSsrImport = true
    return true
  }

  function checkForWarnings(node: N): void {
    const tagName = jsxTagName(node)
    if (tagName !== 'For') return
    const hasBy = jsxAttrs(node).some(
      (p: N) =>
        p.type === 'JSXAttribute' && p.name?.type === 'JSXIdentifier' && p.name.name === 'by',
    )
    if (!hasBy) {
      warn(
        node.openingElement?.name ?? node,
        `<For> without a "by" prop will use index-based diffing, which is slower and may cause bugs with stateful children. Add by={(item) => item.id} for efficient keyed reconciliation.`,
        'missing-key-on-for',
      )
    }
  }

  /**
   * Wrap component-JSX spread arguments with `_wrapSpread(...)` so
   * getter-shaped reactive props survive esbuild's JS-level spread emit.
   *
   * esbuild compiles `<Comp {...source}>` to `jsx(Comp, { ...source })`.
   * The JS spread fires every getter on `source` and stores the resolved
   * values — collapsing compiler-emitted reactive props (`_rp` thunks
   * later converted to getters by `makeReactiveProps`) to static values
   * before the receiving component sees them.
   *
   * `_wrapSpread` replaces getter descriptors with `_rp`-branded thunks,
   * so the JS-level spread carries function values instead. The runtime
   * `makeReactiveProps` step converts them back to getters on the
   * component's props object — preserving the live signal subscription.
   *
   * Lowercase tags (DOM elements) go through the template path's
   * `_applyProps` which already handles spread reactively — no need to
   * wrap there.
   */
  function handleJsxSpreadAttribute(attr: N, parentElement: N): void {
    const tagName = jsxTagName(parentElement)
    const isComponent = tagName.length > 0 && tagName.charAt(0) !== tagName.charAt(0).toLowerCase()
    if (!isComponent) return
    const arg = attr.argument
    if (!arg) return
    // Skip already-wrapped sources (idempotent compilation guard).
    if (
      arg.type === 'CallExpression' &&
      arg.callee?.type === 'Identifier' &&
      arg.callee.name === '_wrapSpread'
    )
      return
    const start = arg.start as number
    const end = arg.end as number
    const sliced = sliceExpr(arg)
    replacements.push({ start, end, text: `_wrapSpread(${sliced})` })
    needsWrapSpreadImport = true
  }

  function handleJsxAttribute(node: N, parentElement: N): void {
    const name = node.name?.type === 'JSXIdentifier' ? node.name.name : ''
    if (SKIP_PROPS.has(name) || EVENT_RE.test(name)) return
    if (!node.value || node.value.type !== 'JSXExpressionContainer') return
    const expr = node.value.expression
    if (!expr || expr.type === 'JSXEmptyExpression') return

    const tagName = jsxTagName(parentElement)
    const isComponent = tagName.length > 0 && tagName.charAt(0) !== tagName.charAt(0).toLowerCase()

    if (isComponent) {
      const isSingleJsx = expr.type === 'JSXElement' || expr.type === 'JSXFragment'
      if (isSingleJsx) {
        walkNode(expr)
        return
      }
      const hoistName = maybeHoist(expr)
      if (hoistName) {
        replacements.push({ start: expr.start as number, end: expr.end as number, text: hoistName })
      } else if (shouldWrap(expr)) {
        const start = expr.start as number
        const end = expr.end as number
        const sliced = sliceExpr(expr)
        const inner = expr.type === 'ObjectExpression' ? `(${sliced})` : sliced
        replacements.push({ start, end, text: `_rp(() => ${inner})` })
        needsRpImport = true
        lens(
          start,
          end,
          'reactive-prop',
          'live prop — signal reads here are tracked into the component',
        )
      }
    } else {
      hoistOrWrap(expr)
    }
  }

  function handleJsxExpression(node: N, parentJsx?: N): void {
    const expr = node.expression
    if (!expr || expr.type === 'JSXEmptyExpression') return
    const hoistName = maybeHoist(expr)
    if (hoistName) {
      replacements.push({ start: expr.start as number, end: expr.end as number, text: hoistName })
      return
    }
    if (shouldWrap(expr)) {
      // Skip the accessor wrap for stable references passed as JSX children
      // of a COMPONENT parent (uppercase tag). The compiler's prop-inlining
      // pass replaces `{children}` with `() => h.children` for component
      // parents too (the kinetic Stagger + bokisch.com Intro reproducer);
      // most consumer libraries (rocketstyle/styler/ui-core/elements) route
      // children through `mountChild` which handles function children via
      // `mountReactive`, but libraries that iterate children at the VNode
      // level (kinetic's StaggerRenderer/TransitionItem) or `cloneVNode`
      // them directly are silently broken — the function spread produces
      // `{type: undefined}` and the DOM renders `<undefined>` tags.
      //
      // Narrow contract — only stable references are emitted bare:
      //   - Bare Identifier (`{children}` referencing a prop-derived const)
      //   - Simple MemberExpression chain (`{obj.x}`, `{obj.x.y}`)
      // These shapes evaluate the same way whether called once at JSX-
      // emit time or repeatedly in a `mountReactive` effect — no
      // reactivity is lost because the underlying value is just a
      // property read. Other dynamic shapes (CallExpression, BinaryExpression,
      // LogicalExpression, etc.) keep the wrap so `<Comp>{count()}</Comp>`
      // and similar patterns stay reactive end-to-end.
      //
      // Without this carve-out, library authors are forced to write
      // defensive `typeof children === 'function' ? children() : children`
      // unwraps everywhere they consume `props.children` structurally.
      if (
        parentJsx &&
        isComponentTag(jsxTagName(parentJsx)) &&
        isStableReference(expr) &&
        !referencesSignalVar(expr)
      ) {
        // Skip the carve-out for signal references — `<Comp>{count}</Comp>`
        // (bare signal identifier) is the user's deliberate "make this
        // reactive at the call site" pattern. Auto-call + wrap converts to
        // `() => count()` so the receiving component re-evaluates inside
        // its mountReactive/mountChild scope. Prop-derived stable refs
        // (the kinetic / bokisch fix shape) take the bare path.
        //
        // Slice the UNWRAPPED expression — TS type-only layers (`as T`,
        // `satisfies T`, `!`) are stripped because the receiving component
        // doesn't care about the static type and esbuild strips casts at
        // the next stage anyway. Also keeps cross-backend equivalence
        // with the Rust path (whose `accesses_props` doesn't recurse into
        // TSAsExpression).
        const start = expr.start as number
        const end = expr.end as number
        const unwrapped = unwrapTypeLayers(expr)
        const sliced = sliceExpr(unwrapped)
        replacements.push({ start, end, text: sliced })
        return
      }
      wrap(expr)
      return
    }
    walkNode(expr)
  }

  /** Component tag — uppercase first letter. Lowercase = DOM element. */
  function isComponentTag(tag: string): boolean {
    return tag.length > 0 && tag.charAt(0) !== tag.charAt(0).toLowerCase()
  }

  /**
   * Stable reference — an expression whose value is a bare property read.
   * Bare Identifier (`children`) or a non-computed MemberExpression chain
   * (`obj.x.y`) terminating in an Identifier or `this`. These are the
   * shapes that survive the no-wrap path without losing reactivity:
   * reading them once captures the same value as reading them N times,
   * because the underlying getter (if any) is the source of truth either
   * way. Excludes CallExpression / TaggedTemplateExpression / BinaryExpression
   * / LogicalExpression / ConditionalExpression / etc. — those keep the
   * wrap so consumers can re-evaluate inside reactive scopes.
   *
   * TS type-only layers (`as T` / `satisfies T` / non-null `!`) and
   * parentheses are transparent — they don't change runtime semantics
   * so we unwrap to look at the underlying expression. Reproducer:
   * `<Comp>{children as VNode[]}</Comp>` in `createKineticComponent.tsx`
   * — the TS cast wraps the Identifier as a `TSAsExpression`; without
   * unwrap the carve-out misses the very pattern it was written for.
   */
  function isStableReference(expr: N): boolean {
    const u = unwrapTypeLayers(expr)
    if (u.type === 'Identifier') return true
    if (u.type === 'MemberExpression') {
      let cur: N = u
      while (cur.type === 'MemberExpression') {
        if (cur.computed) return false
        if (cur.property?.type !== 'Identifier') return false
        cur = cur.object
      }
      return cur.type === 'Identifier' || cur.type === 'ThisExpression'
    }
    return false
  }

  /** Strip TS type-only layers + parens that don't affect runtime value. */
  function unwrapTypeLayers(expr: N): N {
    let cur: N = expr
    while (
      cur.type === 'TSAsExpression' ||
      cur.type === 'TSSatisfiesExpression' ||
      cur.type === 'TSNonNullExpression' ||
      cur.type === 'TSTypeAssertion' ||
      cur.type === 'ParenthesizedExpression'
    ) {
      cur = cur.expression
    }
    return cur
  }

  // ── Prop-derived variable tracking (collected during the single walk) ─────
  const propsNames = new Set<string>()
  const propDerivedVars = new Map<string, { start: number; end: number }>()
  // Round 9 fix: names of const/let bindings whose initializer is a JSX
  // element (`const x = <El/>`). A bare `{x}` child of such a binding must be
  // MOUNTED, not text-coerced — pre-fix it emitted `createTextNode(x)` which
  // stringifies the NativeItem to "[object Object]". Routing through
  // `_mountSlot` (the general child-insert `props.children` already uses) is
  // safe even if a same-named binding is later shadowed by a string/number:
  // `_mountSlot` renders those correctly too — the only cost of imprecision
  // is skipping the createTextNode fast path, never a correctness regression.
  const elementVars = new Set<string>()

  // PZ-02 fix: names of in-file function bindings that RETURN JSX — `const
  // cell = (v) => <b>{v}</b>`, `function cell(v) { return <b>{v}</b> }`. A
  // call child of such a binding under a DOM-element parent
  // (`<td>{cell(x)}</td>`, incl. the accessor form `{() => cell(x)}`) must be
  // MOUNTED via `_mountSlot`, not bound as reactive TEXT — pre-fix it emitted
  // `_bind(() => { __t0.data = cell(x) })`, which stringifies the returned
  // VNode to "[object Object]" (SSR mounted it correctly, so the shape was
  // ALSO a guaranteed SSR↔client mismatch). Scope-aware via `shadowedJsxFns`
  // (same discipline as the signal auto-call pass). CROSS-FILE callees are
  // out of scope — no type info at this seam — they keep the reactive-text
  // path (+ runtime dev diagnostics). Same imprecision trade-off as
  // `elementVars`: `_mountSlot` renders string/number returns correctly too,
  // so a helper that conditionally returns non-VNodes stays correct — the
  // only cost is skipping the reactive-text fast path.
  const jsxFnVars = new Set<string>()
  const shadowedJsxFns = new Set<string>()

  /** Check if an identifier name is an active (non-shadowed) JSX-returning fn. */
  function isActiveJsxFn(name: string): boolean {
    return jsxFnVars.has(name) && !shadowedJsxFns.has(name)
  }

  /**
   * Value shape that IS JSX after unwrapping value-transparent layers —
   * a direct element/fragment, or a conditional/logical whose branch is
   * (`cond ? <b/> : v`, `flag && <b/>`). Deliberately narrow (mirrored 1:1
   * in the Rust backend's `returns_jsx_value`) — anything else returns
   * false and the binding keeps its existing classification.
   */
  function returnsJsxValue(expr: N): boolean {
    const u = unwrapTypeLayers(expr)
    if (u.type === 'JSXElement' || u.type === 'JSXFragment') return true
    if (u.type === 'ConditionalExpression')
      return returnsJsxValue(u.consequent) || returnsJsxValue(u.alternate)
    if (u.type === 'LogicalExpression') return returnsJsxValue(u.left) || returnsJsxValue(u.right)
    return false
  }

  /**
   * Does this function VALUE return JSX on any path? Concise arrow body, or
   * any `return` statement in the block body (statement-recursive, does NOT
   * descend into nested functions — an inner closure's return is not this
   * function's return). Conservative: if ANY return path returns JSX, the
   * binding classifies as JSX-returning.
   */
  function fnReturnsJsx(fn: N): boolean {
    if (fn.type === 'ArrowFunctionExpression' && fn.body && fn.body.type !== 'BlockStatement') {
      return returnsJsxValue(fn.body)
    }
    const body = fn.body
    if (!body) return false
    let found = false
    function visitStmt(n: N): void {
      if (found) return
      if (
        n.type === 'FunctionDeclaration' ||
        n.type === 'FunctionExpression' ||
        n.type === 'ArrowFunctionExpression'
      )
        return
      if (n.type === 'ReturnStatement' && n.argument && returnsJsxValue(n.argument)) {
        found = true
        return
      }
      forEachChildFast(n, visitStmt)
    }
    visitStmt(body)
    return found
  }

  /** Is this declarator init (parens-unwrapped) a JSX-returning fn value? */
  function isJsxFnInit(init: N | undefined | null): boolean {
    let node = init
    while (node?.type === 'ParenthesizedExpression') node = node.expression
    if (!node) return false
    if (node.type !== 'ArrowFunctionExpression' && node.type !== 'FunctionExpression') return false
    return fnReturnsJsx(node)
  }

  /**
   * Is this init a JSX COLLECTION — an array literal with ≥1 JSX element
   * (`[<a/>, <b/>]`) or a `.map()` whose callback returns JSX
   * (`items.map(i => <li/>)`)? A bare `{x}` child of such a binding must be
   * MOUNTED (`_mountSlot` → `mountChild`, which renders arrays element-by-
   * element), not text-coerced — pre-fix the compiler baked
   * `textContent = arr` / `.data = arr`, stringifying a VNode[] to
   * "[object Object],[object Object]". Same imprecision trade-off as
   * `elementVars`/`jsxFnVars`: `mountChild` renders string/number elements
   * correctly too, so a mixed/primitive array stays correct — the only cost
   * is skipping the text fast path. Mirrored 1:1 in the Rust backend's
   * `is_jsx_collection_init`.
   */
  function isJsxCollectionInit(init: N | undefined | null): boolean {
    let node = init
    while (node?.type === 'ParenthesizedExpression') node = node.expression
    if (!node) return false
    if (node.type === 'ArrayExpression') {
      return (node.elements ?? []).some(
        (el: N | null) => el != null && el.type !== 'SpreadElement' && returnsJsxValue(el),
      )
    }
    if (node.type === 'CallExpression') {
      const callee = node.callee
      if (
        (callee?.type === 'MemberExpression' || callee?.type === 'StaticMemberExpression') &&
        callee.property?.type === 'Identifier' &&
        callee.property.name === 'map'
      ) {
        const args = node.arguments ?? []
        const fn = args[args.length - 1]
        if (fn && (fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression')) {
          return fnReturnsJsx(fn)
        }
      }
    }
    return false
  }

  /**
   * Find declarations/params in a function that shadow JSX-returning fn
   * names — the `findShadowingNames` discipline applied to `jsxFnVars`
   * (params + body-top-level variable declarations; a same-named re-decl
   * that is ITSELF a JSX-returning fn is not a shadow, mirroring the
   * `isSignalCall` carve-out).
   */
  function findShadowingJsxFnNames(node: N): string[] {
    const shadows: string[] = []
    for (const param of node.params ?? []) {
      if (param.type === 'Identifier' && jsxFnVars.has(param.name)) {
        shadows.push(param.name)
      }
      if (param.type === 'ObjectPattern') {
        for (const prop of param.properties ?? []) {
          const val = prop.value ?? prop.key
          if (val?.type === 'Identifier' && jsxFnVars.has(val.name)) {
            shadows.push(val.name)
          }
        }
      }
      if (param.type === 'ArrayPattern') {
        for (const el of param.elements ?? []) {
          if (el?.type === 'Identifier' && jsxFnVars.has(el.name)) {
            shadows.push(el.name)
          }
        }
      }
    }
    const body = node.body
    const stmts = body?.body ?? body?.statements
    if (!Array.isArray(stmts)) return shadows
    for (const stmt of stmts) {
      if (stmt.type === 'VariableDeclaration') {
        for (const decl of stmt.declarations ?? []) {
          if (decl.id?.type === 'Identifier' && jsxFnVars.has(decl.id.name)) {
            if (!isJsxFnInit(decl.init)) shadows.push(decl.id.name)
          }
        }
      }
    }
    return shadows
  }

  /**
   * PZ-02: is this (type-layer-unwrapped) child expression a call to an
   * in-file JSX-returning helper? Accepts the bare call (`{cell(x)}`) and
   * the concise-arrow accessor form (`{() => cell(x)}`, body type-layer
   * transparent). Member calls (`utils.cell(x)`) and block-body arrows bail
   * — they keep their existing classification.
   */
  function isJsxHelperCall(node: N): boolean {
    let inner = node
    if (inner.type === 'ArrowFunctionExpression' && inner.body?.type !== 'BlockStatement') {
      inner = unwrapTypeLayers(inner.body)
    }
    if (inner.type !== 'CallExpression') return false
    const callee = inner.callee
    return callee?.type === 'Identifier' && isActiveJsxFn(callee.name)
  }

  // ── Signal variable tracking (for auto-call in JSX) ──────────────────────
  // Tracks `const x = signal(...)` declarations. In JSX expressions, bare
  // references to these identifiers are auto-called: `{x}` → `{x()}`.
  // This makes signals look like plain JS variables in templates while
  // maintaining fine-grained reactivity.
  const signalVars = new Set<string>(options.knownSignals)

  // ── createSelector tracking (parallel to signalVars) ──────────────────────
  // Identifiers initialized from `createSelector(...)` are tracked so the
  // compiler can auto-promote the `<For>` + selector className pattern from
  // a per-row `renderEffect` (via `_bind`) into the effect-free
  // `selector.subscribe(key, m => ...)` fast path.
  //
  // Example shape we promote:
  //   _bind(() => __el.className = isSelected(row.id) ? 'a' : 'b')
  //   → isSelected.subscribe(row.id, (m) => { __el.className = m ? 'a' : 'b' })
  //
  // Per-row alloc drops from ~5 (full renderEffect) to ~2 (Set.add + dispose
  // closure). Measured benchmark: -0.8ms on create-1k, -5ms on create-10k.
  //
  // See `tryDirectSelectorTernary` for the precise detection shape.
  const selectorVars = new Set<string>()
  const shadowedSelectors = new Set<string>()

  // ── Scope-aware signal shadowing ──────────────────────────────────────────
  // When a function/block declares a variable with the same name as a signal
  // (e.g. `const show = 'text'` shadowing module-scope `const show = signal(false)`),
  // that name is NOT a signal within that scope. The shadowedSignals set tracks
  // names that are currently shadowed by a closer non-signal declaration.
  const shadowedSignals = new Set<string>()

  /** Check if an identifier name is an active (non-shadowed) signal variable. */
  function isActiveSignal(name: string): boolean {
    return signalVars.has(name) && !shadowedSignals.has(name)
  }

  /** Check if an identifier name is an active (non-shadowed) selector variable. */
  function isActiveSelector(name: string): boolean {
    return selectorVars.has(name) && !shadowedSelectors.has(name)
  }

  /** Find variable declarations and parameters in a function that shadow signal names. */
  function findShadowingNames(node: N): string[] {
    const shadows: string[] = []
    // Check function parameters
    for (const param of node.params ?? []) {
      if (param.type === 'Identifier' && signalVars.has(param.name)) {
        shadows.push(param.name)
      }
      // Handle destructured parameters: ({ name }) => ...
      if (param.type === 'ObjectPattern') {
        for (const prop of param.properties ?? []) {
          const val = prop.value ?? prop.key
          if (val?.type === 'Identifier' && signalVars.has(val.name)) {
            shadows.push(val.name)
          }
        }
      }
      // Handle array destructured parameters: ([a, b]) => ...
      if (param.type === 'ArrayPattern') {
        for (const el of param.elements ?? []) {
          if (el?.type === 'Identifier' && signalVars.has(el.name)) {
            shadows.push(el.name)
          }
        }
      }
    }
    // Check top-level variable declarations in the function body
    const body = node.body
    const stmts = body?.body ?? body?.statements
    if (!Array.isArray(stmts)) return shadows
    for (const stmt of stmts) {
      if (stmt.type === 'VariableDeclaration') {
        for (const decl of stmt.declarations ?? []) {
          if (decl.id?.type === 'Identifier' && signalVars.has(decl.id.name)) {
            // Only shadow if it's NOT a signal() call
            if (!decl.init || !isSignalCall(decl.init)) {
              shadows.push(decl.id.name)
            }
          }
        }
      }
    }
    return shadows
  }

  function readsFromProps(node: N): boolean {
    if (node.type === 'MemberExpression' && node.object?.type === 'Identifier') {
      if (propsNames.has(node.object.name)) return true
    }
    let found = false
    forEachChildFast(node, (child) => {
      if (found) return
      if (readsFromProps(child)) found = true
    })
    return found
  }

  /** Check if an expression references any prop-derived variable. */
  function referencesPropDerived(node: N): boolean {
    if (node.type === 'Identifier' && propDerivedVars.has(node.name)) {
      const p = findParent(node)
      if (p && p.type === 'MemberExpression' && p.property === node && !p.computed) return false
      return true
    }
    let found = false
    forEachChildFast(node, (child) => {
      if (found) return
      if (referencesPropDerived(child)) found = true
    })
    return found
  }

  /** Collect prop-derived variable info from a VariableDeclaration node.
   *  Called inline during the single-pass walk when we encounter a declaration. */
  function collectPropDerivedFromDecl(node: N, callbackDepth: number): void {
    if (node.type !== 'VariableDeclaration') return
    for (const decl of node.declarations ?? []) {
      // splitProps: const [own, rest] = splitProps(props, [...])
      if (decl.id?.type === 'ArrayPattern' && decl.init?.type === 'CallExpression') {
        const callee = decl.init.callee
        if (callee?.type === 'Identifier' && callee.name === 'splitProps') {
          for (const el of decl.id.elements ?? []) {
            if (el?.type === 'Identifier') propsNames.add(el.name)
          }
        }
      }
      // Round 9: track element-valued bindings (`const`/`let`, any depth) so
      // a bare `{x}` child routes to _mountSlot instead of createTextNode.
      // Tight: only a DIRECT JSX element/fragment initializer (optionally
      // parenthesized) — conditionals/calls go the existing reactive/text
      // paths and must not be reclassified here.
      if (
        (node.kind === 'const' || node.kind === 'let') &&
        decl.id?.type === 'Identifier' &&
        decl.init
      ) {
        let initNode = decl.init
        while (initNode?.type === 'ParenthesizedExpression') initNode = initNode.expression
        if (initNode?.type === 'JSXElement' || initNode?.type === 'JSXFragment') {
          elementVars.add(decl.id.name)
        } else if (isJsxCollectionInit(initNode)) {
          // Array-of-JSX or map-of-JSX const — mount it (renders arrays)
          // instead of text-coercing the VNode[] to "[object Object]".
          elementVars.add(decl.id.name)
        }
      }
      // PZ-02: track JSX-returning function bindings (const-only — a `let`
      // can be reassigned to a non-JSX fn). See `jsxFnVars`.
      if (node.kind === 'const' && decl.id?.type === 'Identifier' && isJsxFnInit(decl.init)) {
        jsxFnVars.add(decl.id.name)
      }
      if (node.kind !== 'const') continue
      if (callbackDepth > 0) continue
      if (decl.id?.type === 'Identifier' && decl.init) {
        if (isStatefulCall(decl.init)) {
          // Track signal() declarations for auto-call in JSX
          if (isSignalCall(decl.init)) signalVars.add(decl.id.name)
          // Track createSelector() declarations for .subscribe auto-promotion
          // in className/attr bindings (see tryDirectSelectorTernary).
          if (isSelectorCall(decl.init)) selectorVars.add(decl.id.name)
          continue
        }
        // Direct prop read OR transitive (references another prop-derived var)
        if (readsFromProps(decl.init) || referencesPropDerived(decl.init)) {
          propDerivedVars.set(decl.id.name, {
            start: decl.init.start as number,
            end: decl.init.end as number,
          })
        }
      }
    }
  }

  /** Detect component functions and register their first param as a props name.
   *  Called inline during the walk when entering a function. */
  function maybeRegisterComponentProps(node: N): void {
    if (
      (node.type === 'FunctionDeclaration' ||
        node.type === 'ArrowFunctionExpression' ||
        node.type === 'FunctionExpression') &&
      (node.params?.length ?? 0) > 0
    ) {
      const parent = findParent(node)
      // Skip callback functions (arguments to calls like .map, .filter)
      if (parent && parent.type === 'CallExpression' && (parent.arguments ?? []).includes(node))
        return
      // Skip JSX-child render callbacks (`<For>{(row) => <tr>…}</For>`,
      // `<Show>{() => …}</Show>`, `<Index>`, `<Switch>`). The parameter is a
      // runtime ITEM the framework passes in — NOT reactive component props.
      // Registering it as props makes bare property reads (`row.id`) look
      // reactive, so `{String(row.id)}` gets a wasteful per-row `_bind()`
      // renderEffect instead of a static `textContent` assignment. Signal
      // reads (`row.label()`, `() => row.x`) stay reactive via their own
      // paths. Attribute-value render functions (`component={(p) => …}`) are
      // NOT skipped — those can be real inline components receiving props.
      if (parent && parent.type === 'JSXExpressionContainer') {
        const grandparent = findParent(parent)
        if (grandparent && (grandparent.type === 'JSXElement' || grandparent.type === 'JSXFragment'))
          return
      }
      const firstParam = node.params[0]
      if (firstParam?.type === 'Identifier') {
        let hasJSX = false
        function checkJSX(n: N): void {
          if (hasJSX) return
          if (n.type === 'JSXElement' || n.type === 'JSXFragment') {
            hasJSX = true
            return
          }
          forEachChildFast(n, checkJSX)
        }
        forEachChildFast(node, checkJSX)
        if (hasJSX) propsNames.add(firstParam.name)
      }
    }
  }

  // ── String-based transitive resolution ─────────────────────────────────────
  const resolvedCache = new Map<string, string>()
  const resolving = new Set<string>()
  const warnedCycles = new Set<string>()

  function resolveVarToString(varName: string, sourceNode?: N): string {
    if (resolvedCache.has(varName)) return resolvedCache.get(varName)!
    if (resolving.has(varName)) {
      const cycleKey = [...resolving, varName].sort().join(',')
      if (!warnedCycles.has(cycleKey)) {
        warnedCycles.add(cycleKey)
        const chain = [...resolving, varName].join(' → ')
        warn(
          sourceNode ?? program,
          `[Pyreon] Circular prop-derived const reference: ${chain}. ` +
            `The cyclic identifier \`${varName}\` will use its captured value ` +
            `instead of being reactively inlined. Break the cycle by reading ` +
            `from \`props.*\` directly or restructuring the derivation chain.`,
          'circular-prop-derived',
        )
      }
      return varName
    }
    resolving.add(varName)
    const span = propDerivedVars.get(varName)!
    const rawText = code.slice(span.start, span.end)
    const resolved = resolveIdentifiersInText(rawText, span.start, sourceNode)
    resolving.delete(varName)
    resolvedCache.set(varName, resolved)
    return resolved
  }

  function resolveIdentifiersInText(text: string, baseOffset: number, sourceNode?: N): string {
    const endOffset = baseOffset + text.length
    const idents: {
      start: number
      end: number
      name: string
      shorthand?: boolean
    }[] = []

    // ── Scope-aware shadow tracking ──────────────────────────────────────────
    // Prop-derived consts are only ever COLLECTED at component top level
    // (callbackDepth === 0), so ANY same-named binding in a deeper lexical
    // scope necessarily shadows it. Substituting a shadowed reference (or a
    // binding occurrence) miscompiles idiomatic code — e.g.
    // `const a = props.x; items.map(a => <li>{a}</li>)` would rewrite the
    // arrow PARAMETER `a` into `(props.x)` (invalid `(props.x) =>`) and the
    // body `{a}` (the map item) into `props.x`. The signal-auto-call pass is
    // already scope-aware via `shadowedSignals`; this mirrors that discipline
    // for the prop-derived inlining pass.
    const shadowed = new Set<string>()

    /** Collect identifier names bound by a pattern (params / declarators). */
    function patternBindingNames(p: N, out: string[]): void {
      if (!p) return
      switch (p.type) {
        case 'Identifier':
          out.push(p.name)
          break
        case 'ObjectPattern':
          for (const pr of p.properties ?? []) {
            if (pr.type === 'RestElement') patternBindingNames(pr.argument, out)
            else patternBindingNames(pr.value ?? pr.key, out)
          }
          break
        case 'ArrayPattern':
          for (const el of p.elements ?? []) patternBindingNames(el, out)
          break
        case 'AssignmentPattern':
          patternBindingNames(p.left, out)
          break
        case 'RestElement':
          patternBindingNames(p.argument, out)
          break
      }
    }

    /**
     * Prop-derived names bound by `node` FOR ITS OWN SUBTREE (block-accurate
     * lexical scoping). Excludes the prop-derived const's own defining
     * declaration (matched by init span) so the binding we inline FROM is
     * never mistaken for a shadow of itself.
     */
    function scopeBoundPropDerived(node: N): string[] {
      const out: string[] = []
      const t = node.type
      const declNames = (declNode: N): void => {
        for (const d of declNode.declarations ?? []) {
          // The prop-derived defining declaration is NOT a shadow.
          if (d.id?.type === 'Identifier' && propDerivedVars.has(d.id.name)) {
            const span = propDerivedVars.get(d.id.name)!
            if (d.init && (d.init.start as number) === span.start) continue
          }
          patternBindingNames(d.id, out)
        }
      }
      if (
        t === 'ArrowFunctionExpression' ||
        t === 'FunctionExpression' ||
        t === 'FunctionDeclaration'
      ) {
        for (const p of node.params ?? []) patternBindingNames(p, out)
      } else if (t === 'CatchClause') {
        patternBindingNames(node.param, out)
      } else if (t === 'ForStatement') {
        if (node.init?.type === 'VariableDeclaration') declNames(node.init)
      } else if (t === 'ForInStatement' || t === 'ForOfStatement') {
        if (node.left?.type === 'VariableDeclaration') declNames(node.left)
      } else if (t === 'BlockStatement' || t === 'Program' || t === 'StaticBlock') {
        const stmts = node.body ?? node.statements
        if (Array.isArray(stmts)) {
          for (const s of stmts) {
            if (s.type === 'VariableDeclaration') declNames(s)
            else if (s.type === 'FunctionDeclaration' && s.id?.type === 'Identifier')
              out.push(s.id.name)
            else if (s.type === 'ClassDeclaration' && s.id?.type === 'Identifier')
              out.push(s.id.name)
          }
        }
      }
      return out.filter((n) => propDerivedVars.has(n))
    }

    // Walk the AST to find identifiers in the span, passing parent context
    // to skip non-reference positions (property names, declarations, etc.)
    // and a lexical shadow set so a same-named inner binding is never inlined.
    function findIdents(node: N, parent: N | null): void {
      const nodeStart = node.start as number
      const nodeEnd = node.end as number
      if (nodeStart >= endOffset || nodeEnd <= baseOffset) return
      if (
        node.type === 'Identifier' &&
        propDerivedVars.has(node.name) &&
        !shadowed.has(node.name)
      ) {
        if (parent) {
          if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) {
            /* skip */
          } else if (parent.type === 'VariableDeclarator' && parent.id === node) {
            /* skip */
          } else if (parent.type === 'Property' && parent.key === node && !parent.computed) {
            /* skip */
          } else if (parent.type === 'Property' && parent.shorthand) {
            // Shorthand object property `{ color }` whose value is a
            // prop-derived const. The identifier is BOTH key and value, so a
            // bare substitution would emit a keyless `{ (pick(props.v)) }`
            // (a syntax error). Collect it with a shorthand marker so the
            // substitution below expands it to `{ color: (pick(props.v)) }` —
            // byte-identical to the explicit `{ color: color }` form, and
            // reactive (the inlined value reads props inside the accessor).
            if (nodeStart >= baseOffset && nodeEnd <= endOffset) {
              idents.push({
                start: nodeStart,
                end: nodeEnd,
                name: node.name,
                shorthand: true,
              })
            }
          } else if (nodeStart >= baseOffset && nodeEnd <= endOffset) {
            idents.push({ start: nodeStart, end: nodeEnd, name: node.name })
          }
        } else if (nodeStart >= baseOffset && nodeEnd <= endOffset) {
          idents.push({ start: nodeStart, end: nodeEnd, name: node.name })
        }
      }
      // Names this node binds for its subtree shadow the top-level prop-derived
      // const within that subtree (and the binding occurrence itself).
      const introduced = scopeBoundPropDerived(node).filter((n) => !shadowed.has(n))
      for (const n of introduced) shadowed.add(n)
      forEachChildFast(node, (child) => findIdents(child, node))
      for (const n of introduced) shadowed.delete(n)
    }
    findIdents(program, null)

    if (idents.length === 0) return text

    idents.sort((a, b) => a.start - b.start)
    const parts: string[] = []
    let lastPos = baseOffset
    for (const id of idents) {
      parts.push(code.slice(lastPos, id.start))
      const resolved = resolveVarToString(id.name, sourceNode)
      // A shorthand-property ident expands to `name: (value)`; a normal
      // reference just substitutes `(value)` in place.
      parts.push(id.shorthand ? `${id.name}: (${resolved})` : `(${resolved})`)
      lastPos = id.end
    }
    parts.push(code.slice(lastPos, endOffset))
    return parts.join('')
  }

  // ── Analysis helpers with memoization (Phase 3) ────────────────────────────
  // Cache results keyed by node.start (unique per node in a file).
  // Eliminates redundant subtree traversals for containsCall + accessesProps.
  const _isDynamicCache = new Map<number, boolean>()

  /** Fused isDynamic: checks both containsCall and accessesProps in one traversal. */
  function isDynamic(node: N): boolean {
    const key = node.start as number
    const cached = _isDynamicCache.get(key)
    if (cached !== undefined) return cached
    const result = _isDynamicImpl(node)
    _isDynamicCache.set(key, result)
    return result
  }

  function _isDynamicImpl(node: N): boolean {
    // Call expression (non-pure)
    if (node.type === 'CallExpression') {
      if (isPureStaticCall(node)) {
        // Pure static (all args are literals) — entire call is static, no recurse needed.
      } else if (isPureCoercionCall(node)) {
        // Pure coercion (String/Number/Boolean as global) — the FUNCTION is
        // referentially transparent. Whether the CALL is dynamic depends on
        // its arguments. Fall through to the recurse-into-children logic:
        //   String(row.id)        → arg is a captured ref → not dynamic
        //   String(count())       → arg contains a signal call → dynamic
        //   String(props.x)       → arg accesses props → dynamic
        // No early `return true` here.
      } else {
        return true
      }
    }
    if (node.type === 'TaggedTemplateExpression') return true
    // Props access
    if (node.type === 'MemberExpression' && !node.computed && node.object?.type === 'Identifier') {
      if (propsNames.has(node.object.name)) return true
    }
    // Prop-derived variable reference
    if (node.type === 'Identifier' && propDerivedVars.has(node.name)) {
      const parent = findParent(node)
      if (
        parent &&
        parent.type === 'MemberExpression' &&
        parent.property === node &&
        !parent.computed
      ) {
        // This is a property name position, not a reference — fall through
      } else {
        return true
      }
    }
    // Signal variable reference — treated as dynamic (will be auto-called)
    if (node.type === 'Identifier' && isActiveSignal(node.name)) {
      const parent = findParent(node)
      if (
        parent &&
        parent.type === 'MemberExpression' &&
        parent.property === node &&
        !parent.computed
      ) {
        // Property name position — not a reference
      } else if (parent && parent.type === 'CallExpression' && parent.callee === node) {
        // Already being called: signal() — don't double-flag
      } else {
        return true
      }
    }
    // Don't recurse into nested functions
    if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') return false
    // Recurse into children
    let found = false
    forEachChildFast(node, (child) => {
      if (found) return
      if (isDynamic(child)) found = true
    })
    return found
  }

  /** accessesProps — kept for sliceExpr's quick check (does this need resolution?) */
  function accessesProps(node: N): boolean {
    if (node.type === 'MemberExpression' && !node.computed && node.object?.type === 'Identifier') {
      if (propsNames.has(node.object.name)) return true
    }
    if (node.type === 'Identifier' && propDerivedVars.has(node.name)) {
      const parent = findParent(node)
      if (
        parent &&
        parent.type === 'MemberExpression' &&
        parent.property === node &&
        !parent.computed
      )
        return false
      return true
    }
    let found = false
    forEachChildFast(node, (child) => {
      if (found) return
      if (child.type === 'ArrowFunctionExpression' || child.type === 'FunctionExpression') return
      if (accessesProps(child)) found = true
    })
    return found
  }

  function shouldWrap(node: N): boolean {
    if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') return false
    if (isStatic(node)) return false
    if (node.type === 'CallExpression' && isPureStaticCall(node)) return false
    return isDynamic(node)
  }

  // ── Single unified walk (Phase 2) ─────────────────────────────────────────
  // Merges the old 3-pass architecture (scanForPropDerivedVars + transitive
  // resolution + JSX walk) into one top-down traversal. Works because `const`
  // declarations have a temporal dead zone — they're always before their use.
  let _callbackDepth = 0

  function walkNode(node: N): void {
    // ── Component function detection (was pass 1) ──
    const isFunction =
      node.type === 'FunctionDeclaration' ||
      node.type === 'ArrowFunctionExpression' ||
      node.type === 'FunctionExpression'
    let scopeShadows: string[] | null = null
    let scopeJsxFnShadows: string[] | null = null
    if (isFunction) {
      // Track callback nesting for prop-derived var exclusion
      const parent = findParent(node)
      const isCallbackArg =
        parent && parent.type === 'CallExpression' && (parent.arguments ?? []).includes(node)
      if (isCallbackArg) _callbackDepth++
      // Register component props (only for non-callback functions with JSX)
      maybeRegisterComponentProps(node)
      // PZ-02: a named function DECLARATION returning JSX is a JSX-returning
      // helper binding (registered at its statement position — a helper
      // hoisted-above-use, i.e. declared AFTER the JSX that calls it, is NOT
      // tracked; both backends agree on this source-order boundary).
      if (node.type === 'FunctionDeclaration' && node.id?.type === 'Identifier' && fnReturnsJsx(node)) {
        jsxFnVars.add(node.id.name)
      }
      // Track signal name shadowing for scope awareness
      if (signalVars.size > 0) {
        scopeShadows = findShadowingNames(node)
        for (const name of scopeShadows) shadowedSignals.add(name)
      }
      // PZ-02: parallel shadow tracking for JSX-returning fn names
      if (jsxFnVars.size > 0) {
        scopeJsxFnShadows = findShadowingJsxFnNames(node)
        for (const name of scopeJsxFnShadows) shadowedJsxFns.add(name)
      }
    }

    // ── Variable declaration collection (was pass 1 + 2) ──
    if (node.type === 'VariableDeclaration') {
      collectPropDerivedFromDecl(node, _callbackDepth)
    }

    // ── JSX processing (was pass 3) ──
    if (node.type === 'JSXElement') {
      if (tryRocketstyleCollapse(node)) {
        // Collapsed to _rsCollapse — children are baked into the SSR-
        // resolved template; do not recurse into the subtree.
        return
      }
      // Compile-to-string SSR fast path (opt-in via `options.ssrTemplate`).
      // Emits `_ssr(...)` for eligible static-skeleton subtrees; falls through
      // to the h() path on any non-eligible shape. JS backend only for now.
      if (ssrTemplate && !isSelfClosing(node) && trySsrTemplateEmit(node)) {
        return
      }
      if (!isSelfClosing(node) && tryTemplateEmit(node)) {
        // Template emitted — don't recurse into this subtree (JSXElement is never a function)
        return
      }
      checkForWarnings(node)
      for (const attr of jsxAttrs(node)) {
        if (attr.type === 'JSXAttribute') handleJsxAttribute(attr, node)
        else if (attr.type === 'JSXSpreadAttribute') handleJsxSpreadAttribute(attr, node)
      }
      for (const child of jsxChildren(node)) {
        if (child.type === 'JSXExpressionContainer') handleJsxExpression(child, node)
        else walkNode(child)
      }
      // Note: JSXElement is never a function, so no callback depth or scope cleanup needed here
      return
    }
    if (node.type === 'JSXExpressionContainer') {
      handleJsxExpression(node)
      // Note: JSXExpressionContainer is never a function, no scope cleanup needed
      return
    }

    // Generic descent
    forEachChildFast(node, walkNode)

    // Restore callback depth after leaving function
    if (isFunction) {
      const parent = findParent(node)
      if (parent && parent.type === 'CallExpression' && (parent.arguments ?? []).includes(node))
        _callbackDepth--
    }
    // Restore signal shadowing
    if (scopeShadows) for (const name of scopeShadows) shadowedSignals.delete(name)
    // Restore JSX-returning fn shadowing
    if (scopeJsxFnShadows) for (const name of scopeJsxFnShadows) shadowedJsxFns.delete(name)
  }

  walkNode(program)

  if (replacements.length === 0 && hoists.length === 0) {
    return collectLens ? { code, warnings, reactivityLens } : { code, warnings }
  }

  replacements.sort((a, b) => a.start - b.start)
  // R12 fix: apply the disjoint, sorted {start,end,text} edits through
  // MagicString instead of manual slice/join. `toString()` is byte-identical
  // to the old concatenation (the full 1200-test suite + native-equivalence
  // assert exact emitted strings), but `generateMap()` now yields a correct
  // V3 source map — the previous transform emitted none AND shifted line
  // counts (template emission expands one-line JSX into a multi-line _tpl
  // factory), so every stack frame / breakpoint in a Pyreon component
  // mislocated app-wide.
  const s = new MagicString(code)
  for (const r of replacements) {
    if (r.start === r.end) s.appendLeft(r.start, r.text)
    else s.update(r.start, r.end, r.text)
  }

  // Build the generated preamble (hoists + auto-imports + collapse prologue)
  // in the SAME final top-to-bottom order the previous chained `X + output`
  // produced, then `prepend` it ONCE. magic-string's prepend shifts every
  // source mapping down by the preamble's line count, so original positions
  // resolve to the correct OUTPUT lines despite the inserted preamble — the
  // exact line-shift R12 measured. Innermost (closest to code) first.
  let preamble = ''

  if (hoists.length > 0) {
    preamble = hoists.map((h) => `const ${h.name} = /*@__PURE__*/ ${h.text}\n`).join('') + preamble
  }

  if (needsTplImport) {
    const runtimeDomImports = ['_tpl']
    if (needsBindDirectImportGlobal) runtimeDomImports.push('_bindDirect')
    if (needsBindTextImportGlobal) runtimeDomImports.push('_bindText')
    if (needsApplyPropsImportGlobal) runtimeDomImports.push('_applyProps')
    if (needsMountSlotImportGlobal) runtimeDomImports.push('_mountSlot')
    if (needsBindPolyImportGlobal) runtimeDomImports.push('bindPolymorphicText')
    if (needsSetChildImportGlobal) runtimeDomImports.push('_setChild')
    if (needsSetChildAtImportGlobal) runtimeDomImports.push('_setChildAt')
    if (needsSetStyleImportGlobal) runtimeDomImports.push('_setStyle')
    if (needsSetClassImportGlobal) runtimeDomImports.push('_setClass')
    if (needsSetAttrImportGlobal) runtimeDomImports.push('_setAttr')
    const reactivityImports = needsBindImportGlobal
      ? `\nimport { _bind } from "@pyreon/reactivity";`
      : ''
    preamble =
      `import { ${runtimeDomImports.join(', ')} } from "@pyreon/runtime-dom";${reactivityImports}\n` +
      preamble
  }

  // Compile-to-string SSR fast path helpers (`options.ssrTemplate`). Mutually
  // exclusive with the `_tpl` DOM path (that only fires for `ssr: false`).
  if (needsSsrImport) {
    const ssrImports = ['_ssr']
    if (needsSsrChildrenImport) ssrImports.push('_ssrChildren')
    if (needsSsrItemImport) ssrImports.push('_ssrItem')
    if (needsEscImport) ssrImports.push('_esc')
    if (needsSsrAttrImport) ssrImports.push('_ssrAttr')
    if (needsSsrAttrGenImport) ssrImports.push('_ssrAttrGen')
    if (needsSsrAttrUrlImport) ssrImports.push('_ssrAttrUrl')
    preamble = `import { ${ssrImports.join(', ')} } from "@pyreon/runtime-server";\n` + preamble
  }

  if (needsRpImport || needsWrapSpreadImport || needsCxImportGlobal) {
    const coreImports: string[] = []
    // Alias to an internal name — `cx` is a PUBLIC export users import
    // directly (e.g. a hand-written component that also uses `class={…}`),
    // so injecting a bare `cx` import would collide ("already declared").
    if (needsCxImportGlobal) coreImports.push('cx as _cx')
    if (needsRpImport) coreImports.push('_rp')
    if (needsWrapSpreadImport) coreImports.push('_wrapSpread')
    preamble = `import { ${coreImports.join(', ')} } from "@pyreon/core";\n` + preamble
  }

  if (needsCollapse || needsCollapseDyn || needsCollapseDynH) {
    const cfg = options.collapseRocketstyle!
    const rd = cfg.runtimeDomSource ?? '@pyreon/runtime-dom'
    const st = cfg.stylerSource ?? '@pyreon/styler'
    // One idempotent injectRules per distinct rule bundle — keyed by the
    // resolver's FNV so a re-eval (HMR) or another module's identical
    // bundle is a no-op (styler dedupes by key). Runs at module-eval,
    // before any collapsed site mounts, so the sheet is populated
    // without a prior runtime mount of the real component.
    const inj = collapseRules
      .map((r) => `__rsSheet.injectRules(${JSON.stringify(r.rules)},${JSON.stringify(r.ruleKey)});`)
      .join('')
    // Only import the helpers actually emitted into this module — keeps
    // the bundle bytes per-feature and tree-shakable. needsCollapse
    // (full) gates `_rsCollapse`; the partial / dynamic flags gate
    // their respective helpers independently.
    const rdImports: string[] = []
    if (needsCollapse) rdImports.push('_rsCollapse as __rsCollapse')
    if (needsCollapseH) rdImports.push('_rsCollapseH as __rsCollapseH')
    if (needsCollapseDyn) rdImports.push('_rsCollapseDyn as __rsCollapseDyn')
    if (needsCollapseDynH) rdImports.push('_rsCollapseDynH as __rsCollapseDynH')
    preamble =
      `import { ${rdImports.join(', ')} } from "${rd}";\n` +
      `import { sheet as __rsSheet } from "${st}";\n` +
      `import { ${cfg.mode.name} as __pyrMode } from "${cfg.mode.source}";\n` +
      `${inj}\n` +
      preamble
  }

  if (preamble) s.prepend(preamble)

  const output = s.toString()
  const map = s.generateMap({
    source: filename,
    includeContent: true,
    hires: true,
  }) as unknown as GeneratedSourceMap

  return collectLens
    ? { code: output, usesTemplates: needsTplImport, warnings, map, reactivityLens }
    : { code: output, usesTemplates: needsTplImport, warnings, map }

  // ── Template emission helpers ─────────────────────────────────────────────

  function hasBailAttr(node: N, isRoot = false): boolean {
    for (const attr of jsxAttrs(node)) {
      if (attr.type === 'JSXSpreadAttribute') {
        if (isRoot) continue
        return true
      }
      if (
        attr.type === 'JSXAttribute' &&
        attr.name?.type === 'JSXIdentifier' &&
        attr.name.name === 'key'
      )
        return true
    }
    return false
  }

  function countChildForTemplate(child: N): number {
    if (child.type === 'JSXText') return 0
    if (child.type === 'JSXElement') return templateElementCount(child)
    if (child.type === 'JSXExpressionContainer') {
      const expr = child.expression
      if (!expr || expr.type === 'JSXEmptyExpression') return 0
      // A DIRECT static JSX element/fragment child (`{<span/>}`) keeps its
      // existing static-hoist path — bail so the parent isn't wrapped in a
      // `_mountSlot` around it (static hoisting is cheaper than a runtime
      // slot mount for a static child).
      if (expr.type === 'JSXElement' || expr.type === 'JSXFragment') return -1
      // An expression that CONTAINS JSX but isn't directly one (element-
      // conditional `{cond() ? <A/> : <B/>}`, `{n() && <List/>}`, or a
      // `.map(x => <li/>)` child) is templatable: it routes through
      // `_mountSlot` — the same path `.map`-returning children already take —
      // so the wrapper keeps the `_tpl` fast path instead of bailing to the
      // jsx runtime. (Previously this whole branch returned -1 → bail.)
      return 0
    }
    if (child.type === 'JSXFragment') return templateFragmentCount(child)
    return -1
  }

  function templateElementCount(node: N, isRoot = false): number {
    const tag = jsxTagName(node)
    if (!tag || !isLowerCase(tag)) return -1
    if (hasBailAttr(node, isRoot)) return -1
    if (isSelfClosing(node)) return 1
    let count = 1
    for (const child of jsxChildren(node)) {
      const c = countChildForTemplate(child)
      if (c === -1) return -1
      count += c
    }
    return count
  }

  function templateFragmentCount(frag: N): number {
    let count = 0
    for (const child of jsxChildren(frag)) {
      const c = countChildForTemplate(child)
      if (c === -1) return -1
      count += c
    }
    return count
  }

  function buildTemplateCall(node: N): string | null {
    // Two-phase emission (PZ-08 fix). `refLines` (phase 1) holds every
    // PRISTINE-CLONE node capture: element ref walks (`const __eN = …`),
    // sole-text captures (`const __tN = X.firstChild`), and hoisted
    // placeholder consts (`const __pN = <walk>`) for `_mountSlot`
    // placeholder args + `replaceChild` targets. `bindLines` (phase 2)
    // holds every MUTATION/binding (`_mountSlot`, `replaceChild`, attr
    // setters, `_bind*`, listeners, refs) in source order. The body emits
    // refLines THEN bindLines, so every DOM position is captured before
    // any mutation runs — `_mountSlot` removes its `<!>` placeholder and
    // inserts content + a `<!--pyreon-->` marker (net sibling-count delta
    // ≠ 0), so a `firstChild.nextSibling…` walk evaluated AFTER it landed
    // on the wrong node (marker comment / null / a sibling slot's marker,
    // which the next `_mountSlot` then removed — losing that slot's
    // subtree on its next re-flip). Phase-2 ops are identity-based, hence
    // order-independent w.r.t. sibling structure.
    const refLines: string[] = []
    const bindLines: string[] = []
    const disposerNames: string[] = []
    let varIdx = 0
    let dispIdx = 0
    let placeholderIdx = 0
    const reactiveBindExprs: string[] = []
    let needsBindTextImport = false
    let needsBindDirectImport = false
    let needsApplyPropsImport = false
    let needsMountSlotImport = false
    let needsCxImport = false
    let needsSetStyle = false
    let needsSetClass = false
    let needsSetAttr = false

    function nextVar(): string {
      return `__e${varIdx++}`
    }
    function nextDisp(): string {
      const name = `__d${dispIdx++}`
      disposerNames.push(name)
      return name
    }
    function nextTextVar(): string {
      return `__t${varIdx++}`
    }
    function nextPlaceholderVar(): string {
      return `__p${placeholderIdx++}`
    }

    /**
     * Capture a placeholder/replace-target walk as a phase-1 const so the
     * walk resolves against the pristine clone (before any `_mountSlot`
     * mutated the child list). Returns the const name for the phase-2 op.
     */
    function hoistPlaceholderRef(parentRef: string, childNodeIdx: number): string {
      const p = nextPlaceholderVar()
      refLines.push(`const ${p} = ${childNodeAccessor(parentRef, childNodeIdx, true)}`)
      return p
    }

    function resolveElementVar(accessor: string, hasDynamic: boolean): string {
      if (accessor === '__root') return '__root'
      if (hasDynamic) {
        const v = nextVar()
        refLines.push(`const ${v} = ${accessor}`)
        return v
      }
      return accessor
    }

    function emitRef(attr: N, varName: string): void {
      if (!attr.value || attr.value.type !== 'JSXExpressionContainer') return
      const expr = attr.value.expression
      if (!expr || expr.type === 'JSXEmptyExpression') return
      if (expr.type === 'ArrowFunctionExpression' || expr.type === 'FunctionExpression') {
        bindLines.push(`(${sliceExpr(expr)})(${varName})`)
      } else {
        bindLines.push(
          `{ const __r = ${sliceExpr(expr)}; if (typeof __r === "function") __r(${varName}); else if (__r) __r.current = ${varName} }`,
        )
      }
    }

    function emitEventListener(attr: N, attrName: string, varName: string): void {
      // Translate the JSX-style React attribute name (e.g. `onKeyDown`,
      // `onDoubleClick`) to the canonical DOM event name (`keydown`,
      // `dblclick`).
      //
      // The default rule is "drop the `on` prefix and lowercase" —
      // covers `onKeyDown` → `keydown`, `onMouseEnter` → `mouseenter`,
      // `onPointerLeave` → `pointerleave`, `onAnimationStart` →
      // `animationstart`, etc. Most React event names follow this rule
      // because the underlying DOM event name is also the lowercased
      // multi-word form.
      //
      // The exception list lives in `REACT_EVENT_REMAP` (event-names.ts).
      // Every React event-prop in the official component-prop list was
      // audited against canonical DOM event names — see the JSDoc on
      // REACT_EVENT_REMAP for the audit. Today exactly one entry:
      //   `onDoubleClick` → `dblclick`
      // The Rust native backend (`native/src/lib.rs:emit_event_listener`)
      // mirrors the same table — keep them in sync if a new entry is added.
      const lowered = attrName.slice(2).toLowerCase()
      const eventName = REACT_EVENT_REMAP[lowered] ?? lowered
      if (!attr.value || attr.value.type !== 'JSXExpressionContainer') return
      const expr = attr.value.expression
      if (!expr || expr.type === 'JSXEmptyExpression') return
      const handler = sliceExpr(expr)
      if (DELEGATED_EVENTS.has(eventName)) {
        bindLines.push(`${varName}.__ev_${eventName} = ${handler}`)
      } else {
        bindLines.push(`${varName}.addEventListener("${eventName}", ${handler})`)
      }
    }

    function staticAttrToHtml(exprNode: N, htmlAttrName: string, tag?: string): string | null {
      // Parens + TS type layers are value-transparent: `id={("a")}` /
      // `id={"a" as const}` IS the static literal — unwrap before
      // classifying so it bakes into the template instead of paying a
      // runtime setAttribute (JS) or being dropped entirely (the historical
      // Rust behavior — silent attribute loss, fuzz-found).
      exprNode = unwrapTypeLayers(exprNode)
      // `<select value>` (PZ-09): <select> has NO `value` CONTENT attribute —
      // the HTML parser ignores `value="…"` on <select> entirely, so baking
      // it into the template HTML is a DEAD attribute (the select silently
      // shows its first option). Every value-PRODUCING static shape returns
      // null so the dynamic path emits a one-time `el.value = …` PROPERTY
      // set instead, which `processAttrs` defers until AFTER the element's
      // children lines (the matching <option> must exist before the
      // assignment can select it). The omit-semantic arms below
      // (false/null/undefined → '') are unchanged — they emit nothing on
      // the client either, so an option's own `selected` attribute isn't
      // clobbered. NOT a silent catch-all: null falls through to the
      // dynamic path; nothing is dropped.
      const isSelectValue = tag === 'select' && htmlAttrName === 'value'
      // No `isStatic` pre-gate: the arms below are self-evidently-static
      // shapes, and the two backends' static classifiers disagreed on the
      // margins (JS said `-5` was dynamic → runtime setAttribute; Rust said
      // static → hit a silent-omit catch-all and DROPPED the attribute).
      // Shape-matching directly keeps the backends byte-identical by
      // construction: recognized static shape → bake; anything else →
      // `null` → the dynamic path emits a one-time setAttribute.
      // String literal
      if (
        (exprNode.type === 'Literal' || exprNode.type === 'StringLiteral') &&
        typeof exprNode.value === 'string'
      )
        return isSelectValue ? null : ` ${htmlAttrName}="${escapeHtmlAttr(exprNode.value)}"`
      // Numeric literal
      if (
        (exprNode.type === 'Literal' || exprNode.type === 'NumericLiteral') &&
        typeof exprNode.value === 'number'
      )
        return isSelectValue ? null : ` ${htmlAttrName}="${exprNode.value}"`
      // Boolean true
      if (
        (exprNode.type === 'Literal' || exprNode.type === 'BooleanLiteral') &&
        exprNode.value === true
      )
        return isSelectValue ? null : ` ${htmlAttrName}`
      // No-substitution template literal: `id={\`x\`}` — bake the raw text
      // (parity with the Rust backend, which always baked this; the JS
      // fallthrough used to DROP the attribute entirely).
      if (exprNode.type === 'TemplateLiteral' && (exprNode.expressions?.length ?? 0) === 0) {
        if (isSelectValue) return null
        const quasi = exprNode.quasis?.[0]
        if (quasi) return ` ${htmlAttrName}="${escapeHtmlAttr(quasi.value?.raw ?? '')}"`
        return ''
      }
      // Signed numeric literal: `tabIndex={-1}` — trivially foldable, bake it.
      // (The Rust backend used to DROP these; JS paid a runtime setAttribute.)
      if (
        exprNode.type === 'UnaryExpression' &&
        (exprNode.operator === '-' || exprNode.operator === '+') &&
        ((exprNode.argument?.type === 'Literal' && typeof exprNode.argument.value === 'number') ||
          exprNode.argument?.type === 'NumericLiteral')
      )
        return isSelectValue
          ? null
          : ` ${htmlAttrName}="${exprNode.operator === '-' ? '-' : ''}${exprNode.argument.value}"`
      if (
        (exprNode.type === 'Literal' && (exprNode.value === false || exprNode.value === null)) ||
        exprNode.type === 'BooleanLiteral' ||
        exprNode.type === 'NullLiteral'
      )
        return '' // false/null → omit (semantic)
      if (exprNode.type === 'Identifier' && exprNode.name === 'undefined')
        return '' // undefined → omit (semantic)
      // Static-but-computed (`{1+2}`, `{!0}`) — NOT silently omitted: fall
      // through to the dynamic path, which emits a one-time setAttribute.
      return null
    }

    /**
     * Detect a zero-arg signal-like call shape suitable for the `_bindText` /
     * `_bindDirect` fast path. Returns `{ ref, isMember }` where:
     *   - `ref`: the source-text reference (e.g. `count` or `row.label`)
     *   - `isMember`: true iff the callee is a MemberExpression chain. The
     *     emitter uses this to pass an explicit `caller` 3rd arg so the
     *     runtime's slow path can preserve `this` if `source` turns out
     *     to be a method.
     *
     * Accepted shapes:
     *   - Bare identifier: `count()` — must NOT be a known active signal
     *     for the MemberExpression form (a tracked signal would suggest a
     *     method call like `count.peek()`, which is intentionally untracked
     *     and would defeat the binding).
     *   - Non-computed MemberExpression chain: `row.label()`, `data.user.name()`.
     *     Computed access (`row[k]()`) bails — the key is dynamic.
     */
    function tryDirectSignalRef(
      exprNode: N,
      allowBareSignal = false,
    ): { ref: string; isMember: boolean } | null {
      let inner = exprNode
      if (inner.type === 'ArrowFunctionExpression' && inner.body?.type !== 'BlockStatement') {
        inner = inner.body
      }
      // Bare signal/computed identifier — the un-called form (e.g.
      // `class={active}`, `style={styleSig}`). Semantically identical to the
      // accessor form `class={() => active()}` (the compiler auto-calls bare
      // signals), so bind directly to its value for byte-for-byte parity
      // instead of falling through to a re-tracking `_bind`. Guarded by
      // `isActiveSignal` so ONLY signals/computeds (which expose `.direct`)
      // take this path; selectors (tracked in `selectorVars`) and arbitrary
      // identifiers stay on the general path. `_bindDirect` also falls back to
      // a `renderEffect` for any source lacking `.direct`, so this is safe at
      // the edges. Caller emits the 2-arg form (no `this` to preserve).
      // Use the raw identifier NAME, not `sliceExpr` — the signal-auto-call
      // records a source replacement (`active` → `active()`), so slicing this
      // node's range would yield `active()`; we want the bare `active`.
      // SCOPED to the ATTRIBUTE path (`allowBareSignal`) — the text-child path
      // keeps its existing emission for bare signals (the dominant
      // `<div>{name}</div>` shape); promoting THAT to `_bindText` is a
      // larger, separately-measured change, not this fix.
      if (allowBareSignal && inner.type === 'Identifier' && isActiveSignal(inner.name)) {
        return { ref: inner.name, isMember: false }
      }
      if (inner.type !== 'CallExpression') return null
      if ((inner.arguments?.length ?? 0) > 0) return null
      const callee = inner.callee
      if (!callee) return null
      // Bare identifier — the existing fast path. Caller emits 2-arg form.
      if (callee.type === 'Identifier') return { ref: sliceExpr(callee), isMember: false }
      // MemberExpression chain — widening. Walk the chain, bail on any
      // computed access. Root identifier must NOT be a tracked active
      // signal (would imply a method call on a signal, e.g. `count.peek()`).
      if (callee.type === 'MemberExpression') {
        let cur: N = callee
        while (cur.type === 'MemberExpression') {
          if (cur.computed) return null
          if (cur.property?.type !== 'Identifier') return null
          cur = cur.object
        }
        if (cur.type !== 'Identifier') return null
        if (isActiveSignal(cur.name)) return null
        return { ref: sliceExpr(callee), isMember: true }
      }
      return null
    }

    /**
     * Detect the `selector(key) ? consequent : alternate` ternary shape for
     * effect-free promotion to `selector.subscribe(key, m => ...)`.
     *
     * Returns the components needed to emit the promoted call, or `null` if
     * the expression doesn't match the auto-promote shape.
     *
     * Conservative — bails on every shape we can't prove safe:
     *   - Selector callee must be a known `createSelector()` result (tracked
     *     in `selectorVars`)
     *   - Selector call must have exactly 1 argument (the key)
     *   - Key expression must NOT contain a reactive read (otherwise the
     *     `.subscribe` would freeze the key at the wrong moment — the
     *     existing renderEffect path re-evaluates it on each fire)
     *   - Consequent + alternate must be non-reactive (string literal,
     *     plain identifier, or other non-call non-member expressions —
     *     the promoted path doesn't re-evaluate them per fire)
     *
     * Pattern matches BOTH bare `selector(k) ? a : b` AND
     * `() => selector(k) ? a : b` (the JSX accessor form the compiler
     * normalizes through `unwrapAccessor` returns the inner conditional
     * directly).
     */
    /**
     * Conservative reactivity check for the selector-promote bail catalog.
     * Returns true iff the subtree contains a CallExpression whose callee
     * is a known active signal — i.e. an actual reactive read. Plain
     * member access (`row.id`, `obj.deep.x`) returns FALSE even though it
     * would trip the more permissive `isDynamic` (which also flags props
     * access). That distinction matters for `<For>` row keys — the
     * callback parameter is stable, and its member chain is a safe key
     * for `.subscribe`.
     */
    function containsSignalCall(node: N): boolean {
      if (!node) return false
      if (node.type === 'CallExpression') {
        const callee = node.callee
        if (callee?.type === 'Identifier' && isActiveSignal(callee.name)) return true
      }
      let found = false
      forEachChildFast(node, (child) => {
        if (found) return
        if (containsSignalCall(child)) found = true
      })
      return found
    }

    function tryDirectSelectorTernary(exprNode: N): {
      selectorRef: string
      keyExpr: string
      consequent: string
      alternate: string
    } | null {
      let inner = exprNode
      if (inner.type === 'ArrowFunctionExpression' && inner.body?.type !== 'BlockStatement') {
        inner = inner.body
      }
      // Unwrap a leading parenthesized expression (e.g. `() => (sel(k) ? a : b)`)
      while (inner?.type === 'ParenthesizedExpression') inner = inner.expression
      if (inner?.type !== 'ConditionalExpression') return null
      // Test must be a single-arg call to a known selector
      const test = inner.test
      if (test?.type !== 'CallExpression') return null
      if ((test.arguments?.length ?? 0) !== 1) return null
      const callee = test.callee
      if (callee?.type !== 'Identifier') return null
      if (!isActiveSelector(callee.name)) return null
      const keyArg = test.arguments?.[0]
      if (!keyArg) return null
      // Key must not contain a signal/computed read — promoting would
      // freeze the key reference at first mount, and the rebuilt key would
      // not re-subscribe to the selector. Member access (`row.id`, `obj.x`)
      // is fine — `row` is a stable callback parameter inside `<For>`,
      // and even if the underlying object changes, the For reconciler
      // re-runs the row template + this binding fresh.
      //
      // Use containsSignalCall instead of isDynamic — the latter also flags
      // simple prop access (which is the canonical safe case here).
      if (containsSignalCall(keyArg)) return null
      // Consequent + alternate must be non-reactive (the promoted updater
      // only re-fires on selection change, not on other signal changes).
      // Apply the same conservative check: bail on signal calls only.
      if (containsSignalCall(inner.consequent)) return null
      if (containsSignalCall(inner.alternate)) return null
      return {
        selectorRef: sliceExpr(callee),
        keyExpr: sliceExpr(keyArg),
        consequent: sliceExpr(inner.consequent),
        alternate: sliceExpr(inner.alternate),
      }
    }

    /**
     * Detect `signalRef().method(...args)` where `method` is a pure
     * Number/String/Boolean prototype method and `args` contain no
     * reactive reads. Used by `emitReactiveTextChild` to promote
     * `<span>{count().toFixed(2)}</span>` to
     * `_bindDirect(count, (v) => { textNode.data = v.toFixed(2) })` —
     * skipping the `withTracking` setup + signal lookup per fire.
     *
     * The promoted updater receives the raw signal value and calls the
     * method on it directly. If the value isn't a primitive of the
     * expected type, the runtime crashes the same way the original
     * `count().toFixed(2)` would — no NEW risk introduced.
     *
     * Conservative — bails on every shape we can't prove safe:
     *   - Receiver must be a single-arg-less call to a known signal
     *     (`signalVars` membership, scope-aware via `isActiveSignal`)
     *   - Method must be in `PURE_PRIMITIVE_METHODS` (no user-overridable
     *     methods on arbitrary objects)
     *   - All args must be non-reactive (no signal calls; safe under
     *     `containsSignalCall`)
     */
    function tryDirectSignalMethodCall(exprNode: N): {
      signalRef: string
      methodCall: string
    } | null {
      let inner = exprNode
      if (inner.type === 'ArrowFunctionExpression' && inner.body?.type !== 'BlockStatement') {
        inner = inner.body
      }
      while (inner?.type === 'ParenthesizedExpression') inner = inner.expression
      if (inner?.type !== 'CallExpression') return null
      const methodCallee = inner.callee
      if (methodCallee?.type !== 'MemberExpression') return null
      if (methodCallee.computed) return null
      if (methodCallee.property?.type !== 'Identifier') return null
      const methodName = methodCallee.property.name
      if (!PURE_PRIMITIVE_METHODS.has(methodName)) return null
      // Receiver must be a zero-arg call to a known signal identifier.
      const recv = methodCallee.object
      if (recv?.type !== 'CallExpression') return null
      if ((recv.arguments?.length ?? 0) !== 0) return null
      const sigCallee = recv.callee
      if (sigCallee?.type !== 'Identifier') return null
      if (!isActiveSignal(sigCallee.name)) return null
      // Args (to the method, not the signal) must not contain reactive reads.
      for (const arg of inner.arguments ?? []) {
        if (arg.type === 'SpreadElement') return null
        if (containsSignalCall(arg)) return null
      }
      // Slice the `.method(...args)` suffix verbatim from source — prepend
      // the dot since `methodCallee.property.start` lands at the method
      // identifier itself.
      const methodCallStart = methodCallee.property.start as number
      const methodCallEnd = inner.end as number
      const methodCall = `.${code.slice(methodCallStart, methodCallEnd)}`
      return {
        signalRef: sliceExpr(sigCallee),
        methodCall,
      }
    }

    function unwrapAccessor(exprNode: N): { expr: string; isReactive: boolean } {
      if (exprNode.type === 'ArrowFunctionExpression' && exprNode.body?.type !== 'BlockStatement') {
        return { expr: sliceExpr(exprNode.body), isReactive: true }
      }
      if (exprNode.type === 'ArrowFunctionExpression' || exprNode.type === 'FunctionExpression') {
        return { expr: `(${sliceExpr(exprNode)})()`, isReactive: true }
      }
      return { expr: sliceExpr(exprNode), isReactive: isDynamic(exprNode) }
    }

    function attrSetter(htmlAttrName: string, varName: string, expr: string): string {
      // class/style mirror the runtime `applyProp` value-normalization
      // (packages/core/runtime-dom/src/props.ts): a string passes through,
      // but an array/object class goes through `cx()` and an object style is
      // applied per-property. The template fast path used to assign the raw
      // value (`className = [..]` → "a,b"; `style.cssText = {..}` →
      // "[object Object]"), so `class={[...]}` / `class={{...}}` and
      // `style={() => ({...})}` / `style={{...}}` were silently broken.
      // Block-scoped temp = single eval (safe for signal-call exprs) + no
      // collision when several bindings are combined into one `_bind` body.
      if (htmlAttrName === 'class') {
        // Delegate to the runtime `_setClass` (= applyClassProp) so a compiled
        // class binding normalizes identically to applyProp (string passes
        // through, array/object → cx) AND uses `setAttribute('class', …)`,
        // which is SVG-safe. The previous inline `.className = …` THREW on a
        // real SVGElement (read-only SVGAnimatedString) — silently breaking
        // every `<g>`/`<path>` class binding once `_tpl` gave SVG templates the
        // correct namespace (the `@pyreon/flow` edge bug). Mirrors `_setStyle`.
        needsSetClass = true
        return `_setClass(${varName}, ${expr})`
      }
      if (htmlAttrName === 'style') {
        // Delegate to the runtime `_setStyle` (= applyStyleProp) so a compiled
        // style binding normalizes identically to applyProp: object →
        // per-property setProperty (kebab + number→px) with stale-key removal,
        // string → cssText. The previous inline `cssText = expr` set an object
        // to cssText ("[object Object]" → no styles).
        needsSetStyle = true
        return `_setStyle(${varName}, ${expr})`
      }
      if (htmlAttrName === 'dangerouslySetInnerHTML') {
        // Mirror runtime applyStaticProp: set innerHTML from the `{ __html }`
        // payload (raw — developer owns sanitization, same as React). A generic
        // setAttribute here stringifies the object to "[object Object]" and
        // leaves the element EMPTY — so an SSR'd `<pre>` (e.g. a Shiki code
        // block) vanishes the moment the client re-renders the template.
        return `{ const _h = (${expr}); ${varName}.innerHTML = _h != null && _h.__html != null ? _h.__html : "" }`
      }
      if (DOM_PROPS.has(htmlAttrName)) return `${varName}.${htmlAttrName} = ${expr}`
      // Generic attribute — delegate to the runtime `_setAttr` (= applyAttrProp)
      // so a compiled DYNAMIC attribute normalizes identically to the h() path
      // (packages/core/runtime-dom/src/props.ts:setStaticProp): null/undefined →
      // removeAttribute (NOT the literal "undefined" a raw setAttribute would
      // ToString-coerce — the invalid `aria-*="undefined"` a11y bug), boolean
      // aria → "true"/"false", boolean → presence/absence. Mirrors `_setClass`/
      // `_setStyle`. Static string/number/bool LITERALS still bake into the
      // template HTML (staticAttrToHtml) — this fires only for dynamic values.
      needsSetAttr = true
      return `_setAttr(${varName}, "${htmlAttrName}", ${expr})`
    }

    function emitDynamicAttr(
      _expr: string,
      exprNode: N,
      htmlAttrName: string,
      varName: string,
    ): void {
      const { expr, isReactive } = unwrapAccessor(exprNode)
      if (!isReactive) {
        bindLines.push(attrSetter(htmlAttrName, varName, expr))
        return
      }
      lens(
        exprNode.start as number,
        exprNode.end as number,
        'reactive-attr',
        `live attribute — \`${htmlAttrName}\` re-applies whenever its signals change`,
      )
      // `allowBareSignal` — an attribute value that is a bare signal
      // (`class={active}`) binds directly, matching the accessor form
      // `class={() => active()}` (byte-identical). The text-child call site
      // below intentionally does NOT opt in (see tryDirectSignalRef).
      const directRef = tryDirectSignalRef(exprNode, true)
      if (directRef) {
        needsBindDirectImport = true
        const d = nextDisp()
        const updater =
          htmlAttrName === 'class'
            ? ((needsSetClass = true), `(v) => _setClass(${varName}, v)`)
            : htmlAttrName === 'style'
              ? ((needsSetStyle = true), `(v) => _setStyle(${varName}, v)`)
              : htmlAttrName === 'dangerouslySetInnerHTML'
                ? `(v) => { ${varName}.innerHTML = v != null && v.__html != null ? v.__html : "" }`
                : DOM_PROPS.has(htmlAttrName)
                  ? `(v) => { ${varName}.${htmlAttrName} = v }`
                  : ((needsSetAttr = true), `(v) => _setAttr(${varName}, "${htmlAttrName}", v)`)
        const callerArg = directRef.isMember ? `, () => ${directRef.ref}()` : ''
        bindLines.push(`const ${d} = _bindDirect(${directRef.ref}, ${updater}${callerArg})`)
        return
      }
      // Selector-ternary auto-promotion: `selector(k) ? a : b` becomes
      // `selector.subscribe(k, m => setter(m ? a : b))` — the effect-free
      // per-key fast path. See `tryDirectSelectorTernary` for the bail
      // catalog. Real-world impact: per-row className-on-selection in
      // <For> drops from ~5 allocs (full renderEffect) to ~2 (Set.add +
      // dispose closure).
      const selTernary = tryDirectSelectorTernary(exprNode)
      if (selTernary) {
        const d = nextDisp()
        const setterBody = attrSetter(
          htmlAttrName,
          varName,
          `(m ? ${selTernary.consequent} : ${selTernary.alternate})`,
        )
        bindLines.push(
          `const ${d} = ${selTernary.selectorRef}.subscribe(${selTernary.keyExpr}, (m) => { ${setterBody} })`,
        )
        return
      }
      reactiveBindExprs.push(attrSetter(htmlAttrName, varName, expr))
    }

    function emitAttrExpression(
      exprNode: N,
      htmlAttrName: string,
      varName: string,
      tag: string,
    ): string {
      // PZ-05 fix: TS type-only layers/parens are value-transparent — unwrap
      // BEFORE classification (mirrors processOneChild) so
      // `title={(() => x()) as never}` classifies (and emits) identically to
      // `title={() => x()}`. Pre-fix the wrapped accessor fell through to the
      // static arm and setAttribute'd the function SOURCE string. Also lets
      // the static object-style check + the downstream `_bindDirect` /
      // selector promotions see through casts (`style={{…} as CSSProperties}`,
      // `title={(() => x()) satisfies unknown}`). `staticAttrToHtml` already
      // unwraps internally — the double unwrap is a no-op.
      exprNode = unwrapTypeLayers(exprNode)
      const staticHtml = staticAttrToHtml(exprNode, htmlAttrName, tag)
      if (staticHtml !== null) return staticHtml
      if (
        htmlAttrName === 'style' &&
        exprNode.type === 'ObjectExpression' &&
        !isDynamic(exprNode)
      ) {
        // Static object style (no signal reads) — apply once at mount via the
        // runtime normalizer (number→px, kebab) for parity with applyProp.
        needsSetStyle = true
        bindLines.push(`_setStyle(${varName}, ${sliceExpr(exprNode)})`)
        return ''
      }
      // A dynamic object style (`style={{ color: theme() }}`) falls through to
      // emitDynamicAttr → the object-aware attrSetter → reactive `_bind`.
      emitDynamicAttr(sliceExpr(exprNode), exprNode, htmlAttrName, varName)
      return ''
    }

    function tryEmitSpecialAttr(attr: N, attrName: string, varName: string): boolean {
      if (attrName === 'ref') {
        emitRef(attr, varName)
        return true
      }
      if (EVENT_RE.test(attrName)) {
        emitEventListener(attr, attrName, varName)
        return true
      }
      return false
    }

    function attrInitializerToHtml(
      attr: N,
      htmlAttrName: string,
      varName: string,
      tag: string,
    ): string {
      if (!attr.value) return ` ${htmlAttrName}`
      // JSX string attribute: class="foo"
      if (
        attr.value.type === 'StringLiteral' ||
        (attr.value.type === 'Literal' && typeof attr.value.value === 'string')
      ) {
        // `<select value="b">` (plain string form, PZ-09): never baked — the
        // value CONTENT attribute is dead on <select> (see staticAttrToHtml).
        // Emit a one-time property set instead; processAttrs defers it past
        // the element's children lines. `escapeJsString` serializes the
        // parsed `.value` as a double-quoted JS literal (quote/backslash/
        // control-safe, independent of the JSX quote style) — the same
        // `.value` the bake path reads.
        if (tag === 'select' && htmlAttrName === 'value') {
          bindLines.push(attrSetter(htmlAttrName, varName, escapeJsString(attr.value.value)))
          return ''
        }
        return ` ${htmlAttrName}="${escapeHtmlAttr(attr.value.value)}"`
      }
      if (attr.value.type === 'JSXExpressionContainer') {
        const expr = attr.value.expression
        if (expr && expr.type !== 'JSXEmptyExpression')
          return emitAttrExpression(expr, htmlAttrName, varName, tag)
      }
      return ''
    }

    function processOneAttr(attr: N, varName: string, tag: string): string {
      if (attr.type === 'JSXSpreadAttribute') {
        const expr = sliceExpr(attr.argument)
        needsApplyPropsImport = true
        if (isDynamic(attr.argument)) {
          reactiveBindExprs.push(`_applyProps(${varName}, ${expr})`)
        } else {
          bindLines.push(`_applyProps(${varName}, ${expr})`)
        }
        return ''
      }
      if (attr.type !== 'JSXAttribute') return ''
      const attrName = attr.name?.type === 'JSXIdentifier' ? attr.name.name : ''
      if (attrName === 'key') return ''
      if (tryEmitSpecialAttr(attr, attrName, varName)) return ''
      return attrInitializerToHtml(attr, JSX_TO_HTML_ATTR[attrName] ?? attrName, varName, tag)
    }

    function processAttrs(el: N, varName: string, tag: string, deferredLines: string[]): string {
      // Duplicate plain attributes: JSX object semantics — the LAST value
      // wins (`<p id="a" id="b">` ≡ props `{id:"a", id:"b"}` → "b"). The
      // template path must dedupe explicitly: baking both into the HTML
      // string hands the decision to the HTML parser, which is FIRST-wins —
      // the opposite semantic. Earlier duplicates are dropped with a
      // warning. Spread attributes are untouched (a later plain attr wins
      // over an earlier spread's key by the same object semantics).
      const attrs = jsxAttrs(el)
      const lastPlainIdx = new Map<string, number>()
      for (let i = 0; i < attrs.length; i++) {
        const a = attrs[i]!
        if (a.type === 'JSXAttribute' && a.name?.type === 'JSXIdentifier')
          lastPlainIdx.set(a.name.name as string, i)
      }
      let htmlAttrs = ''
      for (let i = 0; i < attrs.length; i++) {
        const a = attrs[i]!
        if (a.type === 'JSXAttribute' && a.name?.type === 'JSXIdentifier') {
          const name = a.name.name as string
          if ((lastPlainIdx.get(name) ?? i) > i) {
            warn(
              a,
              `Duplicate JSX attribute \`${name}\` — the later occurrence wins (JSX object semantics); this earlier one is ignored.`,
              'duplicate-jsx-attr',
            )
            continue
          }
          // `<select value>` (PZ-09): capture the bind lines this attr emits
          // (static one-time `el.value = …` set, `_bindDirect`, or
          // selector-subscribe) and DEFER them until after the element's
          // children lines. `select.value` is a PROPERTY whose assignment
          // selects a matching <option> — assigned before the options exist
          // (`_bindDirect`'s eager initial update ran before the children
          // `_mountSlot`), the value was silently dropped and the first
          // option won. With static options (baked into the template HTML)
          // the move is a no-op — the clone already contains them at bind
          // time. The general-reactive form (`reactiveBindExprs` → the
          // end-of-template combined `_bind`) is structurally last already
          // and needs no deferral.
          if (tag === 'select' && name === 'value') {
            const before = bindLines.length
            htmlAttrs += processOneAttr(a, varName, tag)
            if (bindLines.length > before) deferredLines.push(...bindLines.splice(before))
            continue
          }
        }
        htmlAttrs += processOneAttr(a, varName, tag)
      }
      return htmlAttrs
    }

    function emitReactiveTextChild(
      expr: string,
      exprNode: N,
      varName: string,
      parentRef: string,
      childNodeIdx: number,
      needsPlaceholder: boolean,
    ): string {
      const tVar = nextTextVar()
      // Sole-dynamic-text-child fast path: bake a single-space text node
      // INTO the template HTML and grab it via `.firstChild` — saves a
      // `document.createTextNode("") + appendChild` pair per template
      // instantiation (per ROW under <For>; measured in the create-path
      // perf audit, .claude/audits/create-path-perf-2026-06-11.md).
      // Correct by construction: (a) a whitespace-only text node survives
      // innerHTML parsing in EVERY element context — including table
      // foster-parenting, which exempts whitespace-only runs — so the
      // space is reliably `firstChild` of the clone; (b) every binding
      // path below writes the initial value synchronously at bind time
      // (before the clone is inserted), so the space never renders.
      // Mixed-content (needsPlaceholder) keeps the comment+replaceChild
      // shape — adjacent baked text runs would MERGE into one node during
      // parsing and break childNodes indexing.
      if (needsPlaceholder) {
        const pVar = hoistPlaceholderRef(parentRef, childNodeIdx)
        bindLines.push(`const ${tVar} = document.createTextNode("")`)
        bindLines.push(`${parentRef}.replaceChild(${tVar}, ${pVar})`)
      } else {
        // Pristine-clone capture — phase 1 (see buildTemplateCall header).
        refLines.push(`const ${tVar} = ${varName}.firstChild`)
      }
      const directRef = tryDirectSignalRef(exprNode)
      if (directRef) {
        needsBindTextImport = true
        const d = nextDisp()
        const callerArg = directRef.isMember ? `, () => ${directRef.ref}()` : ''
        bindLines.push(`const ${d} = _bindText(${directRef.ref}, ${tVar}${callerArg})`)
        return needsPlaceholder ? '<!>' : ' '
      }
      // Selector-ternary auto-promotion (companion to the className
      // path). `<td>{() => sel(k) ? 'X' : 'Y'}</td>` becomes
      // `sel.subscribe(k, (m) => { tVar.data = m ? 'X' : 'Y' })` — the
      // effect-free per-key fast path. See `tryDirectSelectorTernary` for
      // the bail catalog. Reuses the same detector as the attr path.
      const selTernary = tryDirectSelectorTernary(exprNode)
      if (selTernary) {
        const d = nextDisp()
        bindLines.push(
          `const ${d} = ${selTernary.selectorRef}.subscribe(${selTernary.keyExpr}, (m) => { ${tVar}.data = (m ? ${selTernary.consequent} : ${selTernary.alternate}) })`,
        )
        return needsPlaceholder ? '<!>' : ' '
      }
      // Signal-method-call auto-promotion: `<span>{count().toFixed(2)}</span>`
      // becomes `_bindDirect(count, (v) => { tVar.data = v.toFixed(2) })`.
      // Saves the `withTracking` setup + signal lookup per fire — same
      // structural win as `_bindText` for bare signal reads, extended to
      // common formatting patterns. See `tryDirectSignalMethodCall` for the
      // pure-method safelist + bail catalog.
      const sigMethod = tryDirectSignalMethodCall(exprNode)
      if (sigMethod) {
        needsBindDirectImport = true
        const d = nextDisp()
        bindLines.push(
          `const ${d} = _bindDirect(${sigMethod.signalRef}, (v) => { ${tVar}.data = v${sigMethod.methodCall} })`,
        )
        return needsPlaceholder ? '<!>' : ' '
      }
      // General reactive text child — polymorphic: primitives take the text
      // fast path (data in-place), a VNode/VNode[] value MOUNTS a subtree
      // (so `{props.items}` / `{() => arr()}` render an array instead of
      // "[object Object]"). `bindPolymorphicText`'s textish check is a cheap
      // typeof, so the dominant string/number case pays the historical cost.
      // The single-signal `_bindText` fast path above is text-FIRST, not
      // text-only: the RUNTIME upgrades the binding to the same subtree
      // mount on the first VNode-shaped value. Note both `{sig()}` AND
      // `{() => sig()}` land on that fast path (`tryDirectSignalRef` unwraps
      // the accessor form) — a prior comment here claimed the accessor form
      // was an escape hatch to this general path; it never was, which is why
      // the fix lives in `_bindText` itself (no compiler reroute, both
      // backends stay byte-identical). `_bindDirect`'s text shape stays
      // text-only by construction (the pure-method safelist implies
      // primitive values).
      needsBindPolyImportGlobal = true
      const d = nextDisp()
      bindLines.push(`const ${d} = bindPolymorphicText(() => (${expr}), ${tVar}, ${parentRef})`)
      return needsPlaceholder ? '<!>' : ' '
    }

    function emitStaticTextChild(
      expr: string,
      varName: string,
      parentRef: string,
      childNodeIdx: number,
      needsPlaceholder: boolean,
    ): string {
      if (needsPlaceholder) {
        const pVar = hoistPlaceholderRef(parentRef, childNodeIdx)
        // Mixed-content static child — `_setChildAt` mounts a VNode/VNode[]
        // value at the placeholder position, else replaces it with a text
        // node (the historical shape). Covers `<div>a{items}b</div>` where
        // `items` is a VNode array.
        needsSetChildAtImportGlobal = true
        bindLines.push(`_setChildAt(${parentRef}, ${pVar}, ${expr})`)
        return '<!>'
      }
      // Sole static child — `_setChild` mounts a VNode/VNode[] value into the
      // element (so `<div>{items}</div>` with a VNode[] prop/param/return
      // renders the elements), else sets `textContent` exactly as before.
      needsSetChildImportGlobal = true
      bindLines.push(`_setChild(${varName}, ${expr})`)
      return ''
    }

    type FlatChild =
      | { kind: 'text'; text: string }
      | { kind: 'element'; node: N; elemIdx: number }
      | { kind: 'expression'; expression: N }

    function classifyJsxChild(
      child: N,
      out: FlatChild[],
      elemIdxRef: { value: number },
      recurse: (kids: N[]) => void,
    ): void {
      if (child.type === 'JSXText') {
        const raw = child.value ?? child.raw ?? ''
        const cleaned = cleanJsxText(raw)
        if (cleaned) out.push({ kind: 'text', text: cleaned })
        return
      }
      if (child.type === 'JSXElement') {
        out.push({ kind: 'element', node: child, elemIdx: elemIdxRef.value++ })
        return
      }
      if (child.type === 'JSXExpressionContainer') {
        const expr = child.expression
        if (expr && expr.type !== 'JSXEmptyExpression')
          out.push({ kind: 'expression', expression: expr })
        return
      }
      if (child.type === 'JSXFragment') recurse(jsxChildren(child))
    }

    function flattenChildren(children: N[]): FlatChild[] {
      const flatList: FlatChild[] = []
      const elemIdxRef = { value: 0 }
      function addChildren(kids: N[]): void {
        for (const child of kids) classifyJsxChild(child, flatList, elemIdxRef, addChildren)
      }
      addChildren(children)
      return flatList
    }

    function analyzeChildren(flatChildren: FlatChild[]): {
      useMixed: boolean
      useMultiExpr: boolean
    } {
      const hasElem = flatChildren.some((c) => c.kind === 'element')
      const hasText = flatChildren.some((c) => c.kind === 'text')
      const exprCount = flatChildren.filter((c) => c.kind === 'expression').length
      // `useMixed` triggers placeholder-based positional mounting (each
      // dynamic child gets a `<!>` comment slot in the template that
      // `replaceChild`-replaces at mount). It must fire whenever ≥2 of
      // {element, text, expression} are interleaved — otherwise dynamic
      // text nodes added via `appendChild` land after all static
      // template content, breaking source-order rendering for shapes
      // like `<p>foo {x()} bar</p>` (rendered "foo  barX" instead of
      // "foo X bar"). Discovered by Phase B2's whitespace tests.
      const present = (hasElem ? 1 : 0) + (hasText ? 1 : 0) + (exprCount > 0 ? 1 : 0)
      return { useMixed: present > 1, useMultiExpr: exprCount > 1 }
    }

    function attrIsDynamic(attr: N, tag: string): boolean {
      if (attr.type !== 'JSXAttribute') return false
      const name = attr.name?.type === 'JSXIdentifier' ? attr.name.name : ''
      if (name === 'ref') return true
      if (EVENT_RE.test(name)) return true
      // `<select value="…">` (plain string form, PZ-09): always emitted as a
      // deferred property bind line (never baked) — the element needs a
      // phase-1 ref so the deferred line doesn't re-walk a mutated sibling
      // chain.
      if (
        tag === 'select' &&
        name === 'value' &&
        attr.value &&
        (attr.value.type === 'StringLiteral' ||
          (attr.value.type === 'Literal' && typeof attr.value.value === 'string'))
      )
        return true
      if (!attr.value || attr.value.type !== 'JSXExpressionContainer') return false
      const expr = attr.value.expression
      if (!expr || expr.type === 'JSXEmptyExpression') return false
      // Aligned with the emit path: any shape staticAttrToHtml bakes into the
      // template HTML (or semantically omits) needs NO element ref. A
      // misaligned prescan allocated vestigial `__eN` refs for shapes the
      // emitter then baked (`id={(231)}`), shifting sibling ref-chains.
      if (staticAttrToHtml(expr, name, tag) !== null) return false
      // `<select value={…}>` (PZ-09): every non-omitted shape — including
      // static ones staticAttrToHtml routed to null above — emits a deferred
      // property bind line, so the element needs a ref.
      if (tag === 'select' && name === 'value') return true
      return !isStatic(expr)
    }

    function elementHasDynamic(node: N): boolean {
      const nodeTag = jsxTagName(node)
      if (jsxAttrs(node).some((a: N) => attrIsDynamic(a, nodeTag))) return true
      if (!isSelfClosing(node)) {
        return jsxChildren(node).some(
          (c: N) =>
            c.type === 'JSXExpressionContainer' &&
            c.expression &&
            c.expression.type !== 'JSXEmptyExpression',
        )
      }
      return false
    }

    // Strength-reduce `children[N]` / `childNodes[N]` to a firstChild/nextSibling
    // walk. The live HTMLCollection/NodeList indexed getter is measurably slower
    // than direct pointer reads (~3.8% on create-heavy mounts; SolidJS emits the
    // walk form for the same reason). `children[]` (element collection, skips
    // text) maps to `firstElementChild`/`nextElementSibling`; `childNodes[]`
    // (node list) maps to `firstChild`/`nextSibling`. Falls back to the indexed
    // form past 8 hops, where the chained reads outweigh the getter overhead.
    function childNodeAccessor(parentRef: string, idx: number, mixed: boolean): string {
      if (idx > 8) {
        return mixed ? `${parentRef}.childNodes[${idx}]` : `${parentRef}.children[${idx}]`
      }
      const first = mixed ? 'firstChild' : 'firstElementChild'
      const next = mixed ? 'nextSibling' : 'nextElementSibling'
      let s = `${parentRef}.${first}`
      for (let i = 0; i < idx; i++) s += `.${next}`
      return s
    }

    function processOneChild(
      child: FlatChild,
      varName: string,
      parentRef: string,
      useMixed: boolean,
      useMultiExpr: boolean,
      childNodeIdx: number,
    ): string | null {
      if (child.kind === 'text') return escapeHtmlText(child.text)
      if (child.kind === 'element') {
        const childAccessor = useMixed
          ? childNodeAccessor(parentRef, childNodeIdx, true)
          : childNodeAccessor(parentRef, child.elemIdx, false)
        return processElement(child.node, childAccessor)
      }
      const needsPlaceholder = useMixed || useMultiExpr
      // PZ-05 fix: TS type-only layers (`as T` / `satisfies T` / `!`) and
      // parens are value-transparent — unwrap BEFORE classification so
      // `{(() => x()) as never}` classifies (and emits) identically to
      // `{() => x()}`. Pre-fix the wrapped accessor fell through to the
      // STATIC bake arm and stringified the function SOURCE into the DOM
      // (`textContent = (() => x()) as never`). Same helper the signal
      // auto-call pass uses for its "parens/TS-layer transparent" contract.
      const childExpr = unwrapTypeLayers(child.expression)
      const { expr, isReactive } = unwrapAccessor(childExpr)
      // Round 9 fix: a bare `{el}` where `el` is an element-valued binding
      // (`const el = <X/>`) must be MOUNTED via _mountSlot, not text-coerced
      // via createTextNode (which stringifies the NativeItem). Same emission
      // as the children-slot path; _mountSlot handles every child type.
      const isElementValuedIdent =
        (childExpr.type === 'Identifier' && elementVars.has(childExpr.name)) ||
        (!isReactive && /^[A-Za-z_$][\w$]*$/.test(expr) && elementVars.has(expr))
      if (isChildrenExpression(childExpr, expr) || isElementValuedIdent) {
        needsMountSlotImport = true
        const placeholder = hoistPlaceholderRef(parentRef, childNodeIdx)
        const d = nextDisp()
        bindLines.push(`const ${d} = _mountSlot(${expr}, ${parentRef}, ${placeholder})`)
        return '<!>'
      }
      // PZ-02 fix: a call to an in-file JSX-returning helper (`{cell(x)}`,
      // incl. the accessor form `{() => cell(x)}`) must be MOUNTED via
      // `_mountSlot`, not bound as reactive TEXT — pre-fix it emitted
      // `_bind(() => { __t0.data = cell(x) })`, stringifying the returned
      // VNode to "[object Object]" (SSR mounts the shape correctly, so this
      // also removes a guaranteed SSR↔client mismatch). Always wrapped in an
      // accessor: args reading signals re-render the slot
      // (`_mountSlot(() => cell(sig()), …)` re-runs like any reactive slot),
      // and a call is always dynamic. Cross-file callees are NOT routed —
      // see `jsxFnVars`.
      if (isJsxHelperCall(childExpr)) {
        needsMountSlotImport = true
        const placeholder = hoistPlaceholderRef(parentRef, childNodeIdx)
        const d = nextDisp()
        bindLines.push(`const ${d} = _mountSlot(() => (${expr}), ${parentRef}, ${placeholder})`)
        return '<!>'
      }
      // Element-conditional / inline-JSX child (`{cond() ? <A/> : <B/>}`,
      // `{n() && <List/>}`): route through `_mountSlot` so the wrapper keeps
      // the `_tpl` fast path. `_mountSlot` → `mountChild` → `mountReactive`
      // handles a reactive element-returning accessor (disposal + swap on
      // signal change), same machinery the element-valued-const path uses.
      // Reactive bodies are wrapped back into an accessor so the boundary is
      // reactive; a static element-conditional is passed bare (mounts once).
      // Direct JSX in a container (`{<span/>}`) bails the template upstream
      // (countChildForTemplate) and keeps the static-hoist path — but the
      // TYPE-WRAPPED form (`{(<span/>) as never}`) reaches here (the count
      // sees the wrapper node) and routes through `_mountSlot` on the
      // unwrapped slice.
      const exprIsDirectJSX = childExpr.type === 'JSXElement' || childExpr.type === 'JSXFragment'
      const wasTypeWrapped = childExpr !== child.expression
      if (containsJSXInExpr(childExpr) && (!exprIsDirectJSX || wasTypeWrapped)) {
        needsMountSlotImport = true
        const placeholder = hoistPlaceholderRef(parentRef, childNodeIdx)
        const d = nextDisp()
        const slotArg = isReactive ? `() => (${expr})` : expr
        bindLines.push(`const ${d} = _mountSlot(${slotArg}, ${parentRef}, ${placeholder})`)
        return '<!>'
      }
      const cx = childExpr
      if (isReactive) {
        lens(
          cx.start as number,
          cx.end as number,
          'reactive',
          'live — this text re-renders whenever its signals change',
        )
        return emitReactiveTextChild(
          expr,
          childExpr,
          varName,
          parentRef,
          childNodeIdx,
          needsPlaceholder,
        )
      }
      lens(
        cx.start as number,
        cx.end as number,
        'static-text',
        'baked once into the DOM — never re-renders (no signal read here)',
      )
      return emitStaticTextChild(expr, varName, parentRef, childNodeIdx, needsPlaceholder)
    }

    function processChildren(el: N, varName: string, accessor: string): string | null {
      const flatChildren = flattenChildren(jsxChildren(el))
      const { useMixed, useMultiExpr } = analyzeChildren(flatChildren)
      const parentRef = accessor === '__root' ? '__root' : varName
      let html = ''
      let childNodeIdx = 0
      for (const child of flatChildren) {
        const childHtml = processOneChild(
          child,
          varName,
          parentRef,
          useMixed,
          useMultiExpr,
          childNodeIdx,
        )
        if (childHtml === null) return null
        html += childHtml
        childNodeIdx++
      }
      return html
    }

    function processElement(el: N, accessor: string): string | null {
      const tag = jsxTagName(el)
      if (!tag) return null
      const varName = resolveElementVar(accessor, elementHasDynamic(el))
      // Bind lines deferred past this element's children lines (today only
      // `<select value>` — see processAttrs). Appended AFTER processChildren
      // so a `_mountSlot`-mounted option list exists before `el.value` runs.
      const deferredLines: string[] = []
      const htmlAttrs = processAttrs(el, varName, tag, deferredLines)
      let html = `<${tag}${htmlAttrs}>`
      if (!isSelfClosing(el)) {
        const childHtml = processChildren(el, varName, accessor)
        if (childHtml === null) return null
        html += childHtml
      }
      if (deferredLines.length > 0) bindLines.push(...deferredLines)
      if (!VOID_ELEMENTS.has(tag)) html += `</${tag}>`
      return html
    }

    const html = processElement(node, '__root')
    if (html === null) return null

    if (needsBindTextImport) needsBindTextImportGlobal = true
    if (needsBindDirectImport) needsBindDirectImportGlobal = true
    if (needsApplyPropsImport) needsApplyPropsImportGlobal = true
    if (needsMountSlotImport) needsMountSlotImportGlobal = true
    if (needsCxImport) needsCxImportGlobal = true
    if (needsSetStyle) needsSetStyleImportGlobal = true
    if (needsSetClass) needsSetClassImportGlobal = true
    if (needsSetAttr) needsSetAttrImportGlobal = true

    const escaped = html.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

    if (reactiveBindExprs.length > 0) {
      needsBindImportGlobal = true
      const combinedName = nextDisp()
      const combinedBody = reactiveBindExprs.join('; ')
      bindLines.push(`const ${combinedName} = _bind(() => { ${combinedBody} })`)
    }

    if (refLines.length === 0 && bindLines.length === 0 && disposerNames.length === 0) {
      return `_tpl("${escaped}", () => null)`
    }

    // Phase 1 (pristine-clone ref captures) BEFORE phase 2 (mutations/
    // bindings) — see the buildTemplateCall header comment.
    //
    // Append `;` to every line so ASI can't merge consecutive statements
    // when the next line starts with `(`, `[`, etc.
    // Concrete bug shape (pre-fix): a child element with `hasDynamic=true`
    // emits `const __e0 = __root.children[N]` followed by a ref-callback
    // line `((el) => { x = el })(__e0)`. JS does NOT insert ASI here
    // because `__root.children[N]((el) => ...)` is a valid expression,
    // so the parser merges them into a single function call:
    //   `const __e0 = __root.children[N]((el) => ...)(__e0)`
    // — calling `children[N]` as a function with the arrow as argument,
    // and self-referencing `__e0` before assignment. Adding the `;`
    // terminates each statement deterministically. Trailing `;` after
    // a `{...}` block is a harmless empty statement.
    let body = [...refLines, ...bindLines].map((l) => `  ${l};`).join('\n')
    if (disposerNames.length === 1) {
      // Single-binding fast path: return the disposer DIRECTLY instead of
      // allocating a wrapper closure `() => { d() }` per template instance.
      // `_bind` / `_bindText` / `_bindDirect` always return a disposer function
      // (never null — see template.ts), so this is equivalent minus one closure
      // allocation per instance. For the dominant `<For>`-row shape (a sole
      // reactive text child) that's one fewer closure + retained scope per row.
      body += `\n  return ${disposerNames[0]}`
    } else if (disposerNames.length > 0) {
      body += `\n  return () => { ${disposerNames.map((d) => `${d}()`).join('; ')} }`
    } else {
      body += '\n  return null'
    }

    return `_tpl("${escaped}", (__root) => {\n${body}\n})`
  }

  function sliceExpr(expr: N): string {
    let result: string
    if (propDerivedVars.size > 0 && accessesProps(expr)) {
      const start = expr.start as number
      const end = expr.end as number
      result = resolveIdentifiersInText(code.slice(start, end), start, expr)
    } else {
      result = code.slice(expr.start as number, expr.end as number)
    }

    // Auto-call signal variables: replace bare `x` with `x()` in the expression.
    // Only applies to identifiers that are NOT already being called (not `x()`).
    //
    // No `referencesSignalVar` pre-gate here: that gate skipped nested
    // Arrow/FunctionExpression children, so an expression whose ONLY signal
    // reads sat inside a callback (`{[1,2].map(i => s1 ? "a" : "b")}`) was
    // never rewritten — the bare signal function is always truthy / string-
    // concats its own source. `autoCallSignals` walks the exact reachability
    // itself (shadow-aware, JSX-aware) and returns the text unchanged when
    // nothing needs calling, so the gate bought only a redundant walk.
    if (signalVars.size > 0 && signalVars.size > shadowedSignals.size) {
      result = autoCallSignals(result, expr)
    }

    return result
  }

  /** Check if an expression references any tracked signal variable. */
  function referencesSignalVar(node: N): boolean {
    if (node.type === 'Identifier' && isActiveSignal(node.name)) {
      const parent = findParent(node)
      if (
        parent &&
        parent.type === 'MemberExpression' &&
        parent.property === node &&
        !parent.computed
      )
        return false
      // signal.X(...) — operating on the signal object (calling a method).
      // Mirrors the same narrow skip in findSignalIdents below.
      if (parent && parent.type === 'MemberExpression' && parent.object === node) {
        const grand = findParent(parent)
        if (grand && grand.type === 'CallExpression' && grand.callee === parent) return false
      }
      if (parent && parent.type === 'CallExpression' && parent.callee === node) return false // already called
      return true
    }
    let found = false
    forEachChildFast(node, (child) => {
      if (found) return
      if (child.type === 'ArrowFunctionExpression' || child.type === 'FunctionExpression') return
      if (referencesSignalVar(child)) found = true
    })
    return found
  }

  /** Auto-insert () after signal variable references in the expression source.
   *  Uses the AST to find exact Identifier positions — never scans raw text. */
  // Recursively collect identifier names bound by a pattern (params /
  // declarators). Self-contained twin of resolveIdentifiersInText's
  // `patternBindingNames` (different closure scope; kept local to avoid a
  // risky shared-helper hoist).
  function sigPatternNames(p: N, out: string[]): void {
    if (!p) return
    switch (p.type) {
      case 'Identifier':
        out.push(p.name)
        break
      case 'ObjectPattern':
        for (const pr of p.properties ?? []) {
          if (pr.type === 'RestElement') sigPatternNames(pr.argument, out)
          else sigPatternNames(pr.value ?? pr.key, out)
        }
        break
      case 'ArrayPattern':
        for (const el of p.elements ?? []) sigPatternNames(el, out)
        break
      case 'AssignmentPattern':
        sigPatternNames(p.left, out)
        break
      case 'RestElement':
        sigPatternNames(p.argument, out)
        break
    }
  }

  // Signal names a scope-introducing node binds FOR ITS OWN SUBTREE
  // (block-accurate lexical scoping). Mirrors scopeBoundPropDerived but
  // against `signalVars` — a same-named inner binding (callback param,
  // nested const, catch/loop var) shadows the signal and must NOT be
  // auto-called (doing so emits `paramValue()` → runtime TypeError).
  function scopeBoundSignals(node: N): string[] {
    const out: string[] = []
    const t = node.type
    const declNames = (declNode: N): void => {
      for (const d of declNode.declarations ?? []) {
        // A `const x = signal(...)` re-declaration is itself a signal, not a
        // shadow — leave it for the normal signalVars path.
        if (d.id?.type === 'Identifier' && d.init && isSignalCall(d.init)) continue
        sigPatternNames(d.id, out)
      }
    }
    if (
      t === 'ArrowFunctionExpression' ||
      t === 'FunctionExpression' ||
      t === 'FunctionDeclaration'
    ) {
      for (const p of node.params ?? []) sigPatternNames(p, out)
    } else if (t === 'CatchClause') {
      sigPatternNames(node.param, out)
    } else if (t === 'ForStatement') {
      if (node.init?.type === 'VariableDeclaration') declNames(node.init)
    } else if (t === 'ForInStatement' || t === 'ForOfStatement') {
      if (node.left?.type === 'VariableDeclaration') declNames(node.left)
    } else if (t === 'BlockStatement' || t === 'StaticBlock') {
      const stmts = node.body ?? node.statements
      if (Array.isArray(stmts)) {
        for (const s of stmts) {
          if (s.type === 'VariableDeclaration') declNames(s)
          else if (s.type === 'FunctionDeclaration' && s.id?.type === 'Identifier')
            out.push(s.id.name)
          else if (s.type === 'ClassDeclaration' && s.id?.type === 'Identifier') out.push(s.id.name)
        }
      }
    }
    return out.filter((n) => signalVars.has(n))
  }

  /**
   * Exactly-bare signal in a DOM-element binding position stays BARE.
   * Both runtimes treat a callable attr value / child as a reactive
   * accessor (runtime-dom `applyProp` wraps functions in `renderEffect`;
   * runtime-server `renderProp` unwraps them; `mountChild` routes function
   * children through `mountReactive`) — leaving the signal bare yields a
   * FINE-GRAINED binding on that one attr/text node. Auto-calling here
   * would instead read the signal during the enclosing slot/callback
   * evaluation, subscribing the WHOLE slot and remounting the branch on
   * every change (DOM state loss + wasted work). Parens and TS type
   * layers are transparent (`{(s1)}`, `{s1 as T}`). Component attrs and
   * component children are NOT skipped — they go through the `_rp` /
   * accessor-wrap machinery, which expects the call inside its closure.
   *
   * CRITICAL scope limit: the rule applies ONLY to JSX that is RE-EMITTED
   * inside the sliced expression (h-composed at runtime — nested JSX under
   * a `_mountSlot` accessor / callback). A TEMPLATE-path binding slices the
   * bare identifier itself, and its JSXExpressionContainer sits OUTSIDE the
   * slice — there the emitted code assigns the value raw
   * (`t.data = count()` / `setAttribute("title", s1())`), so the call is
   * REQUIRED. Discriminator: the container must lie strictly within
   * [sliceStart, sliceEnd).
   */
  function isBareDomBinding(node: N, sliceStart: number, sliceEnd: number): boolean {
    let cur: N = node
    let parent = findParent(cur)
    while (
      parent &&
      (parent.type === 'ParenthesizedExpression' ||
        parent.type === 'TSAsExpression' ||
        parent.type === 'TSSatisfiesExpression' ||
        parent.type === 'TSNonNullExpression' ||
        parent.type === 'TSTypeAssertion')
    ) {
      cur = parent
      parent = findParent(cur)
    }
    if (!parent || parent.type !== 'JSXExpressionContainer') return false
    // Template-path binding: the container is the slice's own wrapper
    // (outside the sliced range) — the emit needs the VALUE, don't skip.
    if ((parent.start as number) < sliceStart || (parent.end as number) > sliceEnd) return false
    const owner = findParent(parent)
    if (!owner) return false
    if (owner.type === 'JSXAttribute') {
      const opening = findParent(owner)
      if (!opening || opening.type !== 'JSXOpeningElement') return false
      const name = opening.name
      const tag = name?.type === 'JSXIdentifier' ? (name.name as string) : ''
      return tag.length > 0 && !isComponentTag(tag)
    }
    if (owner.type === 'JSXElement') {
      const tag = jsxTagName(owner)
      return tag.length > 0 && !isComponentTag(tag)
    }
    return false
  }

  function autoCallSignals(text: string, expr: N): string {
    const start = expr.start as number
    // Collect signal identifier positions that need auto-calling
    const idents: { start: number; end: number }[] = []
    // Local lexical shadow set — a signal-named binding introduced INSIDE
    // the rewritten expression (callback param, nested const, …) is NOT the
    // signal and must not get `()` (R11: scope-blind rewrite emitted
    // `({x}) => <li>{x()}</li>` → `1()` runtime crash).
    const shadowed = new Set<string>()

    function findSignalIdents(node: N): void {
      if ((node.start as number) >= start + text.length || (node.end as number) <= start) return
      const introduced: string[] = []
      for (const n of scopeBoundSignals(node)) {
        if (!shadowed.has(n)) {
          shadowed.add(n)
          introduced.push(n)
        }
      }
      if (node.type === 'Identifier' && isActiveSignal(node.name) && !shadowed.has(node.name)) {
        const parent = findParent(node)
        // Skip property name positions (obj.name)
        if (
          parent &&
          parent.type === 'MemberExpression' &&
          parent.property === node &&
          !parent.computed
        )
          return
        // Skip when the identifier is the OBJECT of a member access AND
        // the result is being CALLED (signal.set(...), signal.peek(),
        // signal.update(...)). The user is invoking a method on the
        // signal OBJECT — auto-calling would produce `signal().set(...)`
        // which calls the signal, gets its value (string/number/etc),
        // then `.set` on the value is undefined → TypeError. Every event
        // handler that did `signal.set(x)` was silently broken.
        //
        // Note: bare `signal.value` (member access NOT followed by call)
        // STILL auto-calls — keeps the existing convention where
        // `signal({a:1})` followed by `signal.a` reads the signal's
        // value's property (see "signal as member expression object IS
        // auto-called" test).
        if (parent && parent.type === 'MemberExpression' && parent.object === node) {
          const grand = findParent(parent)
          if (grand && grand.type === 'CallExpression' && grand.callee === parent) return
        }
        // Skip if already being called: signal()
        if (parent && parent.type === 'CallExpression' && parent.callee === node) return
        // Skip declaration positions
        if (parent && parent.type === 'VariableDeclarator' && parent.id === node) return
        // Skip object property keys and shorthand properties ({ name } or { name: val })
        // Inserting () after a shorthand key produces name() which is a method shorthand — invalid
        if (parent && (parent.type === 'Property' || parent.type === 'ObjectProperty')) {
          if (parent.shorthand) return // { name } — can't auto-call without breaking syntax
          if (parent.key === node && !parent.computed) return // { name: val } — key position
        }
        // Exactly-bare DOM attr/child — leave bare for the runtimes'
        // fine-grained accessor treatment (see isBareDomBinding).
        if (isBareDomBinding(node, start, start + text.length)) return
        idents.push({ start: node.start as number, end: node.end as number })
      }
      forEachChildFast(node, findSignalIdents)
      for (const n of introduced) shadowed.delete(n)
    }
    findSignalIdents(expr)

    if (idents.length === 0) return text

    // Sort by position and insert () after each identifier
    idents.sort((a, b) => a.start - b.start)
    const parts: string[] = []
    let lastPos = start
    for (const id of idents) {
      parts.push(code.slice(lastPos, id.end))
      parts.push('()') // auto-call
      lastPos = id.end
    }
    parts.push(code.slice(lastPos, start + text.length))
    return parts.join('')
  }
}

// ─── Module-scope constants and helpers ─────────────────────────────────────

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

const JSX_TO_HTML_ATTR: Record<string, string> = {
  className: 'class',
  htmlFor: 'for',
}

// DOM properties whose live value diverges from the content attribute.
// For these, emit property assignment (`el.value = v`) instead of
// `setAttribute("value", v)`. Otherwise the property and attribute drift
// apart in user-driven flows: typing in a controlled <input> updates the
// .value property, but `input.set('')` clearing the signal only resets
// the attribute — the stale typed text stays visible. Same for `checked`
// on checkboxes (presence of the attribute means checked regardless of
// value: `setAttribute("checked", "false")` still checks the box).
const DOM_PROPS = new Set([
  'value',
  'checked',
  'selected',
  'disabled',
  'multiple',
  'readOnly',
  'indeterminate',
])

const STATEFUL_CALLS = new Set([
  'signal',
  'computed',
  'effect',
  'batch',
  'createSelector',
  'createContext',
  'createReactiveContext',
  'useContext',
  'useRef',
  'createRef',
  'useForm',
  'useQuery',
  'useMutation',
  'defineStore',
  'useStore',
])

function isStatefulCall(node: N): boolean {
  if (node.type !== 'CallExpression') return false
  const callee = node.callee
  if (callee?.type === 'Identifier') return STATEFUL_CALLS.has(callee.name)
  return false
}

/** Check if a call expression creates a callable reactive value (`signal(...)` or `computed(...)`). */
function isSignalCall(node: N): boolean {
  if (node.type !== 'CallExpression') return false
  const callee = node.callee
  return callee?.type === 'Identifier' && (callee.name === 'signal' || callee.name === 'computed')
}

/** Check if a call expression creates a selector (`createSelector(...)`). */
function isSelectorCall(node: N): boolean {
  if (node.type !== 'CallExpression') return false
  const callee = node.callee
  return callee?.type === 'Identifier' && callee.name === 'createSelector'
}

function isChildrenExpression(node: N, expr: string): boolean {
  if (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.property?.type === 'Identifier' &&
    node.property.name === 'children'
  )
    return true
  if (node.type === 'Identifier' && node.name === 'children') return true
  if (expr.endsWith('.children') || expr === 'children') return true
  return false
}

function isLowerCase(s: string): boolean {
  return s.length > 0 && s[0] === s[0]?.toLowerCase()
}

function containsJSXInExpr(node: N): boolean {
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') return true
  let found = false
  forEachChild(node, (child) => {
    if (found) return
    if (containsJSXInExpr(child)) found = true
  })
  return found
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/**
 * Serialize a string as a double-quoted JS string literal (JSON semantics:
 * `"`/`\` escaped, named C0 escapes for \b \t \n \f \r, other control chars
 * as \u00XX). Used to emit a parsed JSX attribute string `.value` into a
 * bind line independent of the JSX quote style — today only the
 * `<select value="…">` deferred property set (PZ-09). The Rust backend's
 * `escape_js_string` mirrors this byte-for-byte (native-equivalence oracle).
 */
function escapeJsString(s: string): string {
  return JSON.stringify(s)
}

function escapeHtmlText(s: string): string {
  return s.replace(/&(?!(?:#\d+|#x[\da-fA-F]+|[a-zA-Z]\w*);)/g, '&amp;').replace(/</g, '&lt;')
}

// ─── Compile-to-string SSR fast path (`options.ssrTemplate`) helpers ──────────
//
// These mirror `@pyreon/runtime-server` BYTE-FOR-BYTE so baked static bytes are
// identical to what `renderElement`/`renderProp` produce for the same subtree.

/**
 * SSR text/attr escaping — replicates `@pyreon/runtime-server`'s `escapeHtml`
 * EXACTLY (all five of `& < > " '`, unconditional). This is the escaping the
 * h() SSR path applies to BOTH text children and generic attribute values
 * (`renderPropValue`), so a compile-time bake using it is byte-identical.
 * Distinct from `escapeHtmlText` (the DOM `<template>` path — entity-aware `&`,
 * no `>"'`), which is WRONG for SSR string output.
 */
function escapeHtmlSsr(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c === 38) out += '&amp;'
    else if (c === 60) out += '&lt;'
    else if (c === 62) out += '&gt;'
    else if (c === 34) out += '&quot;'
    else if (c === 39) out += '&#39;'
    else out += s[i]
  }
  return out
}

// Void elements — `renderElement` emits `<tag />` for these regardless of
// children, so an `_ssr` bake of a void tag with content would diverge. Bail.
const SSR_VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

// URL-bearing attributes guarded by `@pyreon/core/url-guard` on the SSR path.
// Single-sourced values mirrored here so the compiler can DECIDE (at bake time)
// whether a static URL literal is safe. Kept in sync with url-guard.ts.
const SSR_URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'poster', 'cite', 'data'])
// Methods that ALWAYS return a string on an unambiguous receiver — used to prove
// a dynamic attr value is non-null-non-boolean (so its attr name+quotes can bake).
// `Number#toFixed`/`Array#join`/`String#*` all return string; `slice`/`concat`/
// `replace` are excluded (ambiguous receiver / can return an array).
const SSR_STRING_METHODS = new Set([
  'toFixed',
  'toString',
  'toLocaleString',
  'join',
  'padStart',
  'padEnd',
  'trim',
  'trimStart',
  'trimEnd',
  'toUpperCase',
  'toLowerCase',
  'repeat',
  'charAt',
])
const SSR_UNSAFE_URL_RE = /^\s*(?:javascript|data):/i

// React/Babel JSX whitespace algorithm (cleanJSXElementLiteralChild).
// Same-line text is preserved verbatim so adjacent expressions keep their
// spacing (`<p>doubled: {x}</p>` keeps the trailing space). Multi-line text
// strips leading whitespace from non-first lines and trailing whitespace
// from non-last lines, drops fully-empty lines, and joins the survivors
// with a single space — collapsing JSX indentation without losing
// intentional inline spacing.
function cleanJsxText(raw: string): string {
  if (!raw.includes('\n') && !raw.includes('\r')) return raw
  const lines = raw.split(/\r\n|\n|\r/)
  let lastNonEmpty = -1
  for (let i = 0; i < lines.length; i++) {
    if (/[^ \t]/.test(lines[i] ?? '')) lastNonEmpty = i
  }
  let str = ''
  for (let i = 0; i < lines.length; i++) {
    let line = (lines[i] ?? '').replace(/\t/g, ' ')
    if (i !== 0) line = line.replace(/^ +/, '')
    if (i !== lines.length - 1) line = line.replace(/ +$/, '')
    if (line) {
      if (i !== lastNonEmpty) line += ' '
      str += line
    }
  }
  return str
}

function isStaticJSXNode(node: N): boolean {
  if (node.type === 'JSXElement' && node.openingElement?.selfClosing) {
    return isStaticAttrs(node.openingElement.attributes ?? [])
  }
  if (node.type === 'JSXFragment') {
    return (node.children ?? []).every(isStaticChild)
  }
  if (node.type === 'JSXElement') {
    return (
      isStaticAttrs(node.openingElement?.attributes ?? []) &&
      (node.children ?? []).every(isStaticChild)
    )
  }
  return false
}

function isStaticAttrs(attrs: N[]): boolean {
  return attrs.every((prop: N) => {
    if (prop.type !== 'JSXAttribute') return false
    if (!prop.value) return true
    if (
      prop.value.type === 'StringLiteral' ||
      (prop.value.type === 'Literal' && typeof prop.value.value === 'string')
    )
      return true
    if (prop.value.type === 'JSXExpressionContainer') {
      const expr = prop.value.expression
      if (!expr || expr.type === 'JSXEmptyExpression') return true
      return isStatic(expr)
    }
    return false
  })
}

function isStaticChild(child: N): boolean {
  if (child.type === 'JSXText') return true
  if (child.type === 'JSXElement') return isStaticJSXNode(child)
  if (child.type === 'JSXFragment') return isStaticJSXNode(child)
  if (child.type === 'JSXExpressionContainer') {
    const expr = child.expression
    if (!expr || expr.type === 'JSXEmptyExpression') return true
    return isStatic(expr)
  }
  return false
}

function isStatic(node: N): boolean {
  if (node.type === 'Literal') return true
  if (
    node.type === 'StringLiteral' ||
    node.type === 'NumericLiteral' ||
    node.type === 'BooleanLiteral' ||
    node.type === 'NullLiteral'
  )
    return true
  if (node.type === 'TemplateLiteral' && (node.expressions?.length ?? 0) === 0) return true
  // Note: `undefined` is an Identifier in ESTree, not a keyword literal.
  // It is NOT treated as static — it goes through the dynamic attr path.
  return false
}

const PURE_CALLS = new Set([
  'Math.max',
  'Math.min',
  'Math.abs',
  'Math.floor',
  'Math.ceil',
  'Math.round',
  'Math.pow',
  'Math.sqrt',
  'Math.random',
  'Math.trunc',
  'Math.sign',
  'Number.parseInt',
  'Number.parseFloat',
  'Number.isNaN',
  'Number.isFinite',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'String.fromCharCode',
  'String.fromCodePoint',
  'Object.keys',
  'Object.values',
  'Object.entries',
  'Object.assign',
  'Object.freeze',
  'Object.create',
  'Array.from',
  'Array.isArray',
  'Array.of',
  'JSON.stringify',
  'JSON.parse',
  'encodeURIComponent',
  'decodeURIComponent',
  'encodeURI',
  'decodeURI',
  'Date.now',
])

/**
 * Safelist of Number / String / Boolean prototype methods that are
 * provably pure (no side effects, no `this` binding tricks, no user
 * override risk at the prototype level). Used by
 * `tryDirectSignalMethodCall` to auto-promote `signalRef().method(...)`
 * in text-child bindings to `_bindDirect`.
 *
 * Methods NOT in this list (Array, Map, Set, Date instance methods)
 * either mutate, depend on call-time state, or aren't pure under all
 * inputs — keep the safelist narrow.
 *
 * Adding a method here: must be pure (same input → same output, no
 * side effects, doesn't read external state, doesn't mutate `this`).
 */
const PURE_PRIMITIVE_METHODS = new Set([
  // Number prototype
  'toFixed',
  'toExponential',
  'toPrecision',
  // Shared (Number + String + Boolean) — toString/valueOf always pure
  'toString',
  'valueOf',
  // String prototype (immutable returns)
  'toUpperCase',
  'toLowerCase',
  'toLocaleUpperCase',
  'toLocaleLowerCase',
  'trim',
  'trimStart',
  'trimEnd',
  'slice',
  'substring',
  'substr',
  'charAt',
  'charCodeAt',
  'codePointAt',
  'padStart',
  'padEnd',
  'repeat',
  'normalize',
  'concat',
  'startsWith',
  'endsWith',
  'includes',
  'indexOf',
  'lastIndexOf',
  'at',
])

function isPureStaticCall(node: N): boolean {
  const callee = node.callee
  let name = ''
  if (callee?.type === 'Identifier') {
    name = callee.name
  } else if (
    callee?.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object?.type === 'Identifier' &&
    callee.property?.type === 'Identifier'
  ) {
    name = `${callee.object.name}.${callee.property.name}`
  }
  if (!PURE_CALLS.has(name)) return false
  return (node.arguments ?? []).every((arg: N) => arg.type !== 'SpreadElement' && isStatic(arg))
}

/**
 * Pure-coercion globals (`String`, `Number`, `Boolean`) — referentially
 * transparent functions whose result depends ONLY on their argument. Unlike
 * `isPureStaticCall` (which requires all args to be `isStatic` literals),
 * this only checks the CALLEE shape. The argument's dynamism is handled by
 * `_isDynamicImpl`'s recurse-into-children logic — so `String(row.id)` is
 * not dynamic (captured row ref), `String(count())` IS dynamic (signal call
 * in arg), `String(props.x)` IS dynamic (props access).
 *
 * Shadowing risk (user has `function String(x) {...}` in scope): same as
 * existing PURE_CALLS entries like `parseInt`, `isNaN` — we trust the global
 * name. A user-shadowed name would still be analyzed correctly by the recurse
 * (their function's arg-evaluation determines dynamism); the only true
 * miss is a non-pure user function with no reactive args — vanishingly rare.
 */
function isPureCoercionCall(node: N): boolean {
  const callee = node.callee
  if (callee?.type !== 'Identifier') return false
  const name = callee.name
  if (name !== 'String' && name !== 'Number' && name !== 'Boolean') return false
  const args = node.arguments ?? []
  if (args.length > 1) return false
  if (args.length === 1 && args[0].type === 'SpreadElement') return false
  return true
}
