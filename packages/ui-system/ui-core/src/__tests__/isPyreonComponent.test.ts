/**
 * Coverage-focused tests for isPyreonComponent + resolveSlot.
 */
import { describe, expect, it } from 'vitest'
import { isPyreonComponent } from '../isPyreonComponent'
import resolveSlot from '../resolveSlot'

describe('isPyreonComponent', () => {
  it('returns false for non-function values', () => {
    expect(isPyreonComponent(null)).toBe(false)
    expect(isPyreonComponent(undefined)).toBe(false)
    expect(isPyreonComponent({})).toBe(false)
    expect(isPyreonComponent(42)).toBe(false)
    expect(isPyreonComponent('text')).toBe(false)
  })

  it('returns true for IS_ROCKETSTYLE-marked function', () => {
    const fn = Object.assign(() => null, { IS_ROCKETSTYLE: true })
    expect(isPyreonComponent(fn)).toBe(true)
  })

  it('returns true for PYREON__COMPONENT-marked function', () => {
    const fn = Object.assign(() => null, { PYREON__COMPONENT: true })
    expect(isPyreonComponent(fn)).toBe(true)
  })

  it('returns true for pkgName-marked function', () => {
    const fn = Object.assign(() => null, { pkgName: 'elements' })
    expect(isPyreonComponent(fn)).toBe(true)
  })

  it('returns true for function with displayName', () => {
    const fn = Object.assign(() => null, { displayName: 'MyComp' })
    expect(isPyreonComponent(fn)).toBe(true)
  })

  it('returns true for PascalCase named function', () => {
    function Header() {
      return null
    }
    expect(isPyreonComponent(Header)).toBe(true)
  })

  it('returns true for PascalCase const arrow', () => {
    const Header = () => null
    expect(isPyreonComponent(Header)).toBe(true)
  })

  it('returns false for camelCase function (accessor convention)', () => {
    const accessor = () => null
    expect(isPyreonComponent(accessor)).toBe(false)
  })

  it('returns false for anonymous arrow', () => {
    expect(isPyreonComponent(() => null)).toBe(false)
  })

  it('returns false for empty displayName', () => {
    const fn = Object.assign(() => null, { displayName: '' })
    // empty string falls through → checks name; name === 'fn' (lowercase)
    expect(isPyreonComponent(fn)).toBe(false)
  })
})

describe('resolveSlot', () => {
  it('passes through static VNode atoms (strings)', () => {
    expect(resolveSlot('text')).toBeTruthy()
  })

  it('passes through null', () => {
    expect(resolveSlot(null)).toBeNull()
  })

  it('calls reactive accessor (camelCase function)', () => {
    let called = 0
    const accessor = () => {
      called++
      return 'rendered' as unknown
    }
    resolveSlot(accessor)
    expect(called).toBe(1)
  })

  it('mounts marked component as h(Component, null)', () => {
    const Comp = Object.assign(() => null, { PYREON__COMPONENT: true })
    const result = resolveSlot(Comp)
    // returns a VNode-shaped object from h()
    expect(result).toBeTruthy()
    expect(typeof result).toBe('object')
  })
})
