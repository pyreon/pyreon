// `rocketstyle()` / `el`-factory chain source → RocketstyleIR parser.
//
// Third of the three compiler-input parsers. The emit-rocketstyle
// side (`emit-rocketstyle.ts` → per-dim enums + parameterised
// ViewModifier) was written first; this is the input side.
//
// Recognises the canonical chain shape in `@pyreon/ui-components`:
//
//   const Button = el
//     .config({ name: 'Button' })
//     .attrs({ tag: 'button', ... })
//     .theme((t) => ({ ... }))           // base style — skipped
//     .states((t) => ({
//       primary: { backgroundColor: t.color.primary.base, ... },
//       secondary: { ... },
//     }))
//     .sizes((t) => ({
//       small: { padding: t.spacing.xSmall, ... },
//       large: { ... },
//     }))
//     .variants((t) => ({ ... }))
//
// Produces RocketstyleIR with one RocketstyleDimension per
// `.states()` / `.sizes()` / `.variants()` call. Each value's body
// becomes a RocketstyleDimensionValue with StyleProperty entries.
//
// ## Recognised chain heads
//
// - `rocketstyle(component)` — direct rocketstyle factory
// - `el` / `txt` / `list` — `@pyreon/ui-core` bases that internally
//   use rocketstyle. The canonical `@pyreon/ui-components` source
//   uses `el` (see Button.tsx). Recognised + treated identically.
//
// ## Dimension method recognition
//
// - `.states(fn)` → dimension name `state`
// - `.sizes(fn)` → dimension name `size`
// - `.variants(fn)` → dimension name `variant`
//
// Other chain methods (`.theme()`, `.attrs()`, `.config()`,
// `.statics()`, `.compose()`) are walked through but their bodies
// aren't part of the matrix — they're skipped.
//
// ## Value-body property parsing
//
// Each dimension value's body is `{ <prop>: <expr>, ... }`. We
// recognise:
//   - String literals → `{ kind: 'string' }`
//   - Numeric literals → `{ kind: 'number' }`
//   - Member chains rooted on the theme param (`t.color.primary.base`,
//     `t.spacing.small`) → `{ kind: 'token', group, entry }`. Chains
//     deeper than 3 levels are FLATTENED with underscore (matches
//     the ThemeIR convention from parse-theme.ts).
//
// Nested objects (`hover: { ... }`, `focus: { ... }` pseudo-states) →
// warning + skipped. Pseudo-state mapping is a Phase 2 feature; the
// RocketstyleIR doesn't model them today.
//
// CamelCase property names (`backgroundColor`) are converted to
// kebab-case (`background-color`) so the StyleProperty entries
// match the emit-style mapping table.

import { parseSync, type ParseResult } from 'oxc-parser'
import type { StyleProperty, StyleValue } from './emit-style'
import type {
  RocketstyleDimension,
  RocketstyleDimensionValue,
  RocketstyleIR,
} from './emit-rocketstyle'

export interface ParseRocketstyleResult {
  rocketstyles: RocketstyleIR[]
  warnings: string[]
}

// Dimension methods → IR dimension names.
const DIMENSION_METHODS: Record<string, string> = {
  states: 'state',
  sizes: 'size',
  variants: 'variant',
}

// Chain-head recognisers. `rocketstyle(Component)` is the canonical
// factory; `el` / `txt` / `list` are `@pyreon/ui-core` bases that
// internally compose rocketstyle and accept the same dimension API.
const CHAIN_HEAD_NAMES = new Set(['rocketstyle', 'el', 'txt', 'list', 'rs'])

export function parseRocketstyle(
  source: string,
  filename = 'rocketstyle.tsx',
): ParseRocketstyleResult {
  const parsed: ParseResult = parseSync(filename, source)
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0]
    throw new Error(
      `[parse-rocketstyle] failed to parse ${filename}: ${first?.message ?? 'unknown parse error'}`,
    )
  }
  const rocketstyles: RocketstyleIR[] = []
  const warnings: string[] = []
  walkProgram(parsed.program as AnyNode, rocketstyles, warnings)
  return { rocketstyles, warnings }
}

// ─── Internal helpers ────────────────────────────────────────────────

// oxc-parser's typed AST is rich; matching the convention in `parse.ts`
// we walk it loosely via `any` to keep the parser readable. The
// alternative — pinning to `{ type: string; [k: string]: unknown }` —
// makes the oxc `Program` type fail to assign here (TS2352), which is
// noise for an internal-only IR walker. The tradeoff is intentional.
//
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any

function walkProgram(
  program: AnyNode,
  rocketstyles: RocketstyleIR[],
  warnings: string[],
): void {
  const body = (program as { body?: AnyNode[] }).body ?? []
  for (const stmt of body) {
    if (stmt.type === 'VariableDeclaration') {
      collectDeclarations(stmt, rocketstyles, warnings)
    } else if (stmt.type === 'ExportNamedDeclaration') {
      const decl = (stmt as { declaration?: AnyNode }).declaration
      if (decl?.type === 'VariableDeclaration') {
        collectDeclarations(decl, rocketstyles, warnings)
      }
    }
  }
}

function collectDeclarations(
  varDecl: AnyNode,
  rocketstyles: RocketstyleIR[],
  warnings: string[],
): void {
  const decls = (varDecl as { declarations?: AnyNode[] }).declarations ?? []
  for (const d of decls) {
    const id = (d as { id?: AnyNode }).id
    const init = unwrapTSLayers((d as { init?: AnyNode }).init)
    if (!id || id.type !== 'Identifier') continue
    const name = (id as { name?: string }).name
    if (!name) continue
    if (!init) continue
    // The init is a chain — `el.config(...).states(...).sizes(...)`.
    // Walk it from the root via repeated CallExpression → MemberExpression
    // traversal, collecting dimension calls along the way.
    const chain = collectChain(init)
    if (!chain) continue
    const dimensions = chain.dimensions
    if (dimensions.length === 0) {
      // Chain head matched but no dimension methods — not rocketstyle-shape.
      continue
    }
    const parsedDims: RocketstyleDimension[] = []
    for (const dimCall of dimensions) {
      const dim = parseDimensionCall(dimCall.method, dimCall.arg, name, warnings)
      if (dim) parsedDims.push(dim)
    }
    if (parsedDims.length > 0) {
      rocketstyles.push({ name, dimensions: parsedDims })
    }
  }
}

interface ChainInfo {
  /** The recognised head's identifier name (`el`, `rocketstyle`, etc.). */
  head: string
  /** Dimension-method calls in source order. */
  dimensions: { method: string; arg: AnyNode | undefined }[]
}

/**
 * Walk a chained CallExpression/MemberExpression chain backwards from
 * the outermost call to the root identifier. Returns the chain info
 * or null if the head isn't a known rocketstyle base.
 *
 * Shape:
 *   el.config({...}).attrs({...}).theme(fn).states(fn).sizes(fn)
 *        └─MemberExpression─┘ └─MemberExpression─┘ └─...
 *
 * Each call's structure: `CallExpression { callee: MemberExpression
 * { object: <prev-CallExpression-or-Identifier>, property: <method> }, arguments: [...] }`.
 */
function collectChain(node: AnyNode): ChainInfo | null {
  const dimensions: { method: string; arg: AnyNode | undefined }[] = []
  let cur: AnyNode | undefined = node
  while (cur && cur.type === 'CallExpression') {
    const callee = unwrapTSLayers((cur as { callee?: AnyNode }).callee)
    if (!callee || callee.type !== 'MemberExpression') break
    const prop = (callee as { property?: AnyNode }).property
    if (!prop || prop.type !== 'Identifier') break
    const methodName = (prop as { name?: string }).name ?? ''
    const args = (cur as { arguments?: AnyNode[] }).arguments ?? []
    if (DIMENSION_METHODS[methodName]) {
      // Insert at the START so source-order is preserved when the
      // chain is walked bottom-up.
      dimensions.unshift({ method: methodName, arg: args[0] })
    }
    cur = unwrapTSLayers((callee as { object?: AnyNode }).object)
  }
  // Now `cur` should be the head: an Identifier (`el`) OR a
  // CallExpression to `rocketstyle(...)`.
  if (!cur) return null
  if (cur.type === 'Identifier') {
    const name = (cur as { name?: string }).name ?? ''
    if (CHAIN_HEAD_NAMES.has(name)) {
      return { head: name, dimensions }
    }
    return null
  }
  if (cur.type === 'CallExpression') {
    const callee = unwrapTSLayers((cur as { callee?: AnyNode }).callee)
    if (callee?.type === 'Identifier' && CHAIN_HEAD_NAMES.has((callee as { name?: string }).name ?? '')) {
      return { head: (callee as { name?: string }).name ?? '', dimensions }
    }
  }
  return null
}

/**
 * Parse a `.states((t) => ({ primary: {...}, ... }))` or `.sizes(...)`
 * etc. call into a RocketstyleDimension.
 */
function parseDimensionCall(
  method: string,
  arg: AnyNode | undefined,
  componentName: string,
  warnings: string[],
): RocketstyleDimension | null {
  const dimName = DIMENSION_METHODS[method]
  if (!dimName) return null
  if (!arg) return null

  const unwrapped = unwrapTSLayers(arg)
  if (!unwrapped) return null

  // Two forms: `(t) => ({ ... })` (arrow with object body) OR
  // `{ ... }` (object literal directly — rarer but valid).
  let body: AnyNode | undefined
  let themeParamName: string | null = null
  if (unwrapped.type === 'ArrowFunctionExpression') {
    const params = (unwrapped as { params?: AnyNode[] }).params ?? []
    themeParamName = readSimpleParamName(params[0])
    const arrowBody = unwrapTSLayers((unwrapped as { body?: AnyNode }).body)
    if (!arrowBody) return null
    if (arrowBody.type === 'ObjectExpression') {
      body = arrowBody
    } else if (arrowBody.type === 'BlockStatement') {
      const blockBody = (arrowBody as { body?: AnyNode[] }).body ?? []
      if (blockBody.length === 1 && blockBody[0]?.type === 'ReturnStatement') {
        body = unwrapTSLayers((blockBody[0] as { argument?: AnyNode }).argument)
      }
    }
  } else if (unwrapped.type === 'ObjectExpression') {
    body = unwrapped
  }
  if (!body || body.type !== 'ObjectExpression') {
    warnings.push(
      `[parse-rocketstyle] skipped .${method}() in '${componentName}' — could not extract object body`,
    )
    return null
  }

  // Walk the body's top-level keys: each is a dimension value name.
  const values: RocketstyleDimensionValue[] = []
  const props = (body as { properties?: AnyNode[] }).properties ?? []
  for (const prop of props) {
    if (prop.type !== 'Property' && prop.type !== 'ObjectProperty') continue
    const valueName = readKey((prop as { key?: AnyNode }).key)
    if (valueName === null) continue
    const valueBody = unwrapTSLayers((prop as { value?: AnyNode }).value)
    if (!valueBody || valueBody.type !== 'ObjectExpression') {
      warnings.push(
        `[parse-rocketstyle] skipped ${componentName}.${dimName}.${valueName} — value body is not an object literal`,
      )
      continue
    }
    const properties = parseValueProperties(
      valueBody,
      themeParamName,
      componentName,
      dimName,
      valueName,
      warnings,
    )
    values.push({ name: valueName, properties })
  }

  if (values.length === 0) return null
  return { name: dimName, values }
}

function parseValueProperties(
  body: AnyNode,
  themeParamName: string | null,
  componentName: string,
  dimName: string,
  valueName: string,
  warnings: string[],
): StyleProperty[] {
  const properties: StyleProperty[] = []
  const props = (body as { properties?: AnyNode[] }).properties ?? []
  for (const prop of props) {
    if (prop.type !== 'Property' && prop.type !== 'ObjectProperty') continue
    const propName = readKey((prop as { key?: AnyNode }).key)
    if (propName === null) continue
    const propValue = unwrapTSLayers((prop as { value?: AnyNode }).value)
    if (!propValue) continue

    // Skip nested objects (pseudo-states like `hover: { ... }`,
    // `focus: { ... }`). Pseudo-state mapping is a Phase 2 feature
    // — the RocketstyleIR doesn't model them yet.
    if (propValue.type === 'ObjectExpression') {
      warnings.push(
        `[parse-rocketstyle] skipped ${componentName}.${dimName}.${valueName}.${propName} — ` +
          `nested object (pseudo-state mapping not yet supported)`,
      )
      continue
    }

    const cssName = camelToKebab(propName)
    const value = resolveValue(propValue, themeParamName)
    if (value) {
      properties.push({ name: cssName, value })
    } else {
      warnings.push(
        `[parse-rocketstyle] skipped ${componentName}.${dimName}.${valueName}.${propName} — ` +
          `unrecognised value shape`,
      )
    }
  }
  return properties
}

function resolveValue(node: AnyNode, themeParamName: string | null): StyleValue | null {
  // Literal: string / number / boolean.
  if (node.type === 'Literal') {
    const v = (node as { value?: unknown }).value
    if (typeof v === 'string') return { kind: 'string', value: v }
    if (typeof v === 'number') return { kind: 'number', value: v }
    if (typeof v === 'boolean') return { kind: 'string', value: v ? 'true' : 'false' }
    return null
  }
  // Negative number → UnaryExpression.
  if (
    node.type === 'UnaryExpression' &&
    (node as { operator?: string }).operator === '-'
  ) {
    const arg = (node as { argument?: AnyNode }).argument
    if (arg?.type === 'Literal') {
      const v = (arg as { value?: unknown }).value
      if (typeof v === 'number') return { kind: 'number', value: -v }
    }
    return null
  }
  // Theme-member chain: `t.color.primary.base` → token ref.
  if (node.type === 'MemberExpression') {
    if (!themeParamName) return null
    return recogniseTokenRef(node, themeParamName)
  }
  return null
}

/**
 * Walk a `<themeParam>.<group>.<entry>.<...subkey>` member chain. The
 * first segment is the dimension theme parameter (`t`); the second is
 * the group; everything else flattens with underscore into the entry.
 *
 *   t.color.primary           → { group: 'color', entry: 'primary' }
 *   t.color.primary.base      → { group: 'color', entry: 'primary_base' }
 *   t.color.system.primary[500] → { group: 'color', entry: 'system_primary_500' }
 */
function recogniseTokenRef(node: AnyNode, themeParamName: string): StyleValue | null {
  const chain: string[] = []
  let cur: AnyNode | undefined = node
  while (cur && cur.type === 'MemberExpression') {
    const prop = (cur as { property?: AnyNode }).property
    if (!prop) return null
    // Property can be Identifier (`color`) or Literal (`[500]`).
    if (prop.type === 'Identifier') {
      chain.unshift((prop as { name?: string }).name ?? '')
    } else if (prop.type === 'Literal') {
      const v = (prop as { value?: unknown }).value
      if (typeof v === 'string') chain.unshift(v)
      else if (typeof v === 'number') chain.unshift(String(v))
      else return null
    } else {
      return null
    }
    cur = unwrapTSLayers((cur as { object?: AnyNode }).object)
  }
  if (!cur || cur.type !== 'Identifier') return null
  const root = (cur as { name?: string }).name ?? ''
  if (root !== themeParamName) return null
  // Need at least 2 segments: <group>, then <entry>+.
  if (chain.length < 2) return null
  const group = chain[0]!
  // Entry = everything after the group, joined with underscore (matches
  // the ThemeIR flatten convention from parse-theme.ts).
  const entry = chain.slice(1).join('_')
  return { kind: 'token', group, entry }
}

function readKey(keyNode: unknown): string | null {
  const k = keyNode as AnyNode | undefined
  if (!k) return null
  if (k.type === 'Identifier') return (k as { name?: string }).name ?? null
  if (k.type === 'Literal') {
    const v = (k as { value?: unknown }).value
    if (typeof v === 'string') return v
    if (typeof v === 'number') return String(v)
  }
  return null
}

function readSimpleParamName(node: AnyNode | undefined): string | null {
  if (!node) return null
  if (node.type === 'Identifier') return (node as { name?: string }).name ?? null
  return null
}

/**
 * Convert `backgroundColor` → `background-color`. Preserves
 * already-kebab-case strings (defensive).
 */
function camelToKebab(name: string): string {
  if (name.includes('-')) return name // already kebab
  return name.replace(/([A-Z])/g, (_m, c) => '-' + c.toLowerCase())
}

function unwrapTSLayers(node: AnyNode | undefined): AnyNode | undefined {
  if (!node) return node
  const TS_WRAPPERS = new Set([
    'TSAsExpression',
    'TSSatisfiesExpression',
    'TSTypeAssertion',
    'TSNonNullExpression',
    'TSInstantiationExpression',
    'ParenthesizedExpression',
  ])
  let cur = node
  for (let i = 0; i < 20; i++) {
    if (!TS_WRAPPERS.has(cur.type)) return cur
    const inner = (cur as { expression?: AnyNode }).expression
    if (!inner) return cur
    cur = inner
  }
  return cur
}
