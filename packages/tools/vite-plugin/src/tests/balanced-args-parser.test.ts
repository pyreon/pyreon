/**
 * `_extractBalancedArgs` and `_skipStringLiteral` — the plugin's
 * paren-matcher, and the string skipper it depends on.
 *
 * This is the shape the anti-pattern catalog names directly: *"a
 * hand-rolled parser over a language with escape contexts (strings,
 * comments) MUST model those contexts before trusting its bracket
 * arithmetic"*. The matcher's whole job is to find where a call's
 * arguments end, and a paren inside a string literal is the classic way
 * to make it stop in the wrong place.
 *
 * When it stops early, the plugin transforms a TRUNCATED argument list —
 * it rewrites the user's source using text that is not the call. When it
 * runs past the end, `null` is the designed answer (the docstring says
 * regex literals are deliberately not special-cased and rely on exactly
 * that), so a `null` that silently became an over-long slice would edit
 * bytes belonging to the code after the call.
 *
 * Both failures are silent: the output is still valid-looking JavaScript,
 * just not the program the author wrote.
 */
import { describe, expect, it } from 'vitest'
import { _extractBalancedArgs, _skipStringLiteral } from '../index'

/** Extract from just past the opening paren of the FIRST `(` in `code`. */
const argsOf = (code: string): string | null =>
  _extractBalancedArgs(code, code.indexOf('(') + 1)

describe('the matcher finds where the arguments end', () => {
  it('extracts a simple argument list', () => {
    // The control. Every "does not stop early" spec below is worthless
    // against a matcher that never matches anything.
    expect(argsOf('fn(a, b)')).toBe('a, b')
  })

  it('handles NESTED parens', () => {
    expect(argsOf('fn(g(1), h(2))')).toBe('g(1), h(2)')
  })

  it('stops at the matching paren, not the last one in the file', () => {
    expect(argsOf('fn(a); other(b)')).toBe('a')
  })

  it('handles an empty argument list', () => {
    expect(argsOf('fn()')).toBe('')
  })
})

describe('parens inside a string do not move the depth', () => {
  for (const [label, code, expected] of [
    ['a double-quoted close paren', `fn("a)b")`, `"a)b"`],
    ['a single-quoted close paren', `fn('a)b')`, `'a)b'`],
    ['a backtick close paren', 'fn(`a)b`)', '`a)b`'],
    ['an OPEN paren, which would over-run', `fn("a(b")`, `"a(b"`],
  ] as Array<[string, string, string]>) {
    it(`ignores ${label}`, () => {
      // A matcher that counted these would stop mid-string (closing) or
      // run past the call entirely (opening), and the plugin would then
      // rewrite the wrong span of the user's file.
      expect(argsOf(code), label).toBe(expected)
    })
  }

  it('ignores a paren inside a string that also contains the OTHER quote', () => {
    // `"it's )"` — a matcher that ended the string at the apostrophe
    // would then treat the `)` as real.
    expect(argsOf(`fn("it's )", x)`)).toBe(`"it's )", x`)
  })

  it('honours a BACKSLASH escape, so an escaped quote does not end the string', () => {
    // `"a\\")"` is one string containing a quote and a paren. Ending it at
    // the escaped quote makes the following `)` look like the call's
    // close, and the extracted args are truncated to nothing useful.
    expect(argsOf('fn("a\\")", b)')).toBe('"a\\")", b')
  })
})

describe('unbalanced input returns null rather than a wrong slice', () => {
  it('returns null when the call is never closed', () => {
    // The designed answer, and what the docstring leans on: regex
    // literals are deliberately not special-cased because an unmatched
    // paren produces `null` rather than a bad transform.
    expect(argsOf('fn(a, b')).toBeNull()
  })

  it('returns null for an unterminated string swallowing the close', () => {
    expect(argsOf('fn("never closed')).toBeNull()
  })

  it('returns null when nesting never unwinds', () => {
    expect(argsOf('fn(g(h(1)')).toBeNull()
  })
})

describe('_skipStringLiteral lands just past the closing quote', () => {
  it('skips a plain string', () => {
    const code = `x = "abc" + y`
    const start = code.indexOf('"')
    expect(_skipStringLiteral(code, start, '"'), 'index of the CLOSING quote').toBe(
      code.lastIndexOf('"'),
    )
  })

  it('skips over an escaped quote inside', () => {
    const code = 'x = "a\\"b" + y'
    const start = code.indexOf('"')
    const end = _skipStringLiteral(code, start, '"')
    expect(code[end], 'landed on a quote').toBe('"')
    expect(end, 'and it is the LAST one, not the escaped one').toBe(code.lastIndexOf('"'))
  })

  it('skips a doubled backslash without swallowing the close', () => {
    // `"a\\\\"` ends legitimately: the two backslashes are one escaped
    // backslash, so the quote after them is the terminator. Consuming
    // them one at a time would run past it.
    const code = 'x = "a\\\\" + y'
    const start = code.indexOf('"')
    expect(_skipStringLiteral(code, start, '"')).toBe(code.lastIndexOf('"'))
  })

  it('stops at the end of input for an unterminated string', () => {
    // It must not loop forever, and must not read past the buffer.
    const code = 'x = "never closed'
    const end = _skipStringLiteral(code, code.indexOf('"'), '"')
    expect(end).toBe(code.length)
  })
})
