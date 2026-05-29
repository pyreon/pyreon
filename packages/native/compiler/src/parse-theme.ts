// `@pyreon/ui-theme`-source → ThemeIR parser.
//
// The token emitter (`emit-tokens.ts`) was written first against
// hand-built ThemeIR. This module is the input side — walks a real
// TypeScript theme module (the canonical export shape from
// `@pyreon/ui-theme`) and produces ThemeIR ready for emission.
//
// Per the PMTC plan §"Same dimensions": Pyreon's design-system theme
// is the canonical source of design tokens; the native compiler emits
// per-target token tables (Swift CGFloat, Kotlin dp) that ALL emitted
// code references. This parser closes the gap between "the compiler
// has a fixed token table at build time" and "the compiler reads the
// app's real `@pyreon/ui-theme` source as input".
//
// ## Supported theme shapes
//
// The canonical theme is `export default const theme = { ... }` with
// top-level keys mapping to groups. Per the @pyreon/ui-theme source:
//
//   - **1-level scalars** (`rootSize: 16`) — promoted to a `globals`
//     group entry.
//   - **2-level groups** (`spacing: { xs: 4, sm: 8 }`) — direct map
//     to ThemeGroup with ThemeEntry children. The structural common
//     case (spacing, fontSize, fontWeight, borderRadius, breakpoints,
//     etc.).
//   - **3+ level nesting** (`color.system.light.base: 'rgba(...)'`,
//     `zIndex.popover.content: 101`) — FLATTENED with underscore
//     separator (`color: { system_light_base: '...' }`). Lossless,
//     reversible; consumer code references
//     `PyreonTokens.Color.system_light_base`. A future structural
//     refactor can introduce sub-groups when the emit shape grows
//     to support them.
//
// ## Value-type inference
//
// Theme values get a `ThemeValue` kind based on shape:
//   - Pure integers in spacing-like groups → `dp` on Kotlin (carries
//     the `.dp` suffix), `cgfloat` on Swift
//   - Pure integers elsewhere → `number`
//   - Strings → `string`
//   - Floats → `number` (fallback; emitter renders as-is)
//
// Group-name heuristic for the spacing-like inference: matches the
// canonical theme's units convention. Keys named `spacing`,
// `fontSize`, `headingSize`, `elementSize`, `borderWidth`,
// `borderRadius`, `lineHeight` → numeric values are emitted as
// platform-specific length types. Other groups → plain numbers.

import { parseSync, type ParseResult } from 'oxc-parser'
import type { ThemeIR, ThemeGroup, ThemeEntry, ThemeValue } from './emit-tokens'

// Groups whose numeric values are platform-length types (CGFloat / dp).
// Matches the canonical `@pyreon/ui-theme` units convention.
const LENGTH_GROUPS = new Set([
  'spacing',
  'fontSize',
  'headingSize',
  'elementSize',
  'borderWidth',
  'borderRadius',
  'breakpoints',
  'lineHeight',
])

/**
 * Public API: parse a `@pyreon/ui-theme`-shaped TypeScript module
 * source into a `ThemeIR`. Throws if no theme object is found.
 *
 * @param source     TS source containing `const theme = { … }` or
 *                   `export default { … }`.
 * @param filename   Used in error messages + thrown diagnostics.
 *
 * Returns `{ ir: ThemeIR, warnings: string[] }`. `warnings` carries
 * non-fatal notes (e.g. 3-level keys that were flattened, deeper
 * keys skipped, non-scalar leaf values).
 */
export interface ParseThemeResult {
  ir: ThemeIR
  warnings: string[]
}

export function parseTheme(source: string, filename = 'theme.ts'): ParseThemeResult {
  const parsed: ParseResult = parseSync(filename, source)
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0]
    throw new Error(
      `[parse-theme] failed to parse ${filename}: ${first?.message ?? 'unknown parse error'}`,
    )
  }
  const themeObject = findThemeObject(parsed.program)
  if (!themeObject) {
    throw new Error(
      `[parse-theme] no theme object found in ${filename}. Expected ` +
        `\`const theme = { ... }\` or \`export default { ... }\`.`,
    )
  }
  const warnings: string[] = []
  const groups: ThemeGroup[] = []
  const globals: ThemeEntry[] = []

  for (const prop of themeObject.properties as AnyNode[]) {
    if (prop.type !== 'Property' && prop.type !== 'ObjectProperty') continue
    const keyName = readKey(prop.key)
    if (keyName === null) continue
    const value = prop.value
    if (isScalarLiteral(value)) {
      // Top-level scalar — promote to globals group.
      const tv = literalToThemeValue(value, 'globals')
      if (tv) globals.push({ name: keyName, value: tv })
    } else if (value.type === 'ObjectExpression') {
      // Top-level object — emit as a ThemeGroup. Walk one level deep;
      // flatten deeper.
      const entries = collectGroupEntries(value, keyName, warnings)
      if (entries.length > 0) {
        groups.push({ name: keyName, entries })
      }
    } else {
      warnings.push(
        `[parse-theme] skipped top-level key '${keyName}' — unsupported value type '${value.type}'`,
      )
    }
  }

  if (globals.length > 0) {
    // Prepend so token emit groups read globals first.
    groups.unshift({ name: 'globals', entries: globals })
  }

  return { ir: { groups }, warnings }
}

// ─── Internal helpers ────────────────────────────────────────────────

// oxc-parser's typed AST is rich; matching the convention in `parse.ts`
// we walk it loosely via `any` to keep the parser readable. The
// alternative — pinning to `{ type: string; [k: string]: unknown }` —
// makes the oxc `Program` type fail to assign here (TS2345), which is
// noise for an internal-only IR walker. The tradeoff is intentional.
//
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any

/**
 * Walk the parsed program looking for the theme object literal.
 * Recognises:
 *   1. `const theme = { … }`
 *   2. `export default { … }`
 *   3. `export default theme` (resolved by walking back to (1))
 */
function findThemeObject(program: AnyNode): AnyNode | null {
  const body = (program as { body?: AnyNode[] }).body ?? []
  let themeBinding: AnyNode | null = null

  // First pass — find `const theme = { ... }`. Unwrap TS layers
  // (`TSAsExpression`, `TSSatisfiesExpression`, `TSTypeAssertion`,
  // parens) the canonical theme carries on the RHS (`as const`).
  for (const stmt of body) {
    if (stmt.type === 'VariableDeclaration') {
      const decls = (stmt as { declarations?: AnyNode[] }).declarations ?? []
      for (const d of decls) {
        const id = (d as { id?: AnyNode }).id
        const init = unwrapTSLayers((d as { init?: AnyNode }).init)
        if (
          id?.type === 'Identifier' &&
          (id as { name?: string }).name === 'theme' &&
          init?.type === 'ObjectExpression'
        ) {
          themeBinding = init
        }
      }
    }
  }

  // Second pass — find `export default ...` (object literal directly
  // or identifier resolving back to themeBinding).
  for (const stmt of body) {
    if (stmt.type === 'ExportDefaultDeclaration') {
      const decl = unwrapTSLayers((stmt as { declaration?: AnyNode }).declaration)
      if (!decl) continue
      if (decl.type === 'ObjectExpression') return decl
      if (
        decl.type === 'Identifier' &&
        (decl as { name?: string }).name === 'theme' &&
        themeBinding
      ) {
        return themeBinding
      }
    }
  }

  return themeBinding
}

/**
 * Strip TypeScript-only AST layers that wrap an expression without
 * changing its runtime value: `as const`, `as Theme`, `satisfies T`,
 * `<T>expr`, and grouping parens. The canonical `@pyreon/ui-theme`
 * theme module ends with `} as const`, so this is load-bearing.
 */
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
  // Bound to a reasonable depth — these wrappers don't legitimately
  // stack 20+ deep in real code.
  for (let i = 0; i < 20; i++) {
    if (!TS_WRAPPERS.has(cur.type)) return cur
    const inner = (cur as { expression?: AnyNode }).expression
    if (!inner) return cur
    cur = inner
  }
  return cur
}

function readKey(keyNode: unknown): string | null {
  const k = keyNode as AnyNode | undefined
  if (!k) return null
  if (k.type === 'Identifier') return (k as { name?: string }).name ?? null
  if (k.type === 'Literal') {
    const v = (k as { value?: unknown }).value
    // String key: `'data-test': 1` → 'data-test'. Numeric key:
    // `900: '#EEE'` (canonical color subgroup convention) → '900'.
    // Both stringify to a usable property name in the emit.
    if (typeof v === 'string') return v
    if (typeof v === 'number') return String(v)
  }
  return null
}

function isScalarLiteral(node: AnyNode): boolean {
  if (node.type === 'Literal') return true
  // oxc emits `UnaryExpression` for negative numbers (`-1` → `{ operator: '-', argument: Literal }`).
  if (
    node.type === 'UnaryExpression' &&
    (node as { operator?: string }).operator === '-' &&
    (node as { argument?: AnyNode }).argument?.type === 'Literal'
  ) {
    return true
  }
  return false
}

function literalToThemeValue(node: AnyNode, groupName: string): ThemeValue | null {
  // Negative-number UnaryExpression.
  if (node.type === 'UnaryExpression') {
    const arg = (node as { argument?: AnyNode }).argument
    if (!arg || arg.type !== 'Literal') return null
    const inner = literalToThemeValue(arg, groupName)
    if (!inner) return null
    if (inner.kind === 'number' || inner.kind === 'cgfloat' || inner.kind === 'dp') {
      return { ...inner, value: -inner.value }
    }
    return null
  }

  const value = (node as { value?: unknown }).value
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'number') {
    // Use length-type for spacing-like groups so the emitter picks the
    // right per-target type (CGFloat / dp). The ThemeIR has separate
    // `cgfloat` + `dp` kinds; we pick `dp` here (the Kotlin emitter
    // outputs `value.dp`; the Swift emitter degrades dp → CGFloat).
    // Picking ONE kind keeps the IR target-agnostic; the emitter
    // makes the per-target call.
    if (LENGTH_GROUPS.has(groupName)) return { kind: 'dp', value }
    return { kind: 'number', value }
  }
  if (typeof value === 'boolean') return { kind: 'string', value: value ? 'true' : 'false' }
  return null
}

function collectGroupEntries(
  obj: AnyNode,
  groupName: string,
  warnings: string[],
  prefix = '',
): ThemeEntry[] {
  const entries: ThemeEntry[] = []
  const props = (obj as { properties?: AnyNode[] }).properties ?? []
  for (const prop of props) {
    if (prop.type !== 'Property' && prop.type !== 'ObjectProperty') continue
    const keyName = readKey((prop as { key?: AnyNode }).key)
    if (keyName === null) continue
    const value = (prop as { value?: AnyNode }).value
    if (!value) continue
    const entryName = prefix ? `${prefix}_${keyName}` : keyName
    if (isScalarLiteral(value)) {
      const tv = literalToThemeValue(value, groupName)
      if (tv) entries.push({ name: entryName, value: tv })
      else
        warnings.push(`[parse-theme] skipped '${groupName}.${entryName}' — non-emittable literal`)
    } else if (value.type === 'ObjectExpression') {
      // Nested object — flatten with underscore. The canonical theme
      // does this for color subgroups (`color.system.light.base`) and
      // zIndex (`zIndex.popover.content`). The emit shape stays flat;
      // the consumer-visible name is `Color.system_light_base` etc.
      // Warn ONCE per flattening (any nesting beyond 2-level total —
      // i.e. entering recursion from the top group means going to
      // 3-level absolute depth, which is the structural flatten case).
      warnings.push(
        `[parse-theme] flattened ${groupName}.${entryName}.* — nested object collapses ` +
          `to underscore-joined names (no structural sub-grouping at the emit layer yet)`,
      )
      const nested = collectGroupEntries(value, groupName, warnings, entryName)
      entries.push(...nested)
    } else {
      warnings.push(
        `[parse-theme] skipped '${groupName}.${entryName}' — unsupported value type '${value.type}'`,
      )
    }
  }
  return entries
}
