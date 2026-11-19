/** A short, safe rendering of any value for an error message: it never throws, whatever the value's `toString` does. */
export function show(value: unknown): string {
  try {
    const text =
      typeof value === 'string'
        ? JSON.stringify(value)
        : typeof value === 'object' && value !== null
          ? Object.prototype.toString.call(value)
          : typeof value === 'bigint'
            ? `${value}n`
            : String(value)

    return text.length > 60 ? `${text.slice(0, 57)}...` : text
  } catch {
    return '(a value that cannot be printed)'
  }
}

/** A value of the wrong shape: a programmer error, so it throws a message that names the function, the value and the fix. */
export function badValue(fn: string, expected: string, got: unknown, fix = ''): never {
  throw new TypeError(`[Pyreon] ${fn}: expected ${expected}, got ${show(got)}.${fix === '' ? '' : ` ${fix}`}`)
}

/** A well-formed value that is not allowed (out of range, a mix of currencies, a zero divisor). */
export function badRange(fn: string, message: string): never {
  throw new RangeError(`[Pyreon] ${fn}: ${message}`)
}
