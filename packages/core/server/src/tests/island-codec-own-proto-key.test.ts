/**
 * Island props are user data, and the fragment endpoint decodes CLIENT-
 * controlled props on the server. A `"__proto__"` own key (what `JSON.parse`
 * produces) must survive the codec as an own key in both directions: copying it
 * with `out[key] = value` ran the accessor, so encode dropped the key from the
 * wire and decode grafted its value into the prototype chain (`a.admin` read
 * `true` with no own `admin`).
 */
import { describe, expect, it } from 'vitest'
import { decodeIslandProps, encodeIslandProps } from '../island-codec'

describe('island codec — own __proto__ keys', () => {
  it('encode keeps an own __proto__ key on the wire', () => {
    const props = { tags: JSON.parse('{"js":1,"__proto__":{"admin":true}}') as Record<string, unknown> }
    const wire = JSON.stringify(encodeIslandProps(props, 'Tags'))
    expect(JSON.parse(wire).tags).toEqual(JSON.parse('{"js":1,"__proto__":{"admin":true}}'))
    expect(Object.keys(JSON.parse(wire).tags)).toEqual(['js', '__proto__'])
  })

  it('decode keeps it an own key instead of the prototype', () => {
    const decoded = decodeIslandProps(JSON.parse('{"a":{"__proto__":{"admin":true}}}')) as {
      a: Record<string, unknown>
    }
    expect(Object.getPrototypeOf(decoded.a)).toBe(Object.prototype)
    expect(decoded.a.admin).toBeUndefined()
    expect(Object.keys(decoded.a)).toEqual(['__proto__'])
  })

  it('decode of an escaped object (own __pyreon_t key) keeps it too', () => {
    const decoded = decodeIslandProps(
      JSON.parse('{"__pyreon_t":"e","v":{"__pyreon_t":"x","__proto__":{"admin":true}}}'),
    ) as Record<string, unknown>
    expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype)
    expect(decoded.admin).toBeUndefined()
    expect(Object.keys(decoded)).toEqual(['__pyreon_t', '__proto__'])
  })

  it('round-trips through encode → JSON → decode', () => {
    const props = { m: JSON.parse('{"__proto__":{"n":1},"k":2}') as Record<string, unknown> }
    const back = decodeIslandProps(JSON.parse(JSON.stringify(encodeIslandProps(props, 'X')))) as typeof props
    expect(Object.keys(back.m)).toEqual(['__proto__', 'k'])
    expect(Object.getPrototypeOf(back.m)).toBe(Object.prototype)
  })
})
