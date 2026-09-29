/**
 * `@pyreon/http/json` — the lossless int64 codec, and the client's `json` hook.
 *
 * The codec has three parse layers (plain `JSON.parse`, the reviver's
 * `context.source`, an own parser) and two encode layers (`JSON.rawJSON`, a
 * verified placeholder). Every layer is forced here, because the one a test
 * machine picks by detection is NOT the one every consumer gets: an older engine has
 * neither proposal, and a layer only reachable on an old engine is a layer no
 * suite would otherwise run.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createHttp } from '../client'
import { _setSourceTextSupport, losslessJson, parseJsonLossless, stringifyJsonLossless } from '../json'
import { mock } from '../mock'
import { openNdjsonStream, readNdjson } from '../stream'
import { toHttpResponse } from '../transport'
import type { Transport } from '../types'

const UNSAFE = '9007199254740993' // 2^53 + 1 — JSON.parse gives …992

afterEach(() => {
  _setSourceTextSupport(undefined)
})

const LAYERS = [
  ['context.source reviver', true],
  ['own parser', false],
] as const

describe('parseJsonLossless', () => {
  for (const [name, source] of LAYERS) {
    describe(name, () => {
      it('decodes an unsafe integer as an exact bigint, anywhere in the document', () => {
        _setSourceTextSupport(source)
        const out = parseJsonLossless(
          `{"id":${UNSAFE},"n":[-${UNSAFE},1,${UNSAFE}],"deep":{"x":{"y":18446744073709551615}}}`,
        )
        expect(out).toEqual({
          id: 9007199254740993n,
          n: [-9007199254740993n, 1, 9007199254740993n],
          deep: { x: { y: 18446744073709551615n } },
        })
      })

      it('keeps a safe integer, a fraction and an exponent form as a number', () => {
        _setSourceTextSupport(source)
        // 2^53 - 1 is the largest SAFE integer: it stays a number. The
        // fraction and exponent forms are doubles the server wrote as doubles.
        const out = parseJsonLossless(
          '[9007199254740991,-9007199254740991,12345678901234567.5,1e21,100000000000000000000e0,0,-0]',
        ) as unknown[]
        expect(out.slice(0, 5)).toEqual([9007199254740991, -9007199254740991, Number("12345678901234567.5"), 1e21, 1e20])
        expect(Object.is(out[6], -0)).toBe(true)
      })

      it('treats 2^53 itself as unsafe — a neighbour collides with it as a double', () => {
        _setSourceTextSupport(source)
        expect(parseJsonLossless('9007199254740992')).toBe(9007199254740992n)
      })

      it('does not touch digits inside a string', () => {
        _setSourceTextSupport(source)
        expect(parseJsonLossless(`{"s":"${UNSAFE}"}`)).toEqual({ s: UNSAFE })
      })

      it('rejects what JSON.parse rejects, with a SyntaxError', () => {
        _setSourceTextSupport(source)
        for (const bad of [`[${UNSAFE},]`, `{"a":${UNSAFE}`, `0${UNSAFE}`, `[${UNSAFE}] x`, `-${UNSAFE}.`, `"${UNSAFE}\n"`]) {
          expect(() => parseJsonLossless(bad), bad).toThrow(SyntaxError)
          expect(() => JSON.parse(bad), bad).toThrow(SyntaxError)
        }
      })
    })
  }

  it('the own parser never assigns the prototype through a "__proto__" key', () => {
    _setSourceTextSupport(false)
    const out = parseJsonLossless(`{"__proto__":{"polluted":${UNSAFE}}}`) as Record<string, unknown>
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
    expect(Object.hasOwn(out, '__proto__')).toBe(true)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    // The same as JSON.parse, which uses CreateDataProperty.
    const native = JSON.parse('{"__proto__":{"a":1}}') as Record<string, unknown>
    expect(Object.hasOwn(native, '__proto__')).toBe(true)
  })

  it('the own parser agrees with JSON.parse on every document without an unsafe integer', () => {
    // A seeded generator over the whole grammar: escapes, unicode, nesting,
    // duplicate keys (last wins), whitespace. Each document is forced through
    // the own parser by carrying a 16-digit SAFE run in a string, so the fast
    // path cannot take it.
    _setSourceTextSupport(false)
    let seed = 42
    const rnd = (n: number): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed % n
    }
    const strings = ['', 'a', '"q"', '\\', '\n\t\r\b\f', '\u0000\u001f', 'é😀', ' ', '/']
    const gen = (depth: number): unknown => {
      switch (depth > 3 ? rnd(4) : rnd(7)) {
        case 0:
          return rnd(2) === 0
        case 1:
          return null
        case 2:
          return [0, -1, 1.5, -2.25e-7, 1e21, 9007199254740991, 123456789][rnd(7)]
        case 3:
          return strings[rnd(strings.length)]
        case 4:
          return Array.from({ length: rnd(4) }, () => gen(depth + 1))
        default: {
          const o: Record<string, unknown> = {}
          for (let i = rnd(4); i > 0; i--) o[strings[rnd(strings.length)] as string] = gen(depth + 1)
          return o
        }
      }
    }
    for (let i = 0; i < 400; i++) {
      const doc = { pad: '1234567890123456', v: gen(0) }
      const text = JSON.stringify(doc, null, rnd(2) === 0 ? 2 : undefined)
      expect(parseJsonLossless(text)).toEqual(JSON.parse(text))
    }
    // Duplicate keys keep the last value, as JSON.parse does.
    expect(parseJsonLossless('{"a":1,"a":1234567890123456}')).toEqual({ a: 1234567890123456 })
  })

  it('the context.source layer is actually available on this engine', () => {
    // The detection itself — the fast native layer should be what a current
    // Node / Bun / Chromium takes. If this fails the engine lacks the
    // proposal and the own parser is carrying every body.
    _setSourceTextSupport(undefined)
    let saw: string | undefined
    ;(JSON.parse as (t: string, r: (k: string, v: unknown, c?: { source?: string }) => unknown) => unknown)(
      '7',
      (_k, v, c) => {
        saw = c?.source
        return v
      },
    )
    expect(saw).toBe('7')
  })
})

describe('stringifyJsonLossless', () => {
  const withoutRawJson = <T>(fn: () => T): T => {
    const j = JSON as unknown as { rawJSON?: unknown }
    const saved = j.rawJSON
    delete j.rawJSON
    try {
      return fn()
    } finally {
      if (saved !== undefined) j.rawJSON = saved
    }
  }

  const cases: Array<[string, () => string]> = [
    ['JSON.rawJSON', () => stringifyJsonLossless({ id: 9007199254740993n, n: [-1n, 2], s: 'x' })],
    ['placeholder fallback', () => withoutRawJson(() => stringifyJsonLossless({ id: 9007199254740993n, n: [-1n, 2], s: 'x' }))],
  ]
  for (const [name, run] of cases) {
    it(`writes a bigint as JSON number text (${name})`, () => {
      expect(run()).toBe(`{"id":${UNSAFE},"n":[-1,2],"s":"x"}`)
    })
  }

  it('is byte-identical to JSON.stringify when there is no bigint', () => {
    const v = { a: [1, 'two', null, { b: undefined, c: () => 1 }], d: new Date(0), e: ' ' }
    expect(stringifyJsonLossless(v)).toBe(JSON.stringify(v))
    expect(withoutRawJson(() => stringifyJsonLossless(v))).toBe(JSON.stringify(v))
  })

  it('the fallback survives a user string that looks like its placeholder', () => {
    // A string that CONTAINS the private-use marker cannot be mistaken for a
    // placeholder: the swap is counted and verified, never trusted.
    const out = withoutRawJson(() => stringifyJsonLossless({ s: 'abc:12', id: 5n }))
    expect(JSON.parse(out)).toEqual({ s: 'abc:12', id: 5 })
  })

  it('round-trips through parseJsonLossless exactly', () => {
    const v = { id: 18446744073709551615n, small: 3, list: [9007199254740993n] }
    expect(parseJsonLossless(stringifyJsonLossless(v))).toEqual(v)
  })
})

describe('createHttp({ json: losslessJson })', () => {
  const echo = (): { transport: Transport; sent: string[] } => {
    const sent: string[] = []
    const transport: Transport = async (request) => {
      const body = typeof request.body === 'string' ? request.body : ''
      sent.push(body)
      return toHttpResponse(
        new Response(body || `{"id":${UNSAFE}}`, { status: 200, headers: { 'content-type': 'application/json' } }),
        request,
      )
    }
    return { transport, sent }
  }

  it('sends a bigint as JSON number text and decodes it back exactly', async () => {
    const { transport, sent } = echo()
    const api = createHttp({ transport, json: losslessJson })
    const back = await api.post('https://api.test/x', { json: { id: 9007199254740993n } }).json()
    expect(sent[0]).toBe(`{"id":${UNSAFE}}`)
    expect(back).toEqual({ id: 9007199254740993n })
  })

  it('decodes an ERROR body losslessly too', async () => {
    const api = createHttp({
      transport: async (request) =>
        toHttpResponse(new Response(`{"id":${UNSAFE}}`, { status: 404, headers: { 'content-type': 'application/json' } }), request),
      json: losslessJson,
    })
    const err = (await api.get('https://api.test/x').json().catch((e: unknown) => e)) as { body: unknown }
    expect(err.body).toEqual({ id: 9007199254740993n })
  })

  it('without the codec, behaviour is unchanged: the value rounds', async () => {
    const { transport } = echo()
    const back = await createHttp({ transport }).get('https://api.test/x').json()
    expect(back).toEqual({ id: 9007199254740992 })
  })

  it('an extended client inherits the codec', async () => {
    const { transport } = echo()
    const back = await createHttp({ transport, json: losslessJson }).extend({}).get('https://api.test/x').json()
    expect(back).toEqual({ id: 9007199254740993n })
  })

  it('a mock route may answer with a bigint fixture', async () => {
    const api = createHttp({
      transport: async () => {
        throw new Error('network')
      },
      use: [mock([{ method: 'GET', path: '/x', json: { id: 9007199254740993n } }])],
      json: losslessJson,
    })
    expect(await api.get('https://api.test/x').json()).toEqual({ id: 9007199254740993n })
  })
})

describe('streams take the lossless decoder', () => {
  const body = (text: string): ReadableStream<Uint8Array> =>
    new Response(text).body as ReadableStream<Uint8Array>

  it('readNdjson / openNdjsonStream decode each line with parseJson', async () => {
    const rows: unknown[] = []
    for await (const row of readNdjson(body(`{"id":${UNSAFE}}\n`), parseJsonLossless)) rows.push(row)
    expect(rows).toEqual([{ id: 9007199254740993n }])

    const stream = openNdjsonStream(async () => body(`{"id":${UNSAFE}}\n`), { parseJson: parseJsonLossless })
    const out: unknown[] = []
    for await (const v of stream) out.push(v)
    expect(out).toEqual([{ id: 9007199254740993n }])
  })
})

describe('own parser matches JSON.parse on every rejection and escape', () => {
  // Each body carries a 16-digit run so it bypasses the plain-JSON.parse
  // layer and reaches the parser under test.
  const PAD = `[${UNSAFE},`
  const REJECTED = [
    `${PAD}tru]`,
    `${PAD}{1:2}]`,
    `${PAD}{"a" 1}]`,
    `${PAD}{"a":1 "b":2}]`,
    `${PAD}1 2]`,
    `${PAD}"abc`,
    `${PAD}"a\u0001b"]`,
    `${PAD}"\\u12G4"]`,
    `${PAD}"\\x"]`,
    `${PAD}-]`,
    `${PAD}-a]`,
    `${PAD}1.]`,
    `${PAD}1e]`,
    `${PAD}1e+]`,
    `${PAD}@]`,
    PAD,
    `${PAD}1] x`,
  ]

  for (const body of REJECTED) {
    it(`rejects ${JSON.stringify(body)} like JSON.parse`, () => {
      _setSourceTextSupport(false)
      expect(() => JSON.parse(body)).toThrow(SyntaxError)
      expect(() => parseJsonLossless(body)).toThrow(SyntaxError)
    })
  }

  it('decodes every escape exactly as JSON.parse does', () => {
    _setSourceTextSupport(false)
    const body = `[${UNSAFE}, "q\\"b\\\\s\\/f\\bf\\ff\\nn\\rr\\tt\\u00e9\\u20AC"]`
    const parsed = parseJsonLossless(body) as [bigint, string]
    expect(parsed[0]).toBe(BigInt(UNSAFE))
    expect(parsed[1]).toBe((JSON.parse(body) as [number, string])[1])
  })

  it('parses exponent and fraction forms as numbers', () => {
    _setSourceTextSupport(false)
    expect(parseJsonLossless(`[${UNSAFE}, 1.5e+3, -2E-2, 0]`)).toEqual([BigInt(UNSAFE), 1500, -0.02, 0])
  })
})

