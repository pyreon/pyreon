import { describe, expect, it } from 'vitest'
import type { CSSProperties } from '../types'
import { addClasses, mergeClassNames, mergeStyles, nextFrame, removeClasses } from '../utils'

describe('mergeClassNames', () => {
  it('merges two class strings', () => {
    expect(mergeClassNames('a', 'b')).toBe('a b')
  })

  it('returns existing when additional is undefined', () => {
    expect(mergeClassNames('a', undefined)).toBe('a')
  })

  it('returns additional when existing is undefined', () => {
    expect(mergeClassNames(undefined, 'b')).toBe('b')
  })

  it('returns undefined when both are undefined', () => {
    expect(mergeClassNames(undefined, undefined)).toBeUndefined()
  })

  it('returns undefined when both are empty strings', () => {
    expect(mergeClassNames('', '')).toBeUndefined()
  })

  it('filters out empty strings', () => {
    expect(mergeClassNames('a', '')).toBe('a')
  })
})

describe('mergeStyles', () => {
  it('merges two style objects with b taking precedence', () => {
    const a = { color: 'red', fontSize: '12px' } as CSSProperties
    const b = { color: 'blue' } as CSSProperties
    expect(mergeStyles(a, b)).toEqual({ color: 'blue', fontSize: '12px' })
  })

  it('returns undefined when both are undefined', () => {
    expect(mergeStyles(undefined, undefined)).toBeUndefined()
  })

  it('returns b when a is undefined', () => {
    const b = { color: 'blue' } as CSSProperties
    expect(mergeStyles(undefined, b)).toBe(b)
  })

  it('returns a when b is undefined', () => {
    const a = { color: 'red' } as CSSProperties
    expect(mergeStyles(a, undefined)).toBe(a)
  })
})

describe('addClasses', () => {
  it('adds space-separated classes to an element', () => {
    const el = document.createElement('div')
    addClasses(el, 'foo bar')
    expect(el.classList.contains('foo')).toBe(true)
    expect(el.classList.contains('bar')).toBe(true)
  })

  it('does nothing when classes is undefined', () => {
    const el = document.createElement('div')
    addClasses(el, undefined)
    expect(el.classList.length).toBe(0)
  })

  it('does nothing when classes is empty string', () => {
    const el = document.createElement('div')
    addClasses(el, '')
    expect(el.classList.length).toBe(0)
  })

  it('does nothing when classes is whitespace-only', () => {
    const el = document.createElement('div')
    addClasses(el, '   ')
    expect(el.classList.length).toBe(0)
  })
})

describe('removeClasses', () => {
  it('removes space-separated classes from an element', () => {
    const el = document.createElement('div')
    el.classList.add('foo', 'bar', 'baz')
    removeClasses(el, 'foo bar')
    expect(el.classList.contains('foo')).toBe(false)
    expect(el.classList.contains('bar')).toBe(false)
    expect(el.classList.contains('baz')).toBe(true)
  })

  it('does nothing when classes is undefined', () => {
    const el = document.createElement('div')
    el.classList.add('foo')
    removeClasses(el, undefined)
    expect(el.classList.contains('foo')).toBe(true)
  })

  it('does nothing when classes is empty string', () => {
    const el = document.createElement('div')
    el.classList.add('foo')
    removeClasses(el, '')
    expect(el.classList.contains('foo')).toBe(true)
  })

  it('does nothing when classes is whitespace-only', () => {
    const el = document.createElement('div')
    el.classList.add('foo')
    removeClasses(el, '   ')
    expect(el.classList.contains('foo')).toBe(true)
  })
})

describe('nextFrame', () => {
  it('calls callback after double rAF', () => {
    const callbacks: (() => void)[] = []
    const originalRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = ((cb: () => void) => {
      callbacks.push(cb)
      return callbacks.length
    }) as typeof requestAnimationFrame

    const fn = vi.fn()
    nextFrame(fn)

    // First rAF queued
    expect(callbacks.length).toBe(1)
    expect(fn).not.toHaveBeenCalled()

    // Execute first rAF — queues second
    callbacks[0]?.()
    expect(callbacks.length).toBe(2)
    expect(fn).not.toHaveBeenCalled()

    // Execute second rAF — callback fires
    callbacks[1]?.()
    expect(fn).toHaveBeenCalledTimes(1)

    globalThis.requestAnimationFrame = originalRaf
  })
})

describe('nextFrame — shared batch (regression: 2 rAFs for N same-burst callbacks)', () => {
  let callbacks: (() => void)[]
  let originalRaf: typeof requestAnimationFrame

  beforeEach(() => {
    callbacks = []
    originalRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = ((cb: () => void) => {
      callbacks.push(cb)
      return callbacks.length
    }) as typeof requestAnimationFrame
  })

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf
  })

  it('batches N same-burst callbacks into ONE double-rAF, run in registration order', () => {
    const order: number[] = []
    for (let i = 0; i < 5; i++) nextFrame(() => order.push(i))

    // The batching lock: 5 registrations, ONE outer rAF (the old per-callback
    // implementation queued 5 here — this assertion is the bisect-load-bearing one).
    expect(callbacks.length).toBe(1)

    callbacks[0]?.() // outer fires → one inner queued
    expect(callbacks.length).toBe(2)
    expect(order).toEqual([])

    callbacks[1]?.() // inner fires → all 5 run, registration order
    expect(order).toEqual([0, 1, 2, 3, 4])
  })

  it('cancel removes ONLY its own callback, in any phase', () => {
    const a = vi.fn()
    const b = vi.fn()
    nextFrame(a)
    const cancelB = nextFrame(b)

    cancelB() // cancel before any frame
    callbacks[0]?.()
    callbacks[1]?.()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).not.toHaveBeenCalled()
  })

  it('cancel after the outer frame fired still prevents the callback (the rapid enter→leave flip)', () => {
    const fn = vi.fn()
    const cancel = nextFrame(fn)
    callbacks[0]?.() // outer fired, inner pending
    cancel()
    callbacks[1]?.() // inner fires — callback must NOT run
    expect(fn).not.toHaveBeenCalled()
  })

  it('a callback registered AFTER the outer frame opens a NEW batch (keeps its own double-frame)', () => {
    const a = vi.fn()
    const b = vi.fn()
    nextFrame(a)
    callbacks[0]?.() // a's outer fires — batch closed

    nextFrame(b)
    // b must get its OWN outer frame (joining a's inner would run b only one
    // frame after registration — its "from" state would never paint).
    expect(callbacks.length).toBe(3) // a-outer, a-inner, b-outer

    callbacks[1]?.() // a-inner → a runs, b does not
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).not.toHaveBeenCalled()

    callbacks[2]?.() // b-outer → b-inner queued
    callbacks[3]?.() // b-inner → b runs
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('is SSR-safe: no requestAnimationFrame → no-op cancel, no throw', () => {
    const raf = globalThis.requestAnimationFrame
    // @ts-expect-error — simulating SSR
    delete globalThis.requestAnimationFrame
    try {
      const cancel = nextFrame(vi.fn())
      expect(() => cancel()).not.toThrow()
    } finally {
      globalThis.requestAnimationFrame = raf
    }
  })
})
