// ============================================================================
// `@pyreon/rocketstyle` native FRONTEND — the first per-package native-lowering
// module under the "per-package compiler" architecture.
//
// Shape (per-package frontend → shared native backend):
//   rocketstyle chain  ──[this module]──▶  style-object ExprIR  ──[connector]──▶  native
//
// A `const Btn = rocketstyle()({ name, component: Stack }).theme(t => ({…}))
//   .states({ primary: {…}, danger: {…} }).sizes({ medium: {…} })`
// is captured here as { tag: primitive, base, dims }. At each `<Btn state="primary"
// size="medium">` use-site the emit RESOLVES the dimension props → merges
// base ∪ matched-dims into ONE style object → reuses the styled(Prim) rewrite
// (→ `<Prim style={merged}>`), so the whole inline-style connector lowers it.
//
// This module owns ONLY rocketstyle's construct → style-object IR. It does NOT
// know about SwiftUI/Compose — that's the shared connector backend
// (style-to-native.ts). rocketstyle-native → connector mirrors the runtime
// composition (rocketstyle → styler). A user's own package could ship a sibling
// frontend the same way.
//
// SCOPE: a CANONICAL-PRIMITIVE base (`component: Stack`); STATIC string
// dimensions (`state="primary"`, the `useBooleans:false` default) merge into one
// object; ONE DYNAMIC dimension (`state={cond ? 'primary' : 'danger'}`) lowers to
// a TERNARY of two resolved objects → the connector's reactive conditional-value
// path (a native runtime state flip — see resolveRocketstyleUseSite). Literal +
// theme-token declaration values (`t.color.primary`, via the theme-native
// frontend) both resolve. Remaining follow-up: ≥2 simultaneous dynamic dims (a
// switch over the dimension-set PRODUCT) — warns + falls back to the first branch.
// ============================================================================

import { isCanonicalPrimitive } from './canonical-primitives'
import { DEFAULT_THEME, resolveThemeToken, type ThemeTable } from './theme-native'
import type { ExprIR, RocketstyleComponentIR } from './types'

export type { RocketstyleComponentIR }

// oxc's AST is walked loosely, matching parse.ts / parse-rocketstyle.ts.
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any

const DIMENSION_METHODS: Record<string, string> = {
  states: 'state',
  sizes: 'size',
  variants: 'variant',
}
const TS_WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
  'TSNonNullExpression',
  'TSInstantiationExpression',
  'ParenthesizedExpression',
])

function unwrap(node: AnyNode | undefined): AnyNode | undefined {
  let cur = node
  for (let i = 0; i < 20 && cur; i++) {
    if (!TS_WRAPPERS.has(cur.type)) return cur
    cur = cur.expression
  }
  return cur
}

/**
 * Parse a `rocketstyle()({name, component: Prim}).theme(…).states(…)…` chain
 * from a var-declarator `init`. Returns null if it isn't a rocketstyle chain
 * over a canonical primitive (a warning is pushed for a non-primitive base).
 */
export function parseRocketstyleDefn(
  name: string,
  init: AnyNode | undefined,
  warnings: string[],
  theme: ThemeTable = DEFAULT_THEME,
): RocketstyleComponentIR | null {
  const chainTop = unwrap(init)
  if (!chainTop || chainTop.type !== 'CallExpression') return null

  // Walk the chain bottom-up, collecting .theme + dimension calls.
  let themeArg: AnyNode | undefined
  const dimCalls: { dim: string; arg: AnyNode | undefined }[] = []
  let cur: AnyNode | undefined = chainTop
  while (cur && cur.type === 'CallExpression') {
    const callee = unwrap(cur.callee)
    if (!callee || callee.type !== 'MemberExpression') break
    const prop = callee.property
    if (!prop || prop.type !== 'Identifier') break
    const method = prop.name as string
    const arg = (cur.arguments as AnyNode[])?.[0]
    if (method === 'theme') themeArg = arg
    else if (DIMENSION_METHODS[method]) dimCalls.unshift({ dim: DIMENSION_METHODS[method]!, arg })
    // else (.attrs/.config/…) — walked through, ignored.
    cur = unwrap(callee.object)
  }

  // Head must be the CURRIED `rocketstyle(cfg)({ name, component: Prim })`.
  const prim = readCurriedPrimitive(cur)
  if (prim === null) return null // not a rocketstyle-over-anything chain
  if (!isCanonicalPrimitive(prim)) {
    warnings.push(
      `rocketstyle(...)({ component: ${prim} }) on '${name}': only a CANONICAL @pyreon/primitives ` +
        `base (Stack/Text/Button/…) lowers to native — '${prim}' has no native primitive, so <${name}> ` +
        `was left unresolved. Base your multiplatform component on a canonical primitive.`,
    )
    return null
  }

  const base = themeArg ? styleFromDimBody(themeArg, name, 'theme', warnings, theme) : emptyObject()
  const dims: RocketstyleComponentIR['dims'] = {}
  for (const { dim, arg } of dimCalls) {
    dims[dim] = dimensionMap(arg, name, dim, warnings, theme)
  }
  return { name, tag: prim, base, dims }
}

/**
 * The chain head is `rocketstyle(cfg)({ name, component: Prim })` — a call whose
 * callee is ITSELF a `rocketstyle(...)` call (the curry). Read the canonical
 * primitive identifier from the inner config object's `component` field.
 * Returns null if the head isn't a rocketstyle curry.
 */
function readCurriedPrimitive(head: AnyNode | undefined): string | null {
  const h = unwrap(head)
  if (!h || h.type !== 'CallExpression') return null
  const innerCall = unwrap(h.callee)
  if (
    !innerCall ||
    innerCall.type !== 'CallExpression' ||
    unwrap(innerCall.callee)?.type !== 'Identifier' ||
    unwrap(innerCall.callee)?.name !== 'rocketstyle'
  ) {
    return null
  }
  const cfg = unwrap((h.arguments as AnyNode[])?.[0])
  if (!cfg || cfg.type !== 'ObjectExpression') return null
  for (const p of (cfg.properties as AnyNode[]) ?? []) {
    if (p.type !== 'Property' && p.type !== 'ObjectProperty') continue
    if (p.key?.name === 'component' || p.key?.value === 'component') {
      const v = unwrap(p.value)
      if (v?.type === 'Identifier') return v.name as string
      if (v?.type === 'Literal' && typeof v.value === 'string') return v.value as string
    }
  }
  return null
}

/** A dimension arg — `{ primary: {…}, danger: {…} }` or `(t) => ({ … })` —
 *  → { valueName: styleObject }. */
function dimensionMap(
  arg: AnyNode | undefined,
  compName: string,
  dim: string,
  warnings: string[],
  theme: ThemeTable,
): Record<string, Extract<ExprIR, { kind: 'object' }>> {
  const obj = unwrapDimBody(arg)
  const out: Record<string, Extract<ExprIR, { kind: 'object' }>> = {}
  if (!obj || obj.type !== 'ObjectExpression') return out
  for (const p of (obj.properties as AnyNode[]) ?? []) {
    if ((p.type !== 'Property' && p.type !== 'ObjectProperty') || p.computed) continue
    const valueName = p.key?.name ?? p.key?.value
    if (typeof valueName !== 'string') continue
    out[valueName] = objectExprToStyleObject(unwrap(p.value), compName, `${dim}.${valueName}`, warnings, theme)
  }
  return out
}

/** `.theme((t) => ({ … }))` / `.theme({ … })` → the base style object. */
function styleFromDimBody(
  arg: AnyNode | undefined,
  compName: string,
  where: string,
  warnings: string[],
  theme: ThemeTable,
): Extract<ExprIR, { kind: 'object' }> {
  const obj = unwrapDimBody(arg)
  return objectExprToStyleObject(obj, compName, where, warnings, theme)
}

/** Unwrap a `(t) => ({ … })` arrow (or block `return {…}`) to the object literal;
 *  a bare `{ … }` passes through. */
function unwrapDimBody(arg: AnyNode | undefined): AnyNode | undefined {
  const a = unwrap(arg)
  if (!a) return undefined
  if (a.type === 'ArrowFunctionExpression') {
    const body = unwrap(a.body)
    if (body?.type === 'ObjectExpression') return body
    if (body?.type === 'BlockStatement') {
      const stmts = (body.body as AnyNode[]) ?? []
      const ret = stmts.find((s) => s.type === 'ReturnStatement')
      return ret ? unwrap(ret.argument) : undefined
    }
    return undefined
  }
  return a
}

/**
 * An object literal (`{ backgroundColor: '#2563eb', padding: 8 }`) → a style
 * object ExprIR (camelCase keys already; literal values only). A non-literal
 * value (theme-token member `t.color.primary`, a ternary, a call) → dropped +
 * warned (theme-token resolution is the tracked follow-up).
 */
function objectExprToStyleObject(
  obj: AnyNode | undefined,
  compName: string,
  where: string,
  warnings: string[],
  theme: ThemeTable,
): Extract<ExprIR, { kind: 'object' }> {
  const fields: { name: string; value: ExprIR }[] = []
  const dropped: string[] = []
  if (obj && obj.type === 'ObjectExpression') {
    for (const p of (obj.properties as AnyNode[]) ?? []) {
      if ((p.type !== 'Property' && p.type !== 'ObjectProperty') || p.computed) continue
      const key = p.key?.name ?? p.key?.value
      if (typeof key !== 'string') continue
      const v = unwrap(p.value)
      if (v?.type === 'Literal' && (typeof v.value === 'string' || typeof v.value === 'number')) {
        fields.push({ name: key, value: { kind: 'literal', value: v.value } })
      } else if (v?.type === 'UnaryExpression' && v.operator === '-' && v.argument?.type === 'Literal') {
        fields.push({ name: key, value: { kind: 'literal', value: -Number(v.argument.value) } })
      } else {
        // A theme-token reference (`t.color.primary`) → resolve to its value via
        // the theme-native frontend; anything else (a runtime expression) drops.
        const tok = resolveThemeToken(v, theme)
        if (tok !== null) fields.push({ name: key, value: { kind: 'literal', value: tok } })
        else dropped.push(key)
      }
    }
  }
  if (dropped.length > 0) {
    warnings.push(
      `rocketstyle(...) '${compName}' ${where}: non-literal value(s) [${dropped.join(', ')}] — a theme ` +
        `token / expression (e.g. t.color.primary) is not yet lowered to native (dropped). Use a literal ` +
        `for now; compile-time theme-token resolution is a tracked follow-up.`,
    )
  }
  return { kind: 'object', fields, spreads: [] }
}

function emptyObject(): Extract<ExprIR, { kind: 'object' }> {
  return { kind: 'object', fields: [], spreads: [] }
}

/** A style-object Map → the object ExprIR the connector consumes. */
function toStyleObject(m: Map<string, ExprIR>): Extract<ExprIR, { kind: 'object' }> {
  return {
    kind: 'object',
    fields: [...m.entries()].map(([name, value]) => ({ name, value })),
    spreads: [],
  }
}

/** A string-literal ExprIR's value, else null. */
function literalStringValue(e: ExprIR | undefined): string | null {
  return e?.kind === 'literal' && typeof e.value === 'string' ? e.value : null
}

/**
 * Resolve a rocketstyle component at a use-site into the style value to inject
 * as `<Prim style={…}>`. Two shapes:
 *
 * - STATIC dims (`<Btn state="primary" size="md">`) → merge base ∪ each matched
 *   dimension's set into ONE object (later dims override earlier; dims override
 *   base — the rocketstyle cascade).
 * - ONE DYNAMIC dim (`<Btn state={cond ? 'primary' : 'danger'}>`) → a TERNARY of
 *   two resolved objects (base ∪ static-dims ∪ each branch's set), handed to the
 *   connector's dynamic path (`emitDynamic`) so each shared property lowers to a
 *   REACTIVE conditional-value modifier — the native equivalent of a runtime
 *   `state` flip. This reuses the exact `style={cond ? {A} : {B}}` machinery.
 *
 * `readStaticDim(dim)` → the resolved static string value (or undefined).
 * `readDimAttr(dim)` → the raw attr ExprIR (for ternary detection).
 * `warn` surfaces an unlowerable shape (≥2 dynamic dims → a switch over the
 * dimension-set product is a follow-up; a ternary whose branches aren't both
 * declared dimension values).
 */
export function resolveRocketstyleUseSite(
  rkt: RocketstyleComponentIR,
  readStaticDim: (dimName: string) => string | undefined,
  readDimAttr?: (dimName: string) => ExprIR | undefined,
  warn?: (msg: string) => void,
): Extract<ExprIR, { kind: 'object' | 'ternary' }> {
  const dynamics: { dim: string; cond: ExprIR; a: string; b: string }[] = []
  const staticVals: { dim: string; value: string }[] = []
  for (const dim of Object.keys(rkt.dims)) {
    const attr = readDimAttr?.(dim)
    if (attr?.kind === 'ternary') {
      const a = literalStringValue(attr.then)
      const b = literalStringValue(attr.otherwise)
      const sets = rkt.dims[dim]!
      if (a !== null && b !== null && sets[a] && sets[b]) {
        dynamics.push({ dim, cond: attr.cond, a, b })
      } else {
        warn?.(
          `<${rkt.name} ${dim}={cond ? … : …}>: a dynamic dimension must be a ternary of TWO DECLARED ${dim} ` +
            `values (e.g. ${dim}={cond ? 'primary' : 'danger'}) — these branches aren't both declared ${dim}s, ` +
            `so the dimension was dropped.`,
        )
      }
      continue
    }
    const s = readStaticDim(dim)
    if (s !== undefined) staticVals.push({ dim, value: s })
  }

  // base ∪ static-matched dims — the shared foundation of both branches.
  const baseFields = new Map<string, ExprIR>()
  for (const f of rkt.base.fields) baseFields.set(f.name, f.value)
  for (const { dim, value } of staticVals) {
    const set = rkt.dims[dim]?.[value]
    if (set) for (const f of set.fields) baseFields.set(f.name, f.value)
  }

  if (dynamics.length === 0) return toStyleObject(baseFields)

  if (dynamics.length > 1) {
    warn?.(
      `<${rkt.name}>: more than one dynamic dimension prop (${dynamics.map((d) => d.dim).join(', ')}) — a ` +
        `native switch over the PRODUCT of dimension sets is a tracked follow-up; each dynamic dim was ` +
        `resolved to its FIRST branch (static). Use at most one dynamic dimension for a reactive flip.`,
    )
    for (const d of dynamics) {
      const set = rkt.dims[d.dim]?.[d.a]
      if (set) for (const f of set.fields) baseFields.set(f.name, f.value)
    }
    return toStyleObject(baseFields)
  }

  // Exactly one dynamic dim → a ternary of the two resolved style objects.
  const { dim, cond, a, b } = dynamics[0]!
  const branch = (value: string): Extract<ExprIR, { kind: 'object' }> => {
    const m = new Map(baseFields)
    const set = rkt.dims[dim]?.[value]
    if (set) for (const f of set.fields) m.set(f.name, f.value)
    return toStyleObject(m)
  }
  return { kind: 'ternary', cond, then: branch(a), otherwise: branch(b) }
}
