/**
 * `_maskStringsAndComments` — what stops the signal-name injector from
 * writing into a user's string.
 *
 * `injectSignalNames` finds reactive-primitive calls by pattern and
 * splices `, { __sourceLocation: … }` into them. A match inside a string
 * or a comment is a false positive whose consequence is not a missed
 * name but a CORRUPTED VALUE: a template literal documenting
 * `effect(() => x)` gets the injection spliced into the string, and the
 * user's runtime data silently changes.
 *
 * So the masking has one job in each direction, and both matter. Blank
 * everything a match must not be found in, and blank NOTHING else —
 * over-masking loses real `signal()` calls, which is a silently missing
 * devtools name rather than a crash.
 *
 * Two properties hold everywhere and are asserted per shape:
 *
 *   * **length is preserved.** Offsets computed against the masked text
 *     are applied to the ORIGINAL, so a single dropped character shifts
 *     every subsequent splice by one and injects mid-token.
 *   * **newlines survive.** Line numbers are what the injected location
 *     reports, so collapsing one renumbers everything after it.
 *
 * The interesting case is `${…}` inside a template literal: its content
 * is real code that can contain a real `signal()` call, so it is kept
 * while the literal text around it is blanked — with brace depth
 * tracked, because an interpolation can hold an object literal.
 */
import { describe, expect, it } from 'vitest'
import { _maskStringsAndComments as mask } from '../index'

/** Every masked output must preserve length and line structure. */
const invariants = (src: string): string => {
  const out = mask(src)
  expect(out, 'length must be preserved — offsets are applied to the ORIGINAL')
    .toHaveLength(src.length)
  expect(out.split('\n'), 'line count must be preserved')
    .toHaveLength(src.split('\n').length)
  return out
}

describe('code outside strings and comments is untouched', () => {
  it('passes ordinary source through verbatim', () => {
    // The control. Every "is blanked" assertion below is worthless
    // against a masker that blanks everything.
    const src = 'const a = signal(0)\nconst b = computed(() => a())'
    expect(invariants(src)).toBe(src)
  })
})

describe('string literals are blanked', () => {
  for (const [label, src, mustNotSurvive] of [
    ['a double-quoted string', 'const s = "signal(0)"', 'signal(0)'],
    ['a single-quoted string', "const s = 'effect(fn)'", 'effect(fn)'],
    ['a template literal', 'const s = `computed(x)`', 'computed(x)'],
  ] as Array<[string, string, string]>) {
    it(`blanks ${label}`, () => {
      // A match here would splice the injection INSIDE the string and
      // silently change the user's runtime value.
      const out = invariants(src)
      expect(out, label).not.toContain(mustNotSurvive)
      expect(out.startsWith('const s = '), 'the surrounding code survives').toBe(true)
    })
  }

  it('does not end a string at an ESCAPED quote', () => {
    // `"a \" signal(0)"` is one string. Ending early leaves the tail as
    // code, and the injector writes into it.
    const out = invariants('const s = "a \\" signal(0)"\nconst b = 1')
    expect(out).not.toContain('signal(0)')
    expect(out).toContain('const b = 1')
  })

  it('handles an escaped BACKSLASH before the closing quote', () => {
    // `"a\\"` ends at that quote — the backslash is escaped, not the
    // quote. Reading it as an escape swallows the rest of the file.
    const out = invariants('const s = "a\\\\"\nconst t = signal(0)')
    expect(out, 'the real call after the string must survive').toContain('signal(0)')
  })

  it('preserves newlines inside a multi-line template literal', () => {
    // The injected location reports a LINE number; collapsing one
    // renumbers everything after it.
    const src = 'const s = `line one\nline two signal(0)\nline three`\nconst x = 1'
    const out = invariants(src)
    expect(out).not.toContain('signal(0)')
    expect(out.split('\n')[3]).toBe('const x = 1')
  })
})

describe('a line continuation inside a literal keeps its newline', () => {
  it('preserves `\\<LF>` in a double-quoted string', () => {
    // A backslash-newline continues a string across lines. Blanking the
    // newline collapses two source lines into one, so every injected
    // location after it reports a line number one too high — and the
    // devtools panel then points at the wrong call.
    const src = 'const s = "a \\\nb signal(0)"\nconst x = 1'
    const out = invariants(src)
    expect(out, 'the string content is still blanked').not.toContain('signal(0)')
    expect(out.split('\n')[2], 'and the following line is where it was').toBe('const x = 1')
  })

  it('preserves `\\<LF>` in a single-quoted string', () => {
    const src = "const s = 'a \\\nb'\nconst x = 1"
    expect(invariants(src).split('\n')[2]).toBe('const x = 1')
  })

  it('preserves `\\<LF>` in a template literal', () => {
    const src = 'const s = `a \\\nb effect(z)`\nconst x = 1'
    const out = invariants(src)
    expect(out).not.toContain('effect(z)')
    expect(out.split('\n')[2]).toBe('const x = 1')
  })

  it('handles a trailing backslash at end of input', () => {
    // A mid-edit save. `code[i + 1]` is undefined there, and the guard
    // is what stops it becoming the literal string "undefined".
    expect(() => invariants('const s = "a \\')).not.toThrow()
  })

  it('keeps an interpolation containing a NESTED object literal intact', () => {
    // Brace depth: `${ fn({ a: { b: 1 } }) }`. Ending at the first inner
    // `}` would leave the rest of the template as code.
    const out = invariants('const s = `${ fn({ a: { b: 1 } }) } effect(w)`')
    expect(out).toContain('fn({ a: { b: 1 } })')
    expect(out, 'and the trailing text is still literal').not.toContain('effect(w)')
  })
})

describe('comments are blanked', () => {
  it('blanks a line comment but keeps the newline', () => {
    const out = invariants('// signal(0) in a comment\nconst a = signal(1)')
    expect(out).not.toContain('signal(0)')
    expect(out, 'the real call survives').toContain('signal(1)')
  })

  it('blanks a block comment across lines', () => {
    const src = '/*\n * effect(() => x)\n */\nconst a = signal(1)'
    const out = invariants(src)
    expect(out).not.toContain('effect(')
    expect(out).toContain('signal(1)')
  })

  it('blanks a trailing block comment on a code line', () => {
    const out = invariants('const a = signal(1) /* computed(2) */')
    expect(out).toContain('signal(1)')
    expect(out).not.toContain('computed(2)')
  })

  it('does NOT treat a comment marker inside a string as a comment', () => {
    // `"// not a comment"` — treating it as one blanks the rest of the
    // line, which is harmless here but wrong, and the mirror mistake
    // (a string marker inside a comment) is not.
    const out = invariants('const s = "// x"\nconst a = signal(1)')
    expect(out).toContain('signal(1)')
  })

  it('does NOT treat a quote inside a comment as opening a string', () => {
    // `// it's fine` has one apostrophe. Opening a string there swallows
    // the rest of the file and every real call in it goes unnamed.
    const out = invariants("// it's fine\nconst a = signal(1)")
    expect(out, 'a stray apostrophe must not swallow the file').toContain('signal(1)')
  })

  it('handles an UNTERMINATED block comment without dropping characters', () => {
    // The shape a mid-edit save produces in dev.
    const src = 'const a = 1\n/* never closed\nsignal(0)'
    expect(() => invariants(src)).not.toThrow()
  })

  it('handles an UNTERMINATED string without dropping characters', () => {
    expect(() => invariants('const s = "unterminated\nconst a = 1')).not.toThrow()
  })
})

describe('a ${} interpolation is KEPT as code', () => {
  it('keeps a real call inside an interpolation', () => {
    // The whole reason interpolations are not blanked: their content is
    // code, and a `signal()` in there deserves a name like any other.
    const out = invariants('const s = `value: ${signal(0)}`')
    expect(out, 'the interpolated call is real code').toContain('signal(0)')
  })

  it('blanks the literal TEXT around the interpolation', () => {
    const out = invariants('const s = `effect(a) ${signal(0)} computed(b)`')
    expect(out).toContain('signal(0)')
    expect(out).not.toContain('effect(a)')
    expect(out).not.toContain('computed(b)')
  })

  it('tracks brace DEPTH so an object literal does not end it early', () => {
    // `${ {a: 1} }` contains a nested brace. Ending at the first `}`
    // leaves ` }` as literal text and the rest of the template as code
    // — the injector then writes into the string.
    const out = invariants('const s = `${ fn({ a: 1 }) } effect(x)`')
    expect(out).toContain('fn(')
    expect(out, 'text AFTER the interpolation is still literal').not.toContain('effect(x)')
  })

  it('handles SEVERAL interpolations in one literal', () => {
    const out = invariants('const s = `${signal(1)} mid effect(z) ${computed(2)}`')
    expect(out).toContain('signal(1)')
    expect(out).toContain('computed(2)')
    expect(out).not.toContain('effect(z)')
  })

  it('a brace inside a nested STRING ends the interpolation early — safely', () => {
    // `${ fn("}") }` — the depth counter is not string-aware, so the `}`
    // inside the string closes it. Everything after is then treated as
    // literal template text and BLANKED, which is the safe direction:
    // a real call there goes unnamed rather than a string being
    // corrupted. Pinned so a future "fix" cannot silently flip it the
    // other way.
    const out = invariants('const s = `${ fn("}") } effect(x)`\nconst a = signal(0)')
    expect(out, 'the tail is blanked, not left as code').not.toContain('effect(x)')
    expect(out, 'and real code after the literal survives').toContain('signal(0)')
  })

  it('KNOWN LIMIT: a nested template literal inside ${} is not re-masked', () => {
    // Interpolation content is passed through as code, and that
    // pass-through does not re-enter the masker — so the TEXT of a
    // template nested inside one stays visible. `effect(q)` there would
    // get an injection spliced into the string.
    //
    // Pinned rather than fixed, deliberately. The masker feeds a
    // DEV-ONLY devtools-name injection, and every other mis-parse in it
    // fails toward blanking (the spec above); this is the one that fails
    // the other way, and it needs a nested template whose literal text
    // contains a reactive-primitive call. Rewriting the scanner that all
    // of dev-mode transform depends on, to close a case that narrow, is
    // a worse trade than recording it — the same call the file already
    // makes for regex literals.
    //
    // If it is ever fixed, this spec fails and should be inverted.
    const out = invariants('const s = `${ `inner effect(q)` }`')
    expect(out, 'documented gap, not an accident').toContain('effect(q)')
  })

  it('handles an UNTERMINATED interpolation', () => {
    expect(() => invariants('const s = `${ signal(0)')).not.toThrow()
  })
})

describe('the masked text stays offset-aligned with the original', () => {
  it('keeps every index addressable after mixed content', () => {
    // The property that makes the whole approach work: a match found at
    // index N in the masked text is at index N in the source.
    const src = [
      'import { signal } from "@pyreon/reactivity" // a comment',
      '/* block */',
      'const doc = `docs for effect(fn)`',
      'const a = signal(0)',
    ].join('\n')
    const out = invariants(src)
    const at = out.indexOf('signal(0)')
    expect(at, 'the real call must be findable').toBeGreaterThan(0)
    expect(src.slice(at, at + 9), 'and at the SAME offset in the source').toBe('signal(0)')
  })

  it('is idempotent — masking masked output changes nothing', () => {
    const src = 'const s = "x" // y\nconst a = signal(0)'
    expect(mask(mask(src))).toBe(mask(src))
  })

  it('handles an empty input', () => {
    expect(mask('')).toBe('')
  })
})
