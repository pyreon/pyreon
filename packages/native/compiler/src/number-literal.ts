// Which numeric literals are a Double natively — one rule for the inference, the parse refinements and both emitters.
//
// A fractional literal (`12.5`) is a Double. So is a WHOLE literal outside the 32-bit range (`3000000000`, an
// epoch-millisecond timestamp): every typing pass has always read it as Double (it is how time-series data is written,
// and JavaScript has one number type). The emitters must spell it as one too. They printed it as an integer literal,
// so a declaration with no expected type (`const big = 3000000000` → Swift `let big = 3000000000`, Kotlin
// `val big = 3000000000L`) was an integer while everything that read it expected a Double: `String(big)` emitted
// `pyreonNumString(big)`, which takes a Double, and swiftc rejected it.

/** The 32-bit bound past which a whole literal is read as a Double. */
const INT32_MAX = 2147483647

/** Whether a numeric literal's VALUE makes it a Double (fractional, or whole but outside the 32-bit range). */
export function isDoubleLiteralValue(value: number): boolean {
  return !Number.isInteger(value) || Math.abs(value) > INT32_MAX
}

/**
 * The source spelling of a whole-valued literal as a Double on both targets: `3000000000.0`. JavaScript prints a large
 * value in exponent form (`1e+21`), which is already a Double literal in Swift and Kotlin and takes no `.0`.
 */
export function wholeDoubleLiteral(value: number): string {
  const text = String(value)
  return /[eE.]/.test(text) || !Number.isFinite(value) ? text : `${text}.0`
}
