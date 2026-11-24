/**
 * The ECMAScript number constants: the globals `NaN` / `Infinity` and the `Number.*` statics.
 *
 * They used to reach the output verbatim — `NaN` is "cannot find 'NaN' in scope" on Swift and an unresolved
 * reference on Kotlin, with no warning — so shared code spelled a gap `0.0 / 0.0`, which kotlinc flags as a
 * "division by zero" in every app compiling it. Every one of them is a Double on both targets, as on the web.
 */
type Target = 'swift' | 'kotlin'

const GLOBALS: Readonly<Record<string, Record<Target, string>>> = {
  NaN: { swift: 'Double.nan', kotlin: 'Double.NaN' },
  Infinity: { swift: 'Double.infinity', kotlin: 'Double.POSITIVE_INFINITY' },
}

const NUMBER_STATICS: Readonly<Record<string, Record<Target, string>>> = {
  NaN: GLOBALS.NaN!,
  POSITIVE_INFINITY: GLOBALS.Infinity!,
  NEGATIVE_INFINITY: { swift: '(-Double.infinity)', kotlin: 'Double.NEGATIVE_INFINITY' },
  MAX_VALUE: { swift: 'Double.greatestFiniteMagnitude', kotlin: 'Double.MAX_VALUE' },
  // JS `Number.MIN_VALUE` is the smallest POSITIVE subnormal — Kotlin's `Double.MIN_VALUE`, Swift's
  // `leastNonzeroMagnitude` (Swift's `leastNormalMagnitude` is a different, larger number).
  MIN_VALUE: { swift: 'Double.leastNonzeroMagnitude', kotlin: 'Double.MIN_VALUE' },
  EPSILON: { swift: 'Double.ulpOfOne', kotlin: 'Math.ulp(1.0)' },
}

/** The native spelling of a bare `NaN` / `Infinity`, or undefined for any other name. */
export function lowerNumberGlobal(name: string, target: Target): string | undefined {
  return Object.hasOwn(GLOBALS, name) ? GLOBALS[name]![target] : undefined
}

/** The native spelling of `Number.<member>` for a Double constant, or undefined. */
export function lowerNumberStatic(member: string, target: Target): string | undefined {
  return Object.hasOwn(NUMBER_STATICS, member) ? NUMBER_STATICS[member]![target] : undefined
}

/** Whether `name` is one of the global number constants (typed Double by the inference). */
export function isNumberGlobal(name: string): boolean {
  return Object.hasOwn(GLOBALS, name)
}

/** Whether `Number.<member>` is a Double constant this module lowers. */
export function isNumberStatic(member: string): boolean {
  return Object.hasOwn(NUMBER_STATICS, member)
}
