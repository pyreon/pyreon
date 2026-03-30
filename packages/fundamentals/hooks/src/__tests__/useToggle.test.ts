import { describe, expect, it } from 'vitest'
import { useToggle } from '../useToggle'

describe('useToggle', () => {
  it('defaults to false', () => {
    const { value } = useToggle()
    expect(value()).toBe(false)
  })

  it('respects initial value of true', () => {
    const { value } = useToggle(true)
    expect(value()).toBe(true)
  })

  it('respects initial value of false', () => {
    const { value } = useToggle(false)
    expect(value()).toBe(false)
  })

  it('toggle flips value from false to true', () => {
    const { value, toggle } = useToggle()
    toggle()
    expect(value()).toBe(true)
  })

  it('toggle flips value from true to false', () => {
    const { value, toggle } = useToggle(true)
    toggle()
    expect(value()).toBe(false)
  })

  it('toggle flips multiple times', () => {
    const { value, toggle } = useToggle()
    toggle()
    expect(value()).toBe(true)
    toggle()
    expect(value()).toBe(false)
    toggle()
    expect(value()).toBe(true)
  })

  it('setTrue sets value to true', () => {
    const { value, setTrue } = useToggle()
    setTrue()
    expect(value()).toBe(true)
  })

  it('setTrue is idempotent', () => {
    const { value, setTrue } = useToggle(true)
    setTrue()
    expect(value()).toBe(true)
  })

  it('setFalse sets value to false', () => {
    const { value, setFalse } = useToggle(true)
    setFalse()
    expect(value()).toBe(false)
  })

  it('setFalse is idempotent', () => {
    const { value, setFalse } = useToggle(false)
    setFalse()
    expect(value()).toBe(false)
  })

  it('combines toggle, setTrue, and setFalse correctly', () => {
    const { value, toggle, setTrue, setFalse } = useToggle()
    expect(value()).toBe(false)

    setTrue()
    expect(value()).toBe(true)

    setFalse()
    expect(value()).toBe(false)

    toggle()
    expect(value()).toBe(true)

    setFalse()
    expect(value()).toBe(false)
  })
})
