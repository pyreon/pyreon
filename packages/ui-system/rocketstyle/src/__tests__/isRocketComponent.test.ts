import isRocketComponent from '../isRocketComponent'

describe('isRocketComponent', () => {
  it('returns true for object with IS_ROCKETSTYLE property', () => {
    const component = { IS_ROCKETSTYLE: true }
    expect(isRocketComponent(component)).toBe(true)
  })

  it('returns false for plain object without IS_ROCKETSTYLE', () => {
    expect(isRocketComponent({})).toBe(false)
  })

  it('returns false for null', () => {
    expect(isRocketComponent(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isRocketComponent(undefined)).toBe(false)
  })

  it('returns false for primitives', () => {
    expect(isRocketComponent('string')).toBe(false)
    expect(isRocketComponent(42)).toBe(false)
    expect(isRocketComponent(true)).toBe(false)
  })

  it('returns false for plain functions without IS_ROCKETSTYLE', () => {
    expect(
      isRocketComponent(() => {
        /* no-op */
      }),
    ).toBe(false)
  })

  it('returns true for functions with IS_ROCKETSTYLE', () => {
    const fn = () => {
      /* no-op */
    }
    ;(fn as any).IS_ROCKETSTYLE = true
    expect(isRocketComponent(fn)).toBe(true)
  })

  it('returns true even if IS_ROCKETSTYLE is falsy', () => {
    // hasOwnProperty check only, doesn't check truthiness
    const component = { IS_ROCKETSTYLE: false }
    expect(isRocketComponent(component)).toBe(true)
  })
})
