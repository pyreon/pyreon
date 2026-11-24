/** A value of the wrong shape: a programmer error, so it throws. Validate user input with the `isPlain*` guards first. */
export function badValue(fn: string, expected: string, got: unknown): never {
  const shown = show(got)

  throw new TypeError(`[Pyreon] ${fn}: expected ${expected}, got ${shown}. Check user input with the matching isPlain* guard before calling.`)
}

/** A short, safe rendering of any value for an error message: it never throws, whatever the value's `toString` does. */
export function show(value: unknown): string {
  try {
    const text = typeof value === 'string' ? JSON.stringify(value) : typeof value === 'object' && value !== null ? Object.prototype.toString.call(value) : String(value)

    return text.length > 60 ? `${text.slice(0, 57)}...` : text
  } catch {
    return '(a value that cannot be printed)'
  }
}

/** A well-formed value that falls outside what the package can represent or an option that is not allowed. */
export function badRange(fn: string, message: string): never {
  throw new RangeError(`[Pyreon] ${fn}: ${message}`)
}

export const DATE_HINT = 'a PlainDate ("2026-11-18")'
export const DATETIME_HINT = 'a PlainDateTime ("2026-11-18T14:30")'
export const TIME_HINT = 'a PlainTime ("14:30", "14:30:05" or "14:30:05.250")'
export const YEARMONTH_HINT = 'a PlainYearMonth ("2026-11")'
export const ANY_HINT = 'a PlainDate ("2026-11-18"), PlainDateTime ("2026-11-18T14:30") or PlainYearMonth ("2026-11")'
