import { describe, expect, it, vi } from 'vitest'
import { useMergedRef } from '../useMergedRef'

describe('useMergedRef', () => {
  it('sets object refs', () => {
    const ref1 = { current: null as HTMLDivElement | null }
    const ref2 = { current: null as HTMLDivElement | null }

    const merged = useMergedRef(ref1, ref2)

    const node = document.createElement('div')
    merged(node)

    expect(ref1.current).toBe(node)
    expect(ref2.current).toBe(node)
  })

  it('calls callback refs', () => {
    const cb = vi.fn()
    const objRef = { current: null as HTMLDivElement | null }

    const merged = useMergedRef(cb, objRef)

    const node = document.createElement('div')
    merged(node)

    expect(cb).toHaveBeenCalledWith(node)
    expect(objRef.current).toBe(node)
  })

  it('skips undefined refs', () => {
    const ref = { current: null as HTMLDivElement | null }
    const merged = useMergedRef(undefined, ref)

    const node = document.createElement('div')
    merged(node)

    expect(ref.current).toBe(node)
  })

  it('handles null node (unmount)', () => {
    const cb = vi.fn()
    const merged = useMergedRef(cb)

    merged(null)
    expect(cb).toHaveBeenCalledWith(null)
  })
})
