import { describe, expect, test } from 'vitest'
import { ScrollManager } from '../scroll'

describe('ScrollManager — LRU bound', () => {
  test('evicts oldest entry when cap (100) is exceeded', () => {
    const mgr = new ScrollManager('top')
    // Fake window.scrollY for each save — happy-dom provides window.
    Object.defineProperty(window, 'scrollY', { value: 42, configurable: true })
    // Save 150 distinct paths.
    for (let i = 0; i < 150; i++) mgr.save(`/path-${i}`)
    // Oldest 50 evicted; newest 100 remain.
    expect(mgr.getSavedPosition('/path-0')).toBeNull()
    expect(mgr.getSavedPosition('/path-49')).toBeNull()
    expect(mgr.getSavedPosition('/path-50')).toBe(42)
    expect(mgr.getSavedPosition('/path-149')).toBe(42)
  })

  test('re-saving an existing path bumps it to newest (LRU, not FIFO)', () => {
    const mgr = new ScrollManager('top')
    Object.defineProperty(window, 'scrollY', { value: 42, configurable: true })
    for (let i = 0; i < 100; i++) mgr.save(`/path-${i}`)
    // Touch the oldest entry — should move to newest.
    Object.defineProperty(window, 'scrollY', { value: 99, configurable: true })
    mgr.save('/path-0')
    // Now add one more to push out the new-oldest (/path-1).
    mgr.save('/new-path')
    expect(mgr.getSavedPosition('/path-1')).toBeNull()
    expect(mgr.getSavedPosition('/path-0')).toBe(99)
    expect(mgr.getSavedPosition('/new-path')).toBe(99)
  })
})
