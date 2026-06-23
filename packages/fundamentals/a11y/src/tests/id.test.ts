import { describe, expect, it } from 'vitest'
import { createA11yId } from '../id'

describe('createA11yId', () => {
  it('returns a prefixed id', () => {
    const id = createA11yId('hint')
    expect(id.startsWith('hint-')).toBe(true)
    expect(id.length).toBeGreaterThan('hint-'.length)
  })

  it('uses the default prefix when none is given', () => {
    expect(createA11yId().startsWith('px-a11y-')).toBe(true)
  })

  it('produces a different id on each call', () => {
    const a = createA11yId('x')
    const b = createA11yId('x')
    expect(a).not.toBe(b)
  })
})
