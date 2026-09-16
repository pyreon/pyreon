/**
 * Target-language string-literal quoters for the PMTC emitters.
 */

/**
 * A Kotlin STRING LITERAL for a JS string — the ONE quoting path every emit
 * site goes through. `JSON.stringify` is not a Kotlin quoter: it leaves `$`
 * unescaped (Kotlin's interpolation marker — `"due: $total"` silently READ
 * the signal `total`, so one source rendered differently on iOS and Android,
 * and an unbound name was a compile error), and it emits `\f` / `\b`, which
 * Kotlin's grammar does not have. Every C0/DEL control and the two JS line
 * separators go out as `\uXXXX`. Non-strings (numbers, booleans, null,
 * objects) keep `JSON.stringify` exactly as before.
 */
export function kotlinStr(v: unknown): string {
  if (typeof v !== 'string') return JSON.stringify(v)
  let out = '"'
  for (const ch of v) {
    switch (ch) {
      case '\\':
        out += '\\\\'
        break
      case '"':
        out += '\\"'
        break
      case '$':
        out += '\\$'
        break
      case '\n':
        out += '\\n'
        break
      case '\r':
        out += '\\r'
        break
      case '\t':
        out += '\\t'
        break
      case '\b':
        out += '\\b'
        break
      default: {
        const c = ch.codePointAt(0)!
        out +=
          c < 0x20 || c === 0x7f || c === 0x2028 || c === 0x2029
            ? `\\u${c.toString(16).padStart(4, '0')}`
            : ch
      }
    }
  }
  return out + '"'
}

/**
 * A Swift STRING LITERAL for a JS string — the ONE quoting path every emit
 * site goes through. `JSON.stringify` is not a Swift quoter: it emits `\b`,
 * `\f` and `\uXXXX`, none of which Swift's grammar has (Swift spells a code
 * point `\u{X}`), so a control character in a string was a compile error.
 * Backslash is escaped FIRST, which is what makes a literal `\(` in the
 * source inert (`\\(`) — no separate interpolation step, and no chance of
 * re-escaping the output of an earlier step into `\\\(`, which Swift reads as
 * an escaped backslash followed by a LIVE interpolation. Non-strings keep
 * `JSON.stringify` exactly as before.
 */
export function swiftStr(v: unknown): string {
  if (typeof v !== 'string') return JSON.stringify(v)
  let out = '"'
  for (const ch of v) {
    switch (ch) {
      case '\\':
        out += '\\\\'
        break
      case '"':
        out += '\\"'
        break
      case '\n':
        out += '\\n'
        break
      case '\r':
        out += '\\r'
        break
      case '\t':
        out += '\\t'
        break
      case '\0':
        out += '\\0'
        break
      default: {
        const c = ch.codePointAt(0)!
        out +=
          c < 0x20 || c === 0x7f || c === 0x2028 || c === 0x2029 ? `\\u{${c.toString(16)}}` : ch
      }
    }
  }
  return out + '"'
}
