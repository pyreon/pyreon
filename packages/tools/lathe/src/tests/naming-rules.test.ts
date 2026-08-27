import { describe, expect, it } from 'vitest'
import {
  camel,
  ident,
  kebab,
  operationIdFrom,
  pascal,
  propKey,
  typeIdent,
  uniquifier,
  words,
} from '../core/naming'

/**
 * Identifier derivation, which the module's own header states as two rules: the
 * output must be a VALID identifier on every target (TS, Swift and Kotlin each
 * disagree about which spec names are legal), and the mapping must be STABLE,
 * or every regeneration of an unchanged spec is an unreviewable diff.
 *
 * Both rules fail QUIETLY when broken — a generated file that still parses but
 * names the wrong thing, or a diff nobody can review — so they are pinned here
 * rather than inferred from the emitters that happen to call these.
 */
describe('words', () => {
  it('splits camel humps, separators, and mixed input alike', () => {
    expect(words('userProfile')).toEqual(['user', 'profile'])
    expect(words('user-profile')).toEqual(['user', 'profile'])
    expect(words('user_profile')).toEqual(['user', 'profile'])
    expect(words('User Profile')).toEqual(['user', 'profile'])
  })

  it('keeps digits attached to the word they belong to', () => {
    expect(words('oauth2Token')).toEqual(['oauth2', 'token'])
  })

  it('is empty for input carrying no word characters', () => {
    expect(words('---')).toEqual([])
    expect(words('')).toEqual([])
  })
})

describe('the empty-input floor', () => {
  // A spec CAN carry a name that reduces to nothing (`"---"`, `""`). Returning
  // '' would emit `const  = …`, which does not parse; each of these has an
  // explicit floor, and all three were untested.
  it.each([
    ['camel', camel, '_'],
    ['pascal', pascal, '_'],
    ['kebab', kebab, '_'],
  ])('%s returns a placeholder rather than an empty string', (_n, fn, expected) => {
    expect(fn('---')).toBe(expected)
    expect(fn('')).toBe(expected)
  })
})

describe('ident / typeIdent — valid on every target', () => {
  it('PREFIXES a leading digit rather than dropping it', () => {
    // Stated in the source, and the reason matters: dropping the digit collides
    // two distinct spec names onto one identifier, and the failure mode is a
    // generated file that overwrites half of itself.
    expect(ident('2fa')).toBe('_2fa')
    expect(typeIdent('2fa')).toBe('_2fa')
    // The collision this prevents: `2fa` and `fa` must not converge.
    expect(ident('2fa')).not.toBe(ident('fa'))
  })

  it.each([
    ['a TypeScript keyword', 'class'],
    ['a Swift keyword', 'protocol'],
    ['a Kotlin keyword', 'fun'],
  ])('suffixes %s, because the reserved set is the UNION of all three', (_label, word) => {
    // A spec is free to name a field `fun`. It is legal in TS and not in Kotlin,
    // so the union is what keeps one generated client from compiling and its
    // sibling from not.
    expect(ident(word)).toBe(`${word}_`)
  })

  it('leaves an ordinary name untouched', () => {
    expect(ident('userProfile')).toBe('userProfile')
    expect(typeIdent('user-profile')).toBe('UserProfile')
  })
})

describe('propKey — quoted only when it has to be', () => {
  it('leaves a plain identifier bare', () => {
    expect(propKey('id')).toBe('id')
    expect(propKey('_private')).toBe('_private')
    expect(propKey('$ref')).toBe('$ref')
  })

  it('quotes anything else', () => {
    expect(propKey('content-type')).toBe('"content-type"')
    expect(propKey('2fa')).toBe('"2fa"')
  })

  it('escapes U+2028 / U+2029, which JSON.stringify leaves RAW', () => {
    // Both are line terminators in JavaScript source even though they are legal
    // inside a JSON string — so an unescaped one ENDS the emitted literal and
    // the generated file stops parsing.
    expect(propKey('a b')).toContain('\\u2028')
    expect(propKey('a b')).toContain('\\u2029')
    expect(propKey('a b')).not.toContain(' ')
  })
})

describe('operationIdFrom — deterministic when a spec omits operationId', () => {
  it('strips path-parameter braces and camel-joins', () => {
    expect(operationIdFrom('GET', '/users/{id}/posts')).toBe('getUsersIdPosts')
  })

  it('gives DISTINCT routes distinct ids', () => {
    // Collision-free matters more than pretty: two routes sharing an id
    // overwrite each other in the generated client.
    expect(operationIdFrom('GET', '/users')).not.toBe(operationIdFrom('POST', '/users'))
    expect(operationIdFrom('GET', '/users')).not.toBe(operationIdFrom('GET', '/posts'))
  })

  it('is stable across calls — regenerating an unchanged spec must not churn', () => {
    expect(operationIdFrom('GET', '/users/{id}')).toBe(operationIdFrom('GET', '/users/{id}'))
  })
})

describe('uniquifier', () => {
  it('leaves the first occurrence alone and numbers the rest', () => {
    const u = uniquifier()
    expect([u('get'), u('get'), u('get')]).toEqual(['get', 'get2', 'get3'])
  })

  it('counts each name independently', () => {
    const u = uniquifier()
    expect([u('a'), u('b'), u('a')]).toEqual(['a', 'b', 'a2'])
  })

  it('is per-instance — two namespaces do not share a counter', () => {
    expect(uniquifier()('x')).toBe(uniquifier()('x'))
  })
})
