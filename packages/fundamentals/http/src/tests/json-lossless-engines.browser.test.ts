/**
 * `@pyreon/http/json` in every browser ENGINE, not only Chromium.
 *
 * The codec picks its parse layer by DETECTION (does this engine hand a
 * `JSON.parse` reviver `context.source`?) and its encode layer by the presence
 * of `JSON.rawJSON`. Which layers a given engine takes is a property of that
 * engine and version — a current WebKit/Firefox build has both proposals, an
 * older shipped Safari does not — so this suite does not assume either. It
 * records what the engine offers, then forces EVERY layer the engine can run
 * and requires them to agree with each other and with `JSON.parse`:
 *
 *   - the fast path (native `JSON.parse` + source-text reviver), where present
 *   - the own parser, always — it is the path an engine without the proposal takes
 *   - `JSON.rawJSON` encoding, where present, and the placeholder fallback, always
 *
 * Run in WebKit + Firefox + Chromium by `test:browser:engines`
 * (`vitest.browser.engines.config.ts`); the plain `test:browser` job runs it
 * in Chromium only.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createHttp } from '../client'
import { _setSourceTextSupport, losslessJson, parseJsonLossless, stringifyJsonLossless } from '../json'
import { createMock } from '../mock'

const UNSAFE = '9007199254740993'

type SourceReviver = (key: string, value: unknown, context?: { source?: string }) => unknown

function engineHasSourceText(): boolean {
  let seen: string | undefined
  ;(JSON.parse as (t: string, r: SourceReviver) => unknown)('7', (_k, v, c) => {
    seen = c?.source
    return v
  })
  return seen === '7'
}
const engineHasRawJson = typeof (JSON as unknown as { rawJSON?: unknown }).rawJSON === 'function'

const PARSE_LAYERS: ReadonlyArray<readonly [string, boolean]> = [
  ...(engineHasSourceText() ? [['context.source reviver', true] as const] : []),
  ['own parser', false] as const,
]

afterEach(() => {
  _setSourceTextSupport(undefined)
})

/** Temporarily hide `JSON.rawJSON` so the placeholder encoder runs. */
function withoutRawJson<T>(fn: () => T): T {
  const json = JSON as unknown as { rawJSON?: unknown }
  const had = Object.getOwnPropertyDescriptor(JSON, 'rawJSON')
  if (had) delete json.rawJSON
  try {
    return fn()
  } finally {
    if (had) Object.defineProperty(JSON, 'rawJSON', had)
  }
}

const DOCS = [
  `{"id":${UNSAFE},"n":[-${UNSAFE},1,${UNSAFE}],"deep":{"x":{"y":18446744073709551615}}}`,
  '[9007199254740991,-9007199254740991,12345678901234567.5,1e21,100000000000000000000e0,0,-0]',
  '9007199254740992',
  `{"s":"${UNSAFE}","e":"\\u00e9\\ud83d\\ude00\\n","k":${UNSAFE}}`,
  `{"a":1,"a":${UNSAFE}}`,
  ` \t\n\r[ ${UNSAFE} , { "x" : -${UNSAFE} } ]\r\n`,
  `{"__proto__":{"polluted":${UNSAFE}}}`,
]

const BAD = [`[${UNSAFE},]`, `{"a":${UNSAFE}`, `0${UNSAFE}`, `[${UNSAFE}] x`, `-${UNSAFE}.`, `"${UNSAFE}\n"`, `[${UNSAFE} ]`]

describe('lossless JSON — every layer this engine can run agrees', () => {
  it('reports which proposals the engine implements (informational)', () => {
    // Not asserted: support is a property of the engine version. Logged so a
    // run records which layers it actually exercised.
    console.info(`[engine] context.source=${engineHasSourceText()} JSON.rawJSON=${engineHasRawJson}`)
    expect(PARSE_LAYERS.length).toBeGreaterThan(0)
  })

  it('the codec detects source-text support exactly as the engine reports it', () => {
    // Detection runs on the first long-digit body. A detector that disagrees
    // with the engine silently routes to the wrong layer.
    _setSourceTextSupport(undefined)
    const viaReviver = engineHasSourceText()
    let calledReviver = false
    const original = JSON.parse
    ;(JSON as { parse: typeof JSON.parse }).parse = ((text: string, reviver?: SourceReviver) => {
      if (reviver && text !== '1') calledReviver = true
      return original(text, reviver as never)
    }) as typeof JSON.parse
    try {
      parseJsonLossless(`[${UNSAFE}]`)
    } finally {
      ;(JSON as { parse: typeof JSON.parse }).parse = original
    }
    expect(calledReviver).toBe(viaReviver)
  })

  for (const [name, source] of PARSE_LAYERS) {
    describe(name, () => {
      it('decodes unsafe integers exactly and matches JSON.parse everywhere else', () => {
        for (const doc of DOCS) {
          _setSourceTextSupport(source)
          const lossless = parseJsonLossless(doc)
          // Structure and every non-integer value must equal JSON.parse's.
          const plain = JSON.parse(doc) as unknown
          const normalize = (v: unknown): unknown =>
            JSON.parse(stringifyJsonLossless(v), (_k, x: unknown) =>
              typeof x === 'number' && !Number.isSafeInteger(x) && Number.isInteger(x) ? 'INT' : x,
            )
          expect(normalize(lossless), doc).toEqual(normalize(plain))
        }
        _setSourceTextSupport(source)
        expect(parseJsonLossless(DOCS[0]!)).toEqual({
          id: 9007199254740993n,
          n: [-9007199254740993n, 1, 9007199254740993n],
          deep: { x: { y: 18446744073709551615n } },
        })
        _setSourceTextSupport(source)
        expect(parseJsonLossless(DOCS[4]!)).toEqual({ a: 9007199254740993n })
      })

      it('keeps -0 and a fraction as numbers', () => {
        _setSourceTextSupport(source)
        const out = parseJsonLossless(DOCS[1]!) as unknown[]
        expect(out[2]).toBe(Number('12345678901234567.5'))
        expect(Object.is(out[6], -0)).toBe(true)
      })

      it('a "__proto__" key is an own property, never the prototype', () => {
        _setSourceTextSupport(source)
        const out = parseJsonLossless(DOCS[6]!) as Record<string, unknown>
        expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
        expect(Object.hasOwn(out, '__proto__')).toBe(true)
        expect(({} as Record<string, unknown>).polluted).toBeUndefined()
      })

      it('rejects what this engine\'s JSON.parse rejects, with a SyntaxError', () => {
        for (const bad of BAD) {
          _setSourceTextSupport(source)
          expect(() => JSON.parse(bad), bad).toThrow(SyntaxError)
          expect(() => parseJsonLossless(bad), bad).toThrow(SyntaxError)
        }
      })
    })
  }

  it('both encoders write identical bytes', () => {
    const value = {
      id: 9007199254740993n,
      neg: -18446744073709551615n,
      list: [1n, 2, 'x', null, { nested: 42n }],
      s: `"${UNSAFE}"`,
      dropped: undefined,
      date: new Date(0),
    }
    const expected = `{"id":${UNSAFE},"neg":-18446744073709551615,"list":[1,2,"x",null,{"nested":42}],"s":"\\"${UNSAFE}\\"","date":"1970-01-01T00:00:00.000Z"}`
    if (engineHasRawJson) expect(stringifyJsonLossless(value)).toBe(expected)
    expect(withoutRawJson(() => stringifyJsonLossless(value))).toBe(expected)
  })

  it('a real request/response round-trips an int64 through each parse layer', async () => {
    for (const [, source] of PARSE_LAYERS) {
      _setSourceTextSupport(source)
      const { middleware } = createMock([{ method: 'POST', path: '/echo', body: (call) => String(call.body) }])
      const api = createHttp({ use: [middleware], json: losslessJson })
      const back = await api.post('/echo', { json: { id: 9007199254740993n, l: [-1n] } }).json()
      expect(back).toEqual({ id: 9007199254740993n, l: [-1] })
    }
  })
})

// THROWAWAY negative control for PR #3736 — reverted in the next commit.
// Fails ONLY in WebKit (Playwright WebKit's UA carries `Version/` + `Safari/`
// and no `Chrome/`/`Firefox/`), proving the CI engines step runs WebKit and
// that a failure there reds `Test (browser)`.
describe('negative control (throwaway)', () => {
  it('is not WebKit', () => {
    const ua = navigator.userAgent
    const isWebKit = /Version\/[\d.]+.*Safari\//.test(ua) && !/Chrome\/|Firefox\//.test(ua)
    expect(isWebKit, ua).toBe(false)
  })
})
