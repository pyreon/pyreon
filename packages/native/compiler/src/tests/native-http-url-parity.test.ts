// The `@pyreon/http` endpoint DSL must produce the SAME URL on every target.
//
// One source file feeds three: the web runtime builds the URL at request time
// (`buildUrl` in `@pyreon/http`'s url.ts), while PMTC bakes it into the emitted
// Swift/Kotlin at COMPILE time — which is only sound because the native path
// already refuses anything but literal params. Before this, the native side did
// a RAW substitution and assembled query pairs by hand, so
// `getUser({ params: { id: 'a b' } })` requested `/users/a%20b` on the web and
// `/users/a b` on iOS/Android, silently. A literal containing `#` truncated the
// URL at the fragment; `?` and `&` injected query structure into a path
// segment.
//
// These specs are DIFFERENTIAL on purpose: rather than asserting a
// hand-written expectation table (which would drift from the web the moment
// either side changed), each one runs the REAL web builder and asserts the
// emitted native URL is byte-identical to what it returns for the same input.
// That equality is the whole contract — it is what stops the two sides drifting
// apart again.
//
// Note the two positions genuinely need DIFFERENT encoders, which is why a
// single hand-rolled one would be wrong in both: a path segment goes through
// `encodeURIComponent` (space → `%20`, `'` kept literal) while the query goes
// through `URLSearchParams` (space → `+`, `'` → `%27`).

import { buildUrl } from '@pyreon/http'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const P = '@pyreon/primitives'
const BASE = '/api'

/**
 * Literals that are awkward in a URL. Each one is used VERBATIM to build both
 * the compiled source and the web-reference call, so the two sides can never
 * disagree about which code points are under test (a hazard for `café`, which
 * has a precomposed and a decomposed spelling).
 */
const AWKWARD: readonly string[] = [
  'a b', // space — %20 in a path, `+` in a query
  'x#y', // fragment delimiter: truncated the whole URL un-encoded
  'a?b', // query delimiter
  'a&b', // query separator
  'a+b', // must NOT survive as a literal plus
  'a/b', // segment separator — escapes the segment un-encoded
  'café', // non-ASCII
  "$'", // a `$` pattern: `String.replace` with a STRING replacement splices
  //      the text after the match here, so the id vanished entirely
]

const swiftSrc = (args: string): string => `
import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/query'
import { Stack, Text } from '${P}'
interface User { id: string }
const api = createHttp({ baseUrl: '${BASE}' })
const getUser = api.endpoint('GET /users/:id')
export function S() {
  const u = useFetch<User>(getUser(${args}))
  return <Stack><Text>{u.data()?.id ?? ''}</Text></Stack>
}
`

/**
 * Pull the baked URL out of either target's emit — Swift writes `url: "…"`,
 * Kotlin `url = "…"`. An encoded URL can never contain a `"` (it becomes
 * `%22`), so a non-greedy run to the next quote is unambiguous.
 */
function emittedUrl(code: string): string | undefined {
  return /\burl\s*[:=]\s*"([^"]*)"/.exec(code)?.[1]
}

interface Row {
  input: string
  web: string
  swift: string | undefined
  kotlin: string | undefined
}

/** Build one differential row: the web reference vs BOTH native emits. */
function compare(args: string, webUrl: string, input: string): Row {
  const s = transform(swiftSrc(args), { target: 'swift' })
  const k = transform(swiftSrc(args), { target: 'kotlin' })
  expect(s.warnings, `swift warnings for ${input}`).toEqual([])
  expect(k.warnings, `kotlin warnings for ${input}`).toEqual([])
  return { input, web: webUrl, swift: emittedUrl(s.code), kotlin: emittedUrl(k.code) }
}

const lit = (v: string): string => JSON.stringify(v)

describe('endpoint DSL — path params encode exactly as the web does', () => {
  for (const value of AWKWARD) {
    it(`bakes ${JSON.stringify(value)} byte-identically to the web builder`, () => {
      const row = compare(
        `{ params: { id: ${lit(value)} } }`,
        buildUrl(BASE, '/users/:id', { id: value }, undefined),
        value,
      )
      expect(row.swift).toBe(row.web)
      expect(row.kotlin).toBe(row.web)
    })
  }

  it('never leaves a raw delimiter in a path segment', () => {
    // The consequence, stated independently of the web builder: whatever the
    // encoding, a path param may not introduce URL STRUCTURE. `#` truncates,
    // `?`/`&` inject query params, `/` escapes the segment.
    for (const value of ['x#y', 'a?b', 'a&b', 'a/b']) {
      const row = compare(
        `{ params: { id: ${lit(value)} } }`,
        buildUrl(BASE, '/users/:id', { id: value }, undefined),
        value,
      )
      expect(row.swift).toBe(`${BASE}/users/${encodeURIComponent(value)}`)
      expect(row.swift).not.toContain('#')
      expect(row.swift?.slice(BASE.length + '/users/'.length)).not.toContain('/')
    }
  })
})

describe('endpoint DSL — query params encode exactly as the web does', () => {
  for (const value of AWKWARD) {
    it(`serializes ${JSON.stringify(value)} byte-identically to the web builder`, () => {
      const row = compare(
        `{ params: { id: '1' }, query: { q: ${lit(value)} } }`,
        buildUrl(BASE, '/users/:id', { id: '1' }, { q: value }),
        value,
      )
      expect(row.swift).toBe(row.web)
      expect(row.kotlin).toBe(row.web)
    })
  }

  it('encodes query KEYS, not just values', () => {
    const row = compare(
      `{ params: { id: '1' }, query: { "a b": 'x', "k&j": 'y' } }`,
      buildUrl(BASE, '/users/:id', { id: '1' }, { 'a b': 'x', 'k&j': 'y' }),
      'keys',
    )
    expect(row.swift).toBe(row.web)
    expect(row.kotlin).toBe(row.web)
  })

  it('repeats the key for an array value, like the web does', () => {
    const row = compare(
      `{ params: { id: '1' }, query: { tag: ['a b', 'c&d'] } }`,
      buildUrl(BASE, '/users/:id', { id: '1' }, { tag: ['a b', 'c&d'] }),
      'array',
    )
    expect(row.swift).toBe(row.web)
    expect(row.kotlin).toBe(row.web)
  })

  it('drops nullish entries, like the web does', () => {
    const row = compare(
      `{ params: { id: '1' }, query: { a: 'x', b: undefined, c: null } }`,
      buildUrl(BASE, '/users/:id', { id: '1' }, { a: 'x', b: undefined, c: null }),
      'nullish',
    )
    expect(row.swift).toBe(row.web)
    expect(row.swift).not.toContain('undefined')
    expect(row.swift).not.toContain('null')
  })

  it('keeps numbers and booleans unchanged (the pre-existing shape)', () => {
    const row = compare(
      `{ params: { id: '1' }, query: { page: 2, active: true } }`,
      buildUrl(BASE, '/users/:id', { id: '1' }, { page: 2, active: true }),
      'scalars',
    )
    expect(row.swift).toBe('/api/users/1?page=2&active=true')
    expect(row.swift).toBe(row.web)
  })
})

describe('endpoint DSL — a value that cannot lower is NAMED, never dropped', () => {
  const REACTIVE_QUERY = `
import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '${P}'
interface User { id: string }
const api = createHttp({ baseUrl: '/api' })
const getUser = api.endpoint('GET /users/:id')
export function S() {
  const q = signal('x')
  const u = useFetch<User>(getUser({ params: { id: '1' }, query: { q: q() } }))
  return <Stack><Text>{u.data()?.id ?? ''}</Text></Stack>
}
`
  it('warns by name when a query value is not a literal', () => {
    const r = transform(REACTIVE_QUERY, { target: 'swift' })
    expect(r.warnings.some((w) => w.includes('query parameter `q`'))).toBe(true)
    // The URL is still emitted — only the un-bakeable parameter is missing, and
    // the warning is what makes that visible.
    expect(r.code).toContain('/api/users/1')
  })
})

describe('endpoint DSL — the encoded URL still compiles on both toolchains', () => {
  // A URL is a string literal on both targets, so encoding cannot break a
  // compile on its own — but `%` and `+` inside an interpolated Swift string
  // and a Kotlin `$`-templated one are exactly the characters that would, so
  // the real toolchains gate it rather than a guess about escaping.
  const SRC = swiftSrc(`{ params: { id: "a b#c$'" }, query: { q: 'x y&z' } }`)

  it.runIf(isSwiftcAvailable())('typechecks against the SwiftUI stubs', () => {
    const v = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isKotlincAvailable())('typechecks against the Compose stubs', () => {
    const v = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(v.ok, v.error).toBe(true)
  })
})
