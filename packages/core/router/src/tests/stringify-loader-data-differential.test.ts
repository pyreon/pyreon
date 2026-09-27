/**
 * `stringifyLoaderData` moved to native `JSON.stringify` (no replacer) for
 * speed. The contract is BYTE-IDENTICAL output to the previous
 * replacer-based implementation, which is reproduced verbatim below as the
 * oracle, over a seeded corpus of the shapes loaders actually return plus the
 * adversarial ones: functions and symbols inside objects AND arrays, `toJSON`,
 * shared references, script-context characters.
 */
import { describe, expect, it } from 'vitest'
import { stringifyLoaderData } from '../loader'

/** The pre-change implementation, minus cycle detection (inputs are acyclic). */
function oracle(loaderData: Record<string, unknown>): string {
  const replacer = (_key: string, value: unknown): unknown => {
    if (typeof value === 'function' || typeof value === 'symbol') return undefined
    return value
  }
  return JSON.stringify(loaderData, replacer)
    .replace(/</g, '\\u003C')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const STRINGS = ['plain', '</script><script>x()</script>', '<!--', 'a\u2028b\u2029c', 'é ü 中文', '"quote"', 'back\\slash', '']

function value(r: () => number, depth: number, shared: object): unknown {
  const k = Math.floor(r() * 12)
  if (depth > 3 && k > 7) return 1
  switch (k) {
    case 0:
      return STRINGS[Math.floor(r() * STRINGS.length)]
    case 1:
      return Math.floor(r() * 1000) - 500
    case 2:
      return r() > 0.5
    case 3:
      return null
    case 4:
      return undefined
    case 5:
      return () => 'fn'
    case 6:
      return Symbol('s')
    case 7:
      return new Date(Math.floor(r() * 2e12))
    case 8:
      return shared
    case 9: {
      // Draw now: a toJSON that consumes the rng at serialization time would
      // hand the two implementations different payloads.
      const s = STRINGS[Math.floor(r() * STRINGS.length)]
      return { toJSON: () => ({ viaToJSON: s }) }
    }
    case 10: {
      const n = Math.floor(r() * 5)
      return Array.from({ length: n }, () => value(r, depth + 1, shared))
    }
    default: {
      const o: Record<string, unknown> = {}
      const n = Math.floor(r() * 5)
      for (let i = 0; i < n; i++) o[`k${i}`] = value(r, depth + 1, shared)
      return o
    }
  }
}

describe('stringifyLoaderData — byte-identical to the replacer implementation', () => {
  it('matches over 2000 seeded payloads', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const r = rng(seed)
      const shared = { shared: true, list: [1, 2] }
      const data: Record<string, unknown> = {}
      const n = 1 + Math.floor(r() * 4)
      for (let i = 0; i < n; i++) data[`/route${i}`] = value(r, 0, shared)
      expect(stringifyLoaderData(data), `seed ${seed}`).toBe(oracle(data))
    }
  })

  it('still names the path of a cycle', () => {
    const post: Record<string, unknown> = { id: 1 }
    post.self = post
    expect(() => stringifyLoaderData({ '/p': { post } })).toThrow(
      '[Pyreon] Loader returned circular reference at "/p.post.self"',
    )
  })

  it('rethrows a non-cycle failure unchanged (BigInt)', () => {
    expect(() => stringifyLoaderData({ '/n': { big: 1n } })).toThrow(TypeError)
  })

  it('does not call toJSON twice on the success path', () => {
    let calls = 0
    const data = { '/d': { toJSON: () => (calls++, 'x') } }
    stringifyLoaderData(data)
    expect(calls).toBe(1)
  })
})
