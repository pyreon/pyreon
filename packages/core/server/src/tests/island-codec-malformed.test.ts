/**
 * `decodeIslandProps` against a blob that is not what the encoder produced.
 *
 * Island props travel in a `data-props` attribute on the page. That makes the
 * decoder's input the least trustworthy in the hydration path: it can be
 * truncated by a proxy, mangled by an extension, or edited by anyone with
 * devtools. Every tagged branch therefore carries a shape check and falls back
 * to the value verbatim, and none of those fallbacks was covered — the
 * existing round-trip tests only ever decode what the encoder just wrote.
 *
 * The failure mode is a hard one: a decode that throws happens during
 * hydration, so the island stays inert and the page reports nothing useful.
 * `BigInt(undefined)` throws, `new Date(undefined)` yields Invalid Date, and a
 * Map entry that is not a pair would silently produce a `Map` with undefined
 * keys — three different wrong answers from one malformed attribute.
 *
 * The encoder's class-instance refusal is the same contract from the other
 * side: a class instance survives `JSON.stringify` and arrives as a plain
 * object with its prototype gone, so every method the component calls on it is
 * undefined. Refusing loudly at encode time beats a `TypeError` at hydrate.
 */
import { decodeIslandProps, encodeIslandProps, IslandPropEncodeError } from '../island-codec'

/**
 * Build a tagged blob by hand — what a tampered attribute looks like.
 *
 * The key names have to match the codec's own (`__pyreon_t` / `v`) or the
 * decoder never recognises the blob as tagged and returns it verbatim for the
 * WRONG reason — which is exactly what the first draft of this file did, and
 * what the Map spec caught. Asserted below rather than assumed.
 */
const tagged = (tag: string, value: unknown): Record<string, unknown> => ({
  __pyreon_t: tag,
  v: value,
})

describe('a well-formed blob decodes to the real type', () => {
  // The control. Without it every "returns it verbatim" spec below passes
  // against a decoder that never decodes anything.
  test('round-trips Date, BigInt, RegExp, Map and Set', () => {
    const original = {
      d: new Date('2020-01-02T03:04:05.000Z'),
      b: 123n,
      r: /ab+c/gi,
      m: new Map([['k', 1]]),
      s: new Set([1, 2]),
    }
    const back = decodeIslandProps(
      JSON.parse(JSON.stringify(encodeIslandProps(original, 'test'))),
    ) as typeof original

    expect(back.d).toBeInstanceOf(Date)
    expect(back.d.toISOString()).toBe('2020-01-02T03:04:05.000Z')
    expect(back.b).toBe(123n)
    expect(back.r).toBeInstanceOf(RegExp)
    expect(back.r.source).toBe('ab+c')
    expect(back.m.get('k')).toBe(1)
    expect([...back.s]).toEqual([1, 2])
  })
})

describe('a MALFORMED blob decodes without throwing', () => {
  test('the hand-built blob shape IS the one the decoder recognises', () => {
    // Without this, every spec below passes against a blob the decoder never
    // treats as tagged — "returned verbatim" would be true for the wrong
    // reason and the fallbacks would stay untested.
    expect(decodeIslandProps(tagged('d', '2020-01-02T03:04:05.000Z'))).toBeInstanceOf(Date)
    expect(decodeIslandProps(tagged('B', '7'))).toBe(7n)
  })

  test('a BigInt tag whose value is not a string is left verbatim', () => {
    // `BigInt(undefined)` and `BigInt({})` both throw. A throw here kills
    // hydration for the whole island.
    for (const bad of [undefined, null, 42, {}, []]) {
      const blob = tagged('B', bad)
      expect(() => decodeIslandProps(blob), String(bad)).not.toThrow()
      expect(decodeIslandProps(blob), 'the blob is returned as-is').toBe(blob)
    }
  })

  test('a Date tag whose value is not a string is left verbatim', () => {
    const blob = tagged('d', 12345)
    expect(decodeIslandProps(blob)).toBe(blob)
  })

  test('a RegExp tag with a non-object value is left verbatim', () => {
    const blob = tagged('r', 'not-an-object')
    expect(decodeIslandProps(blob)).toBe(blob)
  })

  test('a RegExp tag with an INVALID source is left verbatim, not thrown', () => {
    // `new RegExp('(', '')` throws. The try/catch is what stops a bad pattern
    // from taking the island down.
    const blob = tagged('r', { source: '(', flags: '' })
    expect(() => decodeIslandProps(blob)).not.toThrow()
    expect(decodeIslandProps(blob)).toBe(blob)
  })

  test('a Map tag skips entries that are not key/value PAIRS', () => {
    // A truncated array would otherwise produce a Map with undefined keys —
    // worse than dropping the entry, because the component reads it as real.
    const blob = tagged('m', [
      ['good', 1],
      ['truncated'],
      [],
      ['too', 'many', 'items'],
      'not-an-array',
    ])
    const out = decodeIslandProps(blob) as Map<unknown, unknown>
    expect(out).toBeInstanceOf(Map)
    expect(out.size, 'only the well-formed pair survives').toBe(1)
    expect(out.get('good')).toBe(1)
  })

  test('a Map tag whose value is not an array is left verbatim', () => {
    const blob = tagged('m', { k: 1 })
    expect(decodeIslandProps(blob)).toBe(blob)
  })

  test('an UNKNOWN tag is left verbatim', () => {
    // Forward compatibility: an older client decoding a newer server's blob.
    const blob = tagged('zzz', 'whatever')
    expect(decodeIslandProps(blob)).toBe(blob)
  })

  test('a plain object that merely looks tagged is untouched', () => {
    // The tag must be a STRING. An object carrying the key with another type
    // is ordinary data, not an encoding.
    const blob = { __pyreon_t: 42, __pyreon_v: 'x' }
    expect(decodeIslandProps(blob)).toEqual(blob)
  })
})

describe('the encoder refuses what cannot survive the wire', () => {
  test('a class instance is refused with a message naming the class and path', () => {
    // It would serialize fine and arrive prototype-less, so every method the
    // component calls on it is undefined — at hydration, far from the cause.
    class User {
      constructor(public name: string) {}
      greet(): string {
        return `hi ${this.name}`
      }
    }
    let err: unknown
    try {
      encodeIslandProps({ user: new User('a') }, 'profile-island')
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(IslandPropEncodeError)
    const msg = (err as Error).message
    expect(msg, 'the class name locates the offending value').toContain('User')
    expect(msg, 'and so does the prop path').toContain('user')
    expect(msg, 'and it says what to do instead').toMatch(/plain object|ID/)
  })

  test('an ANONYMOUS class still produces a usable message', () => {
    // `constructor.name` is empty for some anonymous shapes; the fallback is
    // what stops the message reading "instance of class ``".
    const anon = Object.create({ marker: 1 }) as Record<string, unknown>
    anon.x = 1
    expect(() => encodeIslandProps({ v: anon }, 'i')).toThrow(IslandPropEncodeError)
  })

  test('a plain nested object encodes fine — the refusal is selective', () => {
    expect(() => encodeIslandProps({ a: { b: { c: 1 } } }, 'i')).not.toThrow()
  })
})
