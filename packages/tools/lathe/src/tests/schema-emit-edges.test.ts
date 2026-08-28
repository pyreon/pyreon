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
    expect(emitWith('^a/b$')).not.toContain('.regex(')
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
