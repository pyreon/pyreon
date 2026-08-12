// THE WEB ARM of the router query-parsing parity contract.
//
// The same cases, in the same order, are asserted against the native routers:
//   - packages/native/router-swift/Tests/.../PyreonRouterTests.swift
//     (PyreonRouterQueryTests.testParseQuery)
//   - packages/native/router-kotlin/src/test/.../PyreonRouterTest.kt
//     ("parseQuery matches URLSearchParams semantics")
//
// Why it exists: those two asserted the same answers as each OTHER, but both
// were written against what I believed the web did. Two implementations
// agreeing is mirrored parity, not proven parity — if the belief were wrong,
// all three would agree on the wrong answer and every gate would stay green.
// This arm measures the web instead of assuming it.
//
// It matters more here than it looks. `useUrlState` binds app state to these
// parsed values, so a divergence is not a formatting difference — it is the
// same URL producing different STATE on web and on device.
//
// The three cannot share one literal table (two are Swift and Kotlin), so the
// contract is review-enforced; this arm fails FIRST if the web semantics move,
// and names the two files to update.

import { describe, expect, it } from 'vitest'
import { resolveRoute } from '../match'

const ROUTES = [{ path: '/p', component: () => null }] as never
const q = (raw: string): Record<string, string> =>
  resolveRoute(raw ? `/p?${raw}` : '/p', ROUTES).query as Record<string, string>

describe('router query parsing — web arm of the native parity contract', () => {
  it('parses ordinary pairs', () => {
    expect(q('q=cat&page=2')).toEqual({ q: 'cat', page: '2' })
  })

  // A bare key is PRESENT with an empty value, matching URLSearchParams —
  // not absent, and not `true`.
  it('treats a bare key as present-with-empty-value', () => {
    expect(q('flag')).toEqual({ flag: '' })
  })

  // Last wins, which is what URLSearchParams.get() returns. First-wins would
  // be a defensible choice and is the WRONG one — it just has to match.
  it('keeps the LAST value for a repeated key', () => {
    expect(q('a=1&a=2')).toEqual({ a: '2' })
  })

  it('yields an empty object for no query', () => {
    expect(q('')).toEqual({})
  })

  it('decodes + as a space', () => {
    expect(q('q=two+words')).toEqual({ q: 'two words' })
  })

  it('percent-decodes', () => {
    expect(q('q=a%26b')).toEqual({ q: 'a&b' })
  })
})
