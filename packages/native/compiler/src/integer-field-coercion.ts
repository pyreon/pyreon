// A Double-typed VALUE stored into an INTEGER-typed struct field.
//
// TS `number` has no int/float split, so a struct field `id: number` lowers to the integer default (Swift `Int` /
// Kotlin `Long`) unless an initializer proves it fractional. Several JavaScript globals return a whole number that
// the native lowering types Double: `Date.now()` (epoch ms — Double because `Date().timeIntervalSince1970 * 1000`
// is), and `Math.floor` / `ceil` / `round` / `trunc` (Double so `Math.floor(a / b) * b` stays one domain). Neither
// target converts implicitly at an initializer argument or a `.copy(…)` argument, so
// `todos.update((t) => [...t, { id: Date.now(), title }])` compiled with zero warnings and failed both builds.
//
// The value side decides the lowering:
//
// - WHOLE by construction (`isWholeValued`) — the conversion is exact, so it converts: Swift `pyreonInt(…)`, Kotlin
//   `(…).toLong()`, and `Date.now()` is spelled directly in integer milliseconds on both (always finite).
//   A whole-valued expression can still be NON-FINITE at runtime (`Math.floor(NaN)`, `Math.round(x / 0)`), where
//   Swift's `Int(_:)` TRAPS. `pyreonInt` (runtime-swift PyreonNumber.swift) is Kotlin's `Double.toLong()` — NaN is
//   0, ±Infinity and out-of-range values saturate — so the two targets store the same value and neither crashes.
//   JavaScript would store `NaN`, which no integer field can hold.
// - Anything else Double (`Math.random()`, a division, a `: Double` parameter) — truncating would silently change
//   the value the web stores, so it is left as written and NAMED: the author declares the field `Double`.
//
// Shared by both emitters so the two cannot disagree about which values convert.

import type { ExprIR, TypeIR } from './types'

/** A struct field whose native type is the INTEGER `number` (or an optional of one). */
export function typeWantsInteger(t: TypeIR): boolean {
  if (t.kind === 'number') return t.float !== true
  if (t.kind === 'typeRef') return t.name === 'Int' || t.name === 'Long'
  if (t.kind === 'union') {
    const real = t.branches.filter((b) => b.kind !== 'null' && b.kind !== 'undefined')
    return real.length === 1 && typeWantsInteger(real[0]!)
  }
  return false
}

/** True for `Date.now()` exactly — its integer spelling replaces the Double one rather than wrapping it. */
export function isDateNowCall(e: ExprIR): boolean {
  return (
    e.kind === 'call' &&
    e.args.length === 0 &&
    e.callee.kind === 'member' &&
    e.callee.object.kind === 'identifier' &&
    e.callee.object.name === 'Date' &&
    e.callee.property === 'now'
  )
}

const WHOLE_MATH = new Set(['floor', 'ceil', 'round', 'trunc'])

/**
 * The value is a whole number in JavaScript for every FINITE input it can take, so converting it to an integer is
 * exact (NaN/Infinity have no integer on either target; the emitters' conversion maps them the same way on both). `isIntegerTyped` answers for operands the
 * inferencer already types as an integer.
 */
export function isWholeValued(e: ExprIR, isIntegerTyped: (e: ExprIR) => boolean): boolean {
  switch (e.kind) {
    case 'literal':
      return typeof e.value === 'number' && Number.isInteger(e.value)
    case 'paren':
      return isWholeValued(e.inner, isIntegerTyped)
    case 'unary':
      return (e.op === '-' || e.op === '+') && isWholeValued(e.argument, isIntegerTyped)
    case 'binary':
      return (
        (e.op === '+' || e.op === '-' || e.op === '*' || e.op === '%') &&
        isWholeValued(e.left, isIntegerTyped) &&
        isWholeValued(e.right, isIntegerTyped)
      )
    case 'ternary':
      return isWholeValued(e.then, isIntegerTyped) && isWholeValued(e.otherwise, isIntegerTyped)
    case 'call':
      if (isDateNowCall(e)) return true
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        e.callee.object.name === 'Math' &&
        WHOLE_MATH.has(e.callee.property) &&
        e.args.length === 1
      ) {
        return true
      }
      return isIntegerTyped(e)
    default:
      return isIntegerTyped(e)
  }
}

/** The named warning for a fractional value stored into an integer field — truncating it would change the data. */
export function fractionalIntoIntegerFieldWarning(
  structName: string,
  field: string,
  target: 'Swift' | 'Kotlin',
): string {
  const native = target === 'Swift' ? 'Int' : 'Long'
  return (
    `\`${structName}.${field}\` is \`number\` and lowers to an INTEGER (${target} \`${native}\`) — no initializer ` +
    `gives it a fractional value — but it is assigned a value that is a Double natively, so the native build fails ` +
    `with a type mismatch. If the field holds fractions, declare \`type Double = number\` and type it ` +
    `\`${field}: Double\`; if it is always whole, round the value (\`Math.round(…)\` / \`Math.floor(…)\`), which ` +
    `converts exactly.`
  )
}
