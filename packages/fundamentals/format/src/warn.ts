/**
 * Dev-only diagnostics. Each distinct message is printed once, and the set of
 * printed messages is bounded (leak class C): when it is full the oldest entry
 * is forgotten, so a flood of distinct bad values prints a few lines more
 * rather than growing the set.
 */
const MAX_WARNINGS = 64
let warned: Set<string> | undefined

export function warnOnce(key: string, message: string): void {
  if (process.env.NODE_ENV === 'production') return
  warned ??= new Set()
  if (warned.has(key)) return
  if (warned.size >= MAX_WARNINGS) warned.delete(warned.values().next().value as string)
  warned.add(key)
  // oxlint-disable-next-line no-console
  console.warn(message)
}

/** Test hook: forget printed warnings. */
export function _resetWarnings(): void {
  warned = undefined
}

/**
 * A short, safe description of a bad value for a warning (never throws, never
 * prints a huge string).
 */
export function describe(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value)
  if (typeof value === 'object' && value !== null) return Object.prototype.toString.call(value)
  return String(value)
}

/** An invalid-input warning: the formatter returns its fallback. Nullish input is not invalid and never warns. */
export function warnInvalid(fn: string, value: unknown, expected: string): void {
  if (process.env.NODE_ENV === 'production') return
  warnOnce(
    `${fn}:${typeof value}:${expected}`,
    `[Pyreon] ${fn}(): expected ${expected}, got ${describe(value)}; returning the fallback. Pass a valid value, or guard nullish/invalid data before formatting.`,
  )
}

/** A programmer error (bad option, unknown unit, unknown preset): always thrown, with the fix in the message. */
export function programmerError(fn: string, detail: string): Error {
  return new Error(`[Pyreon] ${fn}(): ${detail}`)
}
