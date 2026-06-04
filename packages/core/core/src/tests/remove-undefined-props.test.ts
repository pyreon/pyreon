import { describe, expect, it } from 'vitest'
import { makeReactiveProps, removeUndefinedProps, _rp } from '../props'

// `removeUndefinedProps` is the descriptor-aware filter every prop-forwarding
// HOC (`@pyreon/attrs`, `@pyreon/rocketstyle`) runs before merging consumer
// props over defaults. It was hand-rolled identically in both packages and one
// copy historically shipped as a value-copy that fired getter-shaped reactive
// props at HOC-setup time — collapsing the live signal subscription to a static
// snapshot. These specs lock the canonical core contract.
//
// Bisect: replace the descriptor copy with a value-copy
// (`result[key] = props[key]`) → the getter-preservation spec fails because the
// getter fires here (`fires === 1` instead of `0`) and the result is a static
// data property, not a live getter.
describe('removeUndefinedProps', () => {
  it('drops keys whose DATA value is exactly undefined', () => {
    const result = removeUndefinedProps({ a: 1, b: undefined, c: 'x' })
    expect(result).toEqual({ a: 1, c: 'x' })
    expect('b' in result).toBe(false)
  })

  it('keeps null / 0 / "" / false — only undefined is dropped', () => {
    const result = removeUndefinedProps({ a: null, b: 0, c: '', d: false, e: undefined })
    expect(result).toEqual({ a: null, b: 0, c: '', d: false })
    expect('e' in result).toBe(false)
  })

  it('preserves a getter-shaped reactive prop WITHOUT firing it', () => {
    let fires = 0
    let value = 'live'
    // A compiler-emitted reactive prop after makeReactiveProps converts it to a
    // property getter.
    const source = makeReactiveProps({ title: _rp(() => ((fires++, value) as string)) }) as {
      title: string
    }
    // Reading source.title once to prime — actually DON'T: we must prove the
    // filter never fires it. Reset the counter that priming would bump.
    fires = 0

    const filtered = removeUndefinedProps(source)
    // The filter copied the descriptor without invoking the getter.
    expect(fires).toBe(0)

    // The result still exposes a LIVE getter — reading reflects later mutation.
    expect((filtered as { title: string }).title).toBe('live')
    value = 'updated'
    expect((filtered as { title: string }).title).toBe('updated')
    // Reading twice fired the underlying accessor twice — proving it stayed a getter.
    expect(fires).toBe(2)
  })

  it('a getter whose resolved value would be undefined is still kept (cannot peek)', () => {
    // We can't evaluate the getter without firing it, so getter descriptors are
    // always kept — even if they'd currently resolve to undefined.
    const source = makeReactiveProps({ maybe: _rp(() => undefined) })
    const filtered = removeUndefinedProps(source)
    expect('maybe' in filtered).toBe(true)
    expect(Object.getOwnPropertyDescriptor(filtered, 'maybe')?.get).toBeTypeOf('function')
  })

  it('returns a fresh object (never mutates the input)', () => {
    const input = { a: 1, b: undefined }
    const result = removeUndefinedProps(input)
    expect(result).not.toBe(input)
    expect('b' in input).toBe(true) // input untouched
  })

  it('empty object → empty object', () => {
    expect(removeUndefinedProps({})).toEqual({})
  })
})
