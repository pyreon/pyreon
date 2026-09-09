import { describe, expect, it } from 'vitest'
import { buildProps, filterProps } from '../forward'

/**
 * Two descriptor-copy contracts for the prop-forwarding helpers.
 *
 * 1. ITERATION AND COPY MUST AGREE. Both helpers copy own DESCRIPTORS (so a
 *    compiler-emitted `_rp` getter survives with its subscription intact), but
 *    they used to enumerate with `for...in`, which also walks the prototype
 *    chain. An INHERITED enumerable prop was therefore iterated and then
 *    silently dropped by the own-only descriptor read — forwarding nothing and
 *    reporting nothing. Own-key iteration makes the halves agree by
 *    construction; the resulting semantic (inherited props are not forwarded)
 *    is the one `@pyreon/ui-core`'s `omit`/`pick` already assert.
 *
 * 2. A COPIED DESCRIPTOR MUST STAY REDEFINABLE. A source descriptor created by
 *    `Object.defineProperty` without an explicit flag is non-configurable;
 *    copied verbatim it makes the key impossible to redefine downstream
 *    (`TypeError: Cannot redefine property`) — the documented `mergeProps`
 *    trap. Both helpers force `configurable: true`, as `mergeProps` does.
 */
/**
 * NOT bisect-load-bearing, and deliberately kept anyway.
 *
 * Both the broken and the fixed code produce this output: `for...in` enumerated
 * the inherited key and the own-only descriptor read then dropped it, so the
 * OUTPUT was already own-keys-only. The change removes the silent drop (and the
 * now-unreachable `if (!d)` branch that performed it), it does not alter what
 * comes out.
 *
 * These specs pin the SEMANTIC so the mismatch is not "fixed" in the other
 * direction — making the descriptor read walk the prototype chain would forward
 * inherited props, but only by copying an inherited accessor onto the target,
 * which severs the prototype link and rebinds the getter's `this`.
 */
describe('forward helpers — own-key iteration', () => {
  it('filterProps ignores an inherited enumerable HTML prop', () => {
    const props: Record<string, unknown> = Object.create({ title: 'from-prototype' })
    props.id = 'own'
    const out = filterProps(props)
    expect(out.id).toBe('own')
    expect(Object.prototype.hasOwnProperty.call(out, 'title')).toBe(false)
    // and it is not merely absent-as-undefined — it was never enumerated
    expect(Object.keys(out)).toEqual(['id'])
  })

  it('buildProps ignores an inherited enumerable prop on every branch', () => {
    const make = () => {
      const p: Record<string, any> = Object.create({ title: 'from-prototype' })
      p.id = 'own'
      return p
    }
    // component target
    expect(Object.keys(buildProps(make(), '', false)).sort()).toEqual(['id'])
    // DOM + custom filter
    expect(Object.keys(buildProps(make(), '', true, () => true)).sort()).toEqual(['id'])
    // DOM + default filtering
    expect(Object.keys(buildProps(make(), '', true)).sort()).toEqual(['id'])
  })

  it('own props still forward, and a getter stays LIVE (not frozen to a value)', () => {
    let n = 0
    const props: Record<string, unknown> = {}
    Object.defineProperty(props, 'title', {
      enumerable: true,
      configurable: true,
      get: () => `v${++n}`,
    })
    const out = filterProps(props)
    // A value-copy would have fired the getter once at copy time and frozen it.
    expect(Object.getOwnPropertyDescriptor(out, 'title')?.get).toBeTypeOf('function')
    expect(out.title).toBe('v1')
    expect(out.title).toBe('v2')
  })
})

/** Bisect-load-bearing: these two fail against the pre-fix descriptor copy. */
describe('forward helpers — copied descriptors stay configurable', () => {
  const nonConfigurableGetterProps = () => {
    const props: Record<string, unknown> = {}
    // configurable defaults to FALSE here — the trap.
    Object.defineProperty(props, 'title', { enumerable: true, get: () => 'live' })
    return props
  }

  it('filterProps forces configurable: true on the copy', () => {
    const out = filterProps(nonConfigurableGetterProps())
    expect(Object.getOwnPropertyDescriptor(out, 'title')?.configurable).toBe(true)
    expect(() =>
      Object.defineProperty(out, 'title', { value: 'override', configurable: true }),
    ).not.toThrow()
  })

  it('buildProps forces configurable: true on the copy', () => {
    const out = buildProps(nonConfigurableGetterProps() as Record<string, any>, '', true)
    expect(Object.getOwnPropertyDescriptor(out, 'title')?.configurable).toBe(true)
    expect(() =>
      Object.defineProperty(out, 'title', { value: 'override', configurable: true }),
    ).not.toThrow()
  })

  it('the getter still works after being copied configurable', () => {
    const out = filterProps(nonConfigurableGetterProps())
    expect(out.title).toBe('live')
  })
})
