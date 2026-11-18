// An optional value turned into text — a template-literal interpoland, a `'text' + x` operand, `String(x)`.
//
// JavaScript prints an absent value as `undefined` (or `null`) and a present one as itself. Swift's `"\(x)"` over an
// optional prints its DEBUG description — `Optional(3)` / `Optional("b")` / `nil` — and Kotlin's `"${x}"` prints
// `null` for both absences. Both compile without a PMTC warning (Swift's own warning was never read), so
// `` `Picked: ${xs.find(p)}` `` read `Picked: Optional(2)` on iOS. Every such position goes through the runtimes'
// `pyreonOptionalText(value, absent)`, which prints the present value as the web does (a Double through
// `pyreonNumberString`) and the absent one with the spelling the TypeScript type names.
import type { ExprIR, TypeIR } from './types'

/**
 * How the web spells an absent value of type `t`, or `null` when `t` is not optional. A type that admits
 * `undefined` (an optional field, `.find`, `.at`, `?.`) prints `undefined`; one that only admits `null` prints `null`.
 */
export function absentSpelling(t: TypeIR): 'undefined' | 'null' | null {
  if (t.kind === 'undefined') return 'undefined'
  if (t.kind === 'null') return 'null'
  if (t.kind !== 'union') return null
  if (t.branches.some((b) => b.kind === 'undefined')) return 'undefined'
  if (t.branches.some((b) => b.kind === 'null')) return 'null'

  return null
}

/**
 * The absent spelling for an interpoland: its inferred type's, or `undefined` for `map.get(k)` (typed `unknown` by
 * the inference, and `undefined` on the web for a missing key).
 */
export function interpolandAbsentSpelling(
  expr: ExprIR,
  infer: (e: ExprIR) => TypeIR,
): 'undefined' | 'null' | null {
  const own = absentSpelling(infer(expr))
  if (own !== null) return own
  // `a?.b.c` / `a?.m()` is absent whenever `a` is, whatever the inference says about `c`.
  if (hasOptionalChain(expr)) return 'undefined'
  if (
    expr.kind === 'call' &&
    expr.callee.kind === 'member' &&
    expr.callee.property === 'get' &&
    expr.args.length === 1 &&
    infer(expr.callee.object).kind === 'map'
  ) {
    return 'undefined'
  }

  return null
}

/** `pyreonOptionalText(<emitted>, "<spelling>")` — the same spelling on both targets (`""` for a JSX text child). */
export function optionalTextCall(emitted: string, spelling: 'undefined' | 'null' | ''): string {
  return `pyreonOptionalText(${emitted}, "${spelling}")`
}


/** Whether `expr` reads through an optional chain (`a?.b`, `a?.m()`) anywhere along its receiver path. */
export function hasOptionalChain(expr: ExprIR): boolean {
  let e: ExprIR = expr
  for (;;) {
    if (e.kind === 'member') {
      if (e.optional === true) return true
      e = e.object
    } else if (e.kind === 'call') {
      if (e.optional === true) return true
      e = e.callee
    } else if (e.kind === 'index') {
      if (e.optional === true) return true
      e = e.object
    } else {
      return false
    }
  }
}

/**
 * A JSX text child the inference cannot prove present: `unknown` (a plugin-owned read such as `q.data`, `q.error`,
 * `push.token`, `flow.edges[0].type`) or a struct a plugin may hold optionally (`useFetch<T>().data` is `T` to the
 * inference and `T?` on native until the request resolves). It renders through `pyreonOptionalText` with the JSX
 * spelling `""` — correct for a present value too. Template literals do not take this path: there the Swift
 * typecheck gate names any optional left.
 */
export function isUntypedTextChild(t: TypeIR): boolean {
  return t.kind === 'unknown' || t.kind === 'typeRef' || t.kind === 'object'
}
