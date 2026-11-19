/** A short, safe rendering of any value for an error message: it never throws, whatever the value's `toString` does. */
export function show(value: unknown): string {
  try {
    const text = typeof value === 'string' ? JSON.stringify(value) : typeof value === 'object' && value !== null ? safeJson(value) : String(value)

    return text.length > 80 ? `${text.slice(0, 77)}...` : text
  } catch {
    return '(a value that cannot be printed)'
  }
}

function safeJson(value: object): string {
  try {
    return JSON.stringify(value) ?? Object.prototype.toString.call(value)
  } catch {
    return Object.prototype.toString.call(value)
  }
}

/** A value of the wrong shape: a programmer error, so it throws a TypeError that names the function, the input and the fix. */
export function badValue(fn: string, expected: string, got: unknown, fix?: string): never {
  throw new TypeError(`[Pyreon] ${fn}: expected ${expected}, got ${show(got)}.${fix === undefined ? '' : ` ${fix}`}`)
}

/** A well-formed value that the function cannot honour (a rule that never occurs, a range that is too large). */
export function badRange(fn: string, message: string): never {
  throw new RangeError(`[Pyreon] ${fn}: ${message}`)
}

/**
 * Wrap a public function so that a value whose property access throws (a getter or proxy that raises) becomes the documented
 * `[Pyreon] <name>:` TypeError instead of escaping as the foreign error. Errors that are already `[Pyreon]` errors, and the
 * engine's own TypeError and RangeError (which would be a bug here, and must stay visible), pass through.
 */
export function guard<F extends (...args: never[]) => unknown>(name: string, f: F): F {
  return ((...args: never[]) => {
    try {
      return f(...args)
    } catch (error) {
      if (error instanceof Error && (error.message.startsWith('[Pyreon]') || error instanceof TypeError || error instanceof RangeError)) throw error

      return badValue(name, 'readable plain data', '(a value whose property access throws)', `Pass plain objects, arrays and strings; reading it raised: ${error instanceof Error ? error.message : String(error)}.`)
    }
  }) as F
}
