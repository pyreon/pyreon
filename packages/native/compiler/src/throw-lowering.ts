// Lowering of `try` / `catch` / `finally` and `throw`.
//
// The two targets have different error models, and the difference decides the whole design:
//
// - Kotlin exceptions are UNCHECKED, like JavaScript's. `throw` and `try` lower one-to-one and nothing about a function's
//   signature changes.
// - Swift errors are CHECKED. A function that can throw must say `throws`, every call to it must be marked `try`, and a
//   `try` is legal only inside a `do` body or another `throws` function. A JS helper that throws therefore changes its
//   Swift SIGNATURE, and that change propagates to every helper that calls it without catching — a fixed point over the
//   helper set ({@link computeThrowingFunctions}).
//
// What has no checked-error equivalent at all is a throw that NOTHING catches in a closure that cannot throw — an event
// handler, an effect. (A callback of a rethrowing array method — `xs.map(s => { throw … })` — is NOT one: the error
// propagates out of the call on every target, see `RETHROWING_ARRAY_METHODS`.) On the web that error is reported and the app keeps running. Natively an uncaught Kotlin
// exception terminates the app, and Swift has no way to let one escape a non-throwing closure, so the emit terminates
// there too (`fatalError` / `try!`): the two native targets then agree with each other, and the compiler names the
// position in a warning so the author can add the `try`/`catch` that makes all three agree.

import { syncThrowingPluginExpr } from './registry-lookup'
import type { ExprIR, StatementIR } from './types'

/** Every nested statement list of `s` — the one place that knows which statement kinds own a body. */
export function childStatementLists(s: StatementIR): StatementIR[][] {
  switch (s.kind) {
    case 'if':
      return s.elseBody ? [s.then, s.elseBody] : [s.then]
    case 'while':
    case 'do-while':
    case 'for-of':
    case 'for-range':
      return [s.body]
    case 'switch':
      return s.cases.map((c) => c.body)
    case 'try': {
      const out = [s.body]
      if (s.catchBody) out.push(s.catchBody)
      if (s.finallyBody) out.push(s.finallyBody)
      return out
    }
    default:
      return []
  }
}

/** The name the runtime-free message accessor is emitted under, on both targets. */
export const ERROR_MESSAGE_FN = 'pyreonErrorMessage'
/** `String(e)` for a caught error — `Error: message`, as JavaScript renders it. */
export const ERROR_STRING_FN = 'pyreonErrorString'

/**
 * JS array methods whose Swift lowering is a standard-library `rethrows` method (`map`, `filter`, `forEach`,
 * `first(where:)`, `contains(where:)`, `allSatisfy`, `reduce`, `flatMap`, `firstIndex(where:)`). A callback passed to
 * one of these may throw, and the error propagates out of the call — exactly as on the web and in Kotlin (whose
 * inline lambdas propagate too). Every other closure is its own throw context.
 */
export const RETHROWING_ARRAY_METHODS: ReadonlySet<string> = new Set([
  'map',
  'filter',
  'forEach',
  'find',
  'findIndex',
  'some',
  'every',
  'reduce',
  'flatMap',
])

/** Whether `arrow` (a callback) lets an error escape its own body. */
export function arrowThrowsUncaught(arrow: unknown, throwingFns: ReadonlySet<string>): boolean {
  const a = arrow as { kind?: string; body?: unknown; stmts?: StatementIR[]; async?: boolean }
  if (a.kind !== 'arrow' || a.async === true) return false
  if (a.stmts !== undefined && a.stmts.length > 0) return statementsThrowUncaught(a.stmts, throwingFns)
  return exprCallsThrowing(a.body, throwingFns)
}

/** The callback arguments of `<recv>.<rethrowing method>(cb…)` whose body throws, or `[]`. */
export function rethrowingCallbackArgs(expr: unknown, throwingFns: ReadonlySet<string>): readonly unknown[] {
  const n = expr as { kind?: string; callee?: { kind?: string; property?: string }; args?: unknown[] }
  if (n.kind !== 'call' || n.callee?.kind !== 'member' || n.callee.property === undefined) return []
  if (!RETHROWING_ARRAY_METHODS.has(n.callee.property)) return []
  return (n.args ?? []).filter((a) => arrowThrowsUncaught(a, throwingFns))
}

/** Whether `expr` calls one of `throwingFns` (or `JSON.parse`, or a plugin call that throws) OUTSIDE any nested arrow (an arrow's body is its own throw context). */
export function exprCallsThrowing(expr: unknown, throwingFns: ReadonlySet<string>): boolean {
  const walk = (n: unknown): boolean => {
    if (Array.isArray(n)) return n.some(walk)
    if (n === null || typeof n !== 'object') return false
    const node = n as { kind?: string; callee?: { kind?: string; name?: string } }
    if (node.kind === 'arrow') return false
    // A throwing callback of a rethrowing array method throws out of the CALL (`xs.map(s => { throw … })`).
    if (rethrowingCallbackArgs(n, throwingFns).length > 0) return true
    // `JSON.parse` throws on malformed input — natively on a shape mismatch too.
    if (node.kind === 'json-parse') return true
    // A plugin call that throws synchronously (`Pet.parse(x)`), declared by its owner.
    if (node.kind === 'ext-expr' && syncThrowingPluginExpr(node as ExprIR) !== undefined) return true
    if (
      node.kind === 'call' &&
      node.callee?.kind === 'identifier' &&
      node.callee.name !== undefined &&
      throwingFns.has(node.callee.name)
    )
      return true
    return Object.values(n).some(walk)
  }
  return walk(expr)
}

/** The expressions a statement evaluates directly (not those of its nested statement lists). */
function ownExprs(s: StatementIR): unknown[] {
  switch (s.kind) {
    case 'let':
      return [s.expr]
    case 'assign':
      return [s.target, s.value]
    case 'if':
    case 'while':
    case 'do-while':
      return [s.cond]
    case 'return':
      return s.expr ? [s.expr] : []
    case 'expr':
      return [s.expr]
    case 'for-of':
      return [s.iterable]
    case 'for-range':
      return [s.from, s.to, s.step]
    case 'switch':
      return [s.discriminant, ...s.cases.flatMap((c) => c.tests)]
    case 'throw':
      return s.message ? [s.message] : []
    default:
      return []
  }
}

/**
 * Whether `body` can let an error ESCAPE: a `throw`, or a call to a throwing helper, that no enclosing `try`/`catch`
 * of this same function catches. A nested arrow is not walked — it is its own throw context.
 */
export function statementsThrowUncaught(
  body: readonly StatementIR[],
  throwingFns: ReadonlySet<string>,
): boolean {
  for (const s of body) {
    if (s.kind === 'throw') return true
    if (ownExprs(s).some((e) => exprCallsThrowing(e, throwingFns))) return true
    if (s.kind === 'try') {
      // A caught body cannot escape; the catch and finally bodies can.
      if (s.catchBody === undefined && statementsThrowUncaught(s.body, throwingFns)) return true
      if (s.catchBody && statementsThrowUncaught(s.catchBody, throwingFns)) return true
      if (s.finallyBody && statementsThrowUncaught(s.finallyBody, throwingFns)) return true
      continue
    }
    if (childStatementLists(s).some((l) => statementsThrowUncaught(l, throwingFns))) return true
  }
  return false
}

/** Whether `body` contains a `try` or a `throw` anywhere (outside nested arrows) — the cheap gate for the passes. */
export function statementsUseThrow(body: readonly StatementIR[]): boolean {
  return body.some(
    (s) => s.kind === 'throw' || s.kind === 'try' || childStatementLists(s).some(statementsUseThrow),
  )
}

/**
 * The helpers whose Swift signature needs `throws`: those whose body lets an error escape, closed over calls — a
 * helper that calls a throwing helper without catching throws too. Iterates to a fixed point; each pass can only
 * ADD a name, so it terminates in at most `fns.length` passes.
 */
export function computeThrowingFunctions(
  fns: readonly { name: string; body: readonly StatementIR[] }[],
): Set<string> {
  const throwing = new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    for (const f of fns) {
      if (throwing.has(f.name)) continue
      if (statementsThrowUncaught(f.body, throwing)) {
        throwing.add(f.name)
        changed = true
      }
    }
  }
  return throwing
}

/**
 * Rewrite `<param>.message` inside a catch body to `pyreonErrorMessage(<param>)`. The caught value is a Swift `Error`
 * / Kotlin `Exception`, neither of which has a non-optional `message` of its own, so the read goes through the
 * emitted accessor. A nested arrow that rebinds `param` shadows it and is left alone.
 */
export function rewriteCaughtMessage(stmts: StatementIR[], param: string): StatementIR[] {
  const map = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.map(map)
    if (n === null || typeof n !== 'object') return n
    const node = n as {
      kind?: string
      params?: string[]
      object?: { kind?: string; name?: string }
      property?: string
    }
    if (node.kind === 'arrow' && node.params?.includes(param)) return n
    // `(e as Error).message` — the cast TypeScript requires on an `unknown` binding parses to a paren layer.
    if (node.kind === 'member' && node.property === 'message' && isParam(node.object)) {
      const call: ExprIR = {
        kind: 'call',
        callee: { kind: 'identifier', name: ERROR_MESSAGE_FN },
        args: [{ kind: 'identifier', name: param }],
      }
      return call
    }
    // `String(e)` — Swift has no `String(_:)` for an `Error`; both targets describe it as JavaScript does.
    const call = n as { kind?: string; callee?: { kind?: string; name?: string }; args?: unknown[] }
    if (
      call.kind === 'call' &&
      call.callee?.kind === 'identifier' &&
      call.callee.name === 'String' &&
      call.args?.length === 1 &&
      isParam(call.args[0])
    ) {
      const described: ExprIR = {
        kind: 'call',
        callee: { kind: 'identifier', name: ERROR_STRING_FN },
        args: [{ kind: 'identifier', name: param }],
      }
      return described
    }
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(n)) out[k] = map(v)
    return out
  }
  const isParam = (n: unknown): boolean => {
    let cur = n as { kind?: string; name?: string; inner?: unknown } | null
    while (cur?.kind === 'paren') cur = cur.inner as typeof cur
    return cur?.kind === 'identifier' && cur.name === param
  }
  return map(stmts) as StatementIR[]
}

/** Whether a statement list or an expression tree contains `await` (outside nested arrows). */
export function containsAwait(n: unknown): boolean {
  if (Array.isArray(n)) return n.some(containsAwait)
  if (n === null || typeof n !== 'object') return false
  const node = n as { kind?: string }
  if (node.kind === 'arrow') return false
  if (node.kind === 'await') return true
  return Object.values(n).some(containsAwait)
}

/** The warning for a throw / throwing call that nothing catches in a closure that cannot throw. */
export function uncaughtThrowWarning(what: string): string {
  return (
    `${what} is not inside a \`try\`/\`catch\` and runs in a closure that cannot throw (an event handler, an effect, a ` +
    `callback). On the web the error is reported and the app keeps running; natively an uncaught error TERMINATES the ` +
    `app — Kotlin by its own exception semantics, Swift via \`fatalError\`/\`try!\` so the two targets agree. Wrap it ` +
    `in \`try { … } catch (e) { … }\` to handle it on every target.`
  )
}

/**
 * The native error value. `raw` marks a thrown STRING (`throw 'plain'`): JavaScript stringifies that as the string
 * itself, and an `Error` as `Error: <message>`, so `String(e)` and `` `${e}` `` describe the two differently.
 */
export const SWIFT_THROWN_PREAMBLE = `private struct PyreonThrown: Error, CustomStringConvertible {
    let message: String
    var raw: Bool = false
    var description: String { raw ? message : "Error: \\(message)" }
}
private func ${ERROR_MESSAGE_FN}(_ e: Error) -> String {
    (e as? PyreonThrown)?.message ?? (e as? LocalizedError)?.errorDescription ?? String(describing: e)
}
private func ${ERROR_STRING_FN}(_ e: Error) -> String { String(describing: e) }`

export const KOTLIN_THROWN_PREAMBLE = `private class PyreonThrown(message: String, private val raw: Boolean = false) : Exception(message) {
    override fun toString(): String = if (raw) message.orEmpty() else "Error: $message"
}
private fun ${ERROR_MESSAGE_FN}(e: Throwable): String = e.message ?: e.toString()
private fun ${ERROR_STRING_FN}(e: Throwable): String = e.toString()`
