import { describe, expect, it } from 'vitest'
import type { IrDocument, IrType } from '../core/ir'
import { emitSchemas, refName, responseTypeName } from '../emit/schema'

/**
 * The parts of `emit/schema.ts` that had no tests. Two of them guard real
 * cross-target properties rather than just lines:
 *
 * `portableRegex` decides whether a `pattern` constraint becomes `.regex(…)`.
 * It is reached only through `emitSchemas`, so it is exercised here the way it
 * runs. A pattern that JS accepts and the native side does not would produce a
 * schema that validates on web and SILENTLY does not on native — the guard
 * drops the constraint instead, and dropping it is the safe half of that trade
 * only if the guard actually recognises the shapes.
 *
 * `refName` is how a response type gets wired to the schema that validates it.
 * Returning `undefined` where it should name a model means the response goes
 * unvalidated — a miss that produces working-looking output.
 */
const doc = (fields: Array<{ name: string; type: IrType; pattern?: string }>): IrDocument => ({
  title: 'T',
  version: '1',
  baseUrl: '',
  models: [
    {
      name: 'M',
      type: {
        kind: 'object',
        fields: fields.map((f) => ({
          name: f.name,
          type: f.type,
          required: true,
          nullable: false,
          ...(f.pattern === undefined ? {} : { pattern: f.pattern }),
        })),
      },
    },
  ],
  operations: [],
  notes: [],
})

const emitWith = (pattern: string): string =>
  emitSchemas(doc([{ name: 'v', type: { kind: 'string' }, pattern }]), { native: false }).build('').contents

const CR = String.fromCharCode(13)
const LS = String.fromCharCode(0x2028)
const PS = String.fromCharCode(0x2029)

/**
 * COMPILE the emitted module.
 *
 * `expect(out).not.toContain('.regex(')` passes vacuously whenever the emit is
 * broken some other way, and it says nothing about whether the file is still
 * well-formed SOURCE. The bug this guards was never a wrong constraint: a
 * `pattern` carrying a raw line terminator emitted `.regex(/a<LF>b/)`, which is
 * `Unterminated regular expression literal '/a'` — every model in the file
 * gone, not one constraint. So the assertion has to be "does this parse".
 */
const compiles = (contents: string): void => {
  const body = contents
    .replace(/^import\s+.*$/gm, '')
    .replace(/^export type .*$/gm, '')
    .replace(/^export const /gm, 'const ')
  // eslint-disable-next-line no-new-func
  new Function('s', body)
}

describe('pattern constraints — only portable regexes survive', () => {
  it('keeps an ordinary portable pattern', () => {
    expect(emitWith('^[a-z]+$')).toContain('.regex(/^[a-z]+$/)')
  })

  it.each([
    ['a lookbehind', '(?<=x)y'],
    ['a unicode property escape', '\\p{L}+'],
    ['a named backreference', '(?<n>a)\\k<n>'],
    ['a conditional group', '(?(1)a|b)'],
    ['a \\A anchor', '\\Afoo'],
    ['a \\z anchor', 'foo\\z'],
  ])('drops %s — JS may accept it where the native side does not', (_label, pattern) => {
    // Dropping is the deliberate trade: a constraint that silently fails to
    // apply on one target is worse than one that applies on neither.
    expect(emitWith(pattern)).not.toContain('.regex(')
  })

  it('drops a pattern containing a slash — it cannot be spelled as a literal', () => {
    // The emit writes `/${pattern}/`, so an unescaped `/` would terminate the
    // literal early and produce something that does not parse.
    const out = emitWith('^a/b$')
    expect(out).not.toContain('.regex(')
    expect(() => compiles(out)).not.toThrow()
  })

  it.each([
    ['LF', '\n'],
    ['CR', CR],
    ['U+2028', LS],
    ['U+2029', PS],
  ])(
    'drops a pattern containing %s — a line terminator ends a regex literal too',
    (_label, terminator) => {
      // `/` was refused from the start; the four line terminators were not, and
      // they end a literal exactly as `/` does — `RegularExpressionChar` is
      // built from `RegularExpressionNonTerminator` ("SourceCharacter but not
      // LineTerminator"), so they are illegal anywhere in one, character class
      // included. `{"pattern": "a\nb"}` is legal OpenAPI, so this was reachable
      // from a spec nobody wrote in bad faith.
      //
      // The parse assertion is the load-bearing one: pre-fix it threw
      // `Unterminated regular expression literal '/a'` and took the WHOLE
      // schemas module with it.
      const out = emitWith(`a${terminator}b`)
      expect(() => compiles(out)).not.toThrow()
      expect(out).not.toContain('.regex(')
    },
  )

  it('KEEPS a pattern carrying a raw control character', () => {
    // The refusal must be exactly the terminator set, not "anything unusual".
    // A control character is a legal `RegularExpressionNonTerminator`, so
    // dropping it would be a silent constraint loss with no cause — and this
    // spec is what stops the guard from being widened into one.
    const out = emitWith(`a${String.fromCharCode(1)}b`)
    expect(out).toContain('.regex(')
    expect(() => compiles(out)).not.toThrow()
  })

  it('drops a pattern JS itself cannot compile', () => {
    expect(emitWith('([')).not.toContain('.regex(')
  })

  it('a non-string field ignores pattern entirely', () => {
    const out = emitSchemas(
      doc([{ name: 'n', type: { kind: 'number', integer: true }, pattern: '^[0-9]+$' }]),
      { native: false },
    ).build('').contents
    expect(out).not.toContain('.regex(')
  })
})

describe('refName — how a response gets wired to its schema', () => {
  it('names a direct ref', () => {
    expect(refName({ kind: 'ref', name: 'User' })).toBe('User')
  })

  it('names the ELEMENT of an array of refs', () => {
    // A list response validates against the item schema; missing this leaves a
    // collection endpoint unvalidated while everything still compiles.
    expect(refName({ kind: 'array', items: { kind: 'ref', name: 'User' } })).toBe('User')
  })

  it('is undefined for shapes that name no model', () => {
    expect(refName(undefined)).toBeUndefined()
    expect(refName({ kind: 'string' })).toBeUndefined()
    expect(refName({ kind: 'array', items: { kind: 'string' } })).toBeUndefined()
  })
})

describe('responseTypeName', () => {
  it('is `void` when an operation returns nothing', () => {
    expect(responseTypeName(undefined)).toBe('void')
  })

  it('otherwise renders the TS type', () => {
    expect(responseTypeName({ kind: 'ref', name: 'User' })).toBe('User')
    expect(responseTypeName({ kind: 'array', items: { kind: 'ref', name: 'User' } })).toContain('User')
  })
})
