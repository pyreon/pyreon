/**
 * Integer arithmetic with the web's results — the ONE rule both emitters use to decide when an operator is spelled
 * through the runtimes' helpers (`PyreonNumber.swift` / `PyreonNumber.kt`) instead of the target's own operator.
 *
 * The model (stated in full beside the helpers): a JavaScript number is a double; PMTC stores a value it can prove
 * integral as a 64-bit integer (Swift `Int`, Kotlin `Long`), which is exact for every integer the web holds exactly.
 * The targets' own operators break that in three ways, each silent or fatal:
 *
 * - `+ - *` and negation TRAP on 64-bit overflow in Swift and WRAP in Kotlin (`2^62 * 4` is 0). The helpers give the
 *   web's result: exact within ±2^53, the web's double beyond, saturated past ±2^63.
 * - `%` traps (Swift) or throws (Kotlin) on a zero divisor; a Swift `Double % Double` does not compile.
 * - The bitwise operators are 64-bit, where the web's are 32-bit (`3 << 31` is -2147483648 on the web, 6442450944
 *   natively), and `>>>` / `~` had no lowering at all.
 */
import type { ExprIR, TypeIR } from './types'

export type NumericKind = 'int' | 'double' | 'other'

/** The kind of a number type for the operator rules: `Int`/`Long`, `Double`, or anything else. */
export function numericKind(t: TypeIR): NumericKind {
  if (t.kind === 'typeRef' && (t.name === 'Double' || t.name === 'Float')) return 'double'
  if (t.kind === 'typeRef' && t.name === 'Int') return 'int'
  if (t.kind !== 'number') return 'other'

  return t.float === true ? 'double' : 'int'
}

/** A tree of numeric literals only (`2`, `-1`, `(60 * 60) * 24`): folded by the target compiler, never overflowing. */
export function isNumericConstant(e: ExprIR): boolean {
  if (e.kind === 'literal') return typeof e.value === 'number'
  if (e.kind === 'unary') return (e.op === '-' || e.op === '+') && isNumericConstant(e.argument)
  if (e.kind === 'binary') return isNumericConstant(e.left) && isNumericConstant(e.right)
  if (e.kind === 'paren') return isNumericConstant(e.inner)

  return false
}

/** A literal divisor that `%` can use as-is: not 0 (NaN on the web) and not -1 (`Int.min % -1` traps in Swift). */
function isSafeDivisor(e: ExprIR): boolean {
  const v = e.kind === 'literal' ? e.value : e.kind === 'unary' && e.op === '-' && e.argument.kind === 'literal' ? -(e.argument.value as number) : undefined

  return typeof v === 'number' && Number.isInteger(v) && v !== 0 && v !== -1
}

export const BITWISE_HELPERS: Readonly<Record<string, string>> = {
  '&': 'pyreonBitAnd',
  '|': 'pyreonBitOr',
  '^': 'pyreonBitXor',
  '<<': 'pyreonShl',
  '>>': 'pyreonShr',
  '>>>': 'pyreonUshr',
}

const ARITH_HELPERS: Readonly<Record<string, string>> = {
  '+': 'pyreonAdd',
  '-': 'pyreonSub',
  '*': 'pyreonMul',
  '%': 'pyreonRem',
}

/**
 * The runtime helper an INTEGER `+ - * %` (both operands `int`) is spelled through, or `undefined` when the target's
 * own operator already gives the web's result: a constant expression, or `%` by a literal other than 0 and -1.
 */
export function integerOpHelper(op: string, left: ExprIR, right: ExprIR): string | undefined {
  const helper = ARITH_HELPERS[op]
  if (helper === undefined) return undefined
  if (isNumericConstant(left) && isNumericConstant(right)) return undefined
  if (op === '%' && isSafeDivisor(right)) return undefined

  return helper
}

/** The bitwise helper for `op` (`& | ^ << >> >>>`), or `undefined` for any other operator. */
export function bitwiseHelper(op: string): string | undefined {
  return BITWISE_HELPERS[op]
}
