import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { usePrevious } from '../usePrevious'

describe('usePrevious', () => {
  it('returns undefined initially', () => {
    const source = signal(1)
    const prev = usePrevious(source)
    expect(prev()).toBeUndefined()
  })

  it('returns the previous value after source changes', () => {
    const source = signal(1)
    const prev = usePrevious(source)
    expect(prev()).toBeUndefined()

    source.set(2)
    expect(prev()).toBe(1)
  })

  it('tracks multiple changes', () => {
    const source = signal('a')
    const prev = usePrevious(source)
    expect(prev()).toBeUndefined()

    source.set('b')
    expect(prev()).toBe('a')

    source.set('c')
    expect(prev()).toBe('b')

    source.set('d')
    expect(prev()).toBe('c')
  })

  it('works with number values', () => {
    const source = signal(10)
    const prev = usePrevious(source)
    expect(prev()).toBeUndefined()

    source.set(20)
    expect(prev()).toBe(10)

    source.set(30)
    expect(prev()).toBe(20)
  })

  it('works with object values', () => {
    const obj1 = { x: 1 }
    const obj2 = { x: 2 }
    const source = signal(obj1)
    const prev = usePrevious(source)
    expect(prev()).toBeUndefined()

    source.set(obj2)
    expect(prev()).toBe(obj1)
  })

  it('works with null values', () => {
    const source = signal<string | null>('hello')
    const prev = usePrevious(source)
    expect(prev()).toBeUndefined()

    source.set(null)
    expect(prev()).toBe('hello')

    source.set('world')
    expect(prev()).toBeNull()
  })
})
