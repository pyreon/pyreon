// `Math.*` lowering for BOTH native targets — the members the two emitters'
// hand-maintained allowlists did not carry.
//
// THE BUG CLASS this closes: each emitter recognised a SET of Math members
// (Swift's `SWIFT_MATH_DOUBLE` + its switch, Kotlin's `JAVA_MATH_DOUBLE` +
// `KOTLIN_MATH_REMAP`), each had a test exercising exactly that set, and
// anything OUTSIDE the set fell through to a verbatim `Math.x(...)` emit with
// ZERO warnings — invalid Swift ("cannot find 'Math' in scope") and, on
// Kotlin, either an unresolved reference or a silent Int→Double argument
// mismatch. Measured on the real toolchains before this module existed:
// Swift failed `sign expm1 log1p asinh acosh atanh fround clz32 imul random`
// and every constant but `PI`; Kotlin failed `asinh acosh atanh fround clz32
// imul expm1 log1p floor(Int) ceil(Int) round(Int)` and `LN2 LN10 LOG2E
// LOG10E SQRT2 SQRT1_2`; BOTH failed the n-ary `Math.max(a, b, c)` /
// `Math.min(...)` / `Math.hypot(a, b, c)` forms that ECMAScript defines as
// variadic.
//
// This module is the TOTAL answer: every ECMAScript `Math` member either
// lowers to a form proven to compile on that target, or is WARNED BY NAME.
// It is deliberately a SEPARATE module called from ONE line in each emitter's
// existing Math branch, so the emitters' own objects stay untouched (they
// remain the fast path for the members they already handle correctly) and the
// totality lock has a single place to read its member list from.
//
// Locked by `native-math-totality.test.ts`, which pins the ECMAScript member
// list below (NOT a runtime enumeration of `Math` — a modern engine carries
// proposals like `f16round`/`sumPrecise` that are not the language surface
// PMTC promises) and asserts, on the swiftc/kotlinc TYPECHECK rung, that each
// member either compiles or warns.

/** The two PMTC targets this module lowers for. */
export type MathTarget = 'swift' | 'kotlin'

/**
 * Every ECMAScript `Math` FUNCTION, with its specified arity. `max`/`min`
 * are listed at 2 (their `length`); they are variadic and handled as such.
 */
export const ECMASCRIPT_MATH_FUNCTIONS: Readonly<Record<string, number>> = {
  abs: 1,
  acos: 1,
  acosh: 1,
  asin: 1,
  asinh: 1,
  atan: 1,
  atan2: 2,
  atanh: 1,
  cbrt: 1,
  ceil: 1,
  clz32: 1,
  cos: 1,
  cosh: 1,
  exp: 1,
  expm1: 1,
  floor: 1,
  fround: 1,
  hypot: 2,
  imul: 2,
  log: 1,
  log10: 1,
  log1p: 1,
  log2: 1,
  max: 2,
  min: 2,
  pow: 2,
  random: 0,
  round: 1,
  sign: 1,
  sin: 1,
  sinh: 1,
  sqrt: 1,
  tan: 1,
  tanh: 1,
  trunc: 1,
}

/** Every ECMAScript `Math` CONSTANT. */
export const ECMASCRIPT_MATH_CONSTANTS: readonly string[] = [
  'E',
  'LN10',
  'LN2',
  'LOG10E',
  'LOG2E',
  'PI',
  'SQRT1_2',
  'SQRT2',
]

// The IEEE-754 doubles ECMAScript specifies, written as literals on BOTH
// targets so a shared source agrees with the web bit-for-bit rather than
// depending on each platform's own constant table. `PI` is absent on purpose:
// both emitters already map the member READ (`Double.pi` / `kotlin.math.PI`),
// and this module never re-decides a mapping that already compiles.
const CONSTANT_VALUE: Readonly<Record<string, string>> = {
  E: '2.718281828459045',
  LN10: '2.302585092994046',
  LN2: '0.6931471805599453',
  LOG10E: '0.4342944819032518',
  LOG2E: '1.4426950408889634',
  SQRT1_2: '0.7071067811865476',
  SQRT2: '1.4142135623730951',
}

/** The outcome of asking this module to lower a `Math` member. */
export type MathLowering =
  /** Lowered — emit this expression verbatim. */
  | { readonly code: string }
  /** No honest lowering exists — push this warning and fall through. */
  | { readonly warn: string }
  /**
   * NOT CLAIMED: the calling emitter already handles this shape correctly.
   * Returning `null` (rather than re-deriving the mapping here) is what makes
   * the single inserted call site behaviour-preserving for every shape that
   * already compiled.
   */
  | null

export interface MathCallInput {
  readonly target: MathTarget
  /** The member name, e.g. `sqrt`. */
  readonly member: string
  /** The already-emitted argument expressions, in source order. */
  readonly args: readonly string[]
  /**
   * Per-argument "is this provably a floating-point value?", from the
   * emitter's own inference. Used only to decide Double promotion for the
   * variadic `max`/`min` and to leave a Kotlin `floor`/`ceil`/`round` over a
   * Double argument on its existing (compiling, string-locked) passthrough.
   */
  readonly argIsFloat: readonly boolean[]
}

const dbl = (target: MathTarget, x: string): string =>
  target === 'swift' ? `Double(${x})` : `(${x}).toDouble()`

const warnUnsupported = (member: string, why: string): MathLowering => ({
  warn:
    `Math.${member}(...) has no native lowering — ${why} ` +
    `Compute it in platform code, or express it with the Math members that do lower ` +
    `(see the multiplatform tier table for the supported surface).`,
})

/**
 * Lower a `Math.<member>(...)` CALL for one target.
 *
 * Returns `null` for every shape the calling emitter already lowers
 * correctly, so this can be called first in the emitter's Math branch without
 * changing any emit that compiles today.
 */
export function lowerMathCall(input: MathCallInput): MathLowering {
  const { target, member, args } = input
  const swift = target === 'swift'
  const n = args.length

  // ── Variadic in ECMAScript, fixed-arity on both platforms ──────────────
  // `Math.max(a, b, c)` fell through verbatim on BOTH targets. Nest the
  // binary form; promote to Double when ANY argument is floating-point,
  // because neither `max(Int, Double)` (Swift generic) nor
  // `Math.max(int, double)` (java.lang.Math) has a mixed overload.
  if (member === 'max' || member === 'min') {
    if (n === 2) return null // the emitters' own 2-arg forms are correct.
    // `Math.max()` is `-Infinity` and `Math.min()` is `+Infinity` in JS.
    if (n === 0) {
      const neg = member === 'max'
      return {
        code: swift
          ? neg
            ? '-Double.infinity'
            : 'Double.infinity'
          : neg
            ? 'Double.NEGATIVE_INFINITY'
            : 'Double.POSITIVE_INFINITY',
      }
    }
    const anyFloat = input.argIsFloat.some((f) => f)
    const parts = args.map((a) => (anyFloat ? dbl(target, a) : a))
    const fn = swift ? member : `Math.${member}`
    let acc = parts[parts.length - 1]!
    for (let i = parts.length - 2; i >= 0; i--) acc = `${fn}(${parts[i]!}, ${acc})`
    return { code: acc }
  }

  // `Math.hypot` is variadic too; only the 2-arg form is a platform function.
  if (member === 'hypot' && n !== 2) {
    if (n === 0) return { code: '0.0' }
    if (n === 1)
      return {
        code: swift ? `abs(${dbl(target, args[0]!)})` : `Math.abs(${dbl(target, args[0]!)})`,
      }
    // sqrt(Σ xᵢ²) via pow so each argument expression is evaluated ONCE
    // (`x * x` would emit the argument twice — wrong for any call with a
    // side effect, and a silent double-fetch for a signal read).
    const sq = args
      .map((a) => (swift ? `pow(${dbl(target, a)}, 2)` : `Math.pow(${dbl(target, a)}, 2.0)`))
      .join(' + ')
    return { code: swift ? `sqrt(${sq})` : `Math.sqrt(${sq})` }
  }

  // ── Members neither emitter carried ────────────────────────────────────
  // `clz32`/`imul` are ToUint32/ToInt32 bit operations. Reproducing their
  // wrap-around semantics from a possibly-Double, possibly-out-of-range
  // argument needs a runtime helper on both platforms (a bare
  // `Int32(truncatingIfNeeded: Int64(x))` TRAPS on NaN/±Infinity/overflow),
  // so they are named rather than half-lowered.
  if (member === 'clz32' || member === 'imul') {
    return warnUnsupported(
      member,
      'it is a 32-bit integer bit operation whose ToInt32/ToUint32 wrap-around has no trap-free expression form on Swift or Kotlin.',
    )
  }

  if (member === 'random') {
    if (n !== 0) return null
    return { code: swift ? 'Double.random(in: 0..<1)' : 'Math.random()' }
  }

  if (n !== 1) {
    // Every member below is unary; a wrong-arity call is a source bug, and
    // the emitters' existing behaviour (fall through) is left alone.
    return null
  }
  const a = args[0]!

  if (member === 'sign') {
    // Kotlin already remaps to `kotlin.math.sign`, which matches JS on NaN
    // and signed zero. Swift has no `sign` free function; the closure keeps
    // the argument evaluated ONCE and returns `x` itself for ±0/NaN, exactly
    // as ECMAScript specifies.
    if (!swift) return null
    return {
      code: `({ (x: Double) -> Double in x > 0 ? 1 : (x < 0 ? -1 : x) })(${dbl(target, a)})`,
    }
  }

  if (member === 'expm1' || member === 'log1p') {
    // Both exist on Foundation AND java.lang.Math — the Swift emit was
    // missing them entirely, and the Kotlin one reached them without the
    // Int→Double coercion java demands.
    return { code: swift ? `${member}(${dbl(target, a)})` : `Math.${member}(${dbl(target, a)})` }
  }

  if (member === 'asinh' || member === 'acosh' || member === 'atanh') {
    // Foundation free functions on Swift; `kotlin.math` on Kotlin (they are
    // NOT on java.lang.Math, which is why the passthrough was unresolved).
    return {
      code: swift ? `${member}(${dbl(target, a)})` : `kotlin.math.${member}(${dbl(target, a)})`,
    }
  }

  if (member === 'fround') {
    return {
      code: swift ? `Double(Float(${dbl(target, a)}))` : `(${dbl(target, a)}).toFloat().toDouble()`,
    }
  }

  // ── Kotlin-only: the Int-argument hole under floor/ceil/round ──────────
  // These three were documented as "already validate" and DO, for a Double
  // argument — the shape every existing test used. With an Int argument
  // java.lang.Math has no overload and kotlinc reports an argument type
  // mismatch. Claim ONLY the failing half so the Double emit (and the test
  // that pins its string) is byte-identical.
  if (!swift && (member === 'floor' || member === 'ceil' || member === 'round')) {
    if (input.argIsFloat[0] === true) return null
    return { code: `Math.${member}(${dbl(target, a)})` }
  }

  return null
}

/**
 * Lower a `Math.<member>` CONSTANT read. Returns `null` for `PI` (both
 * emitters already map it) and for anything that is not a Math constant.
 */
export function lowerMathConstant(member: string): string | null {
  return CONSTANT_VALUE[member] ?? null
}
