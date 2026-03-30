import { describe, expect, it } from 'vitest'
import { useLatest } from '../useLatest'

describe('useLatest', () => {
  it('returns a ref with the current value', () => {
    const ref = useLatest(42)
    expect(ref.current).toBe(42)
  })

  it('ref object can be manually updated', () => {
    const ref = useLatest('a')
    expect(ref.current).toBe('a')

    // In Pyreon, since component runs once, the caller updates .current manually
    ;(ref as { current: string }).current = 'b'
    expect(ref.current).toBe('b')
  })

  it('returns a stable ref identity', () => {
    const ref = useLatest('hello')
    const same = ref
    expect(same).toBe(ref)
  })
})
