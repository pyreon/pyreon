/**
 * REGRESSION: `AstCache` was unbounded — keyed by FNV-1a hash of source
 * text with `cache: Map<string, …>` and no eviction. A long-running LSP
 * session or `pyreon-lint --watch` editing across many files would
 * accumulate one entry per UNIQUE content snapshot ever seen.
 *
 * Each entry holds an oxc-parsed AST (multi-MB for a medium TSX file)
 * + a `LineIndex`. After hours of editing, hundreds of MB of heap.
 *
 * Fix: LRU bound (default 256 entries). The first key in `Map.keys()`
 * is the oldest (insertion order); `get` / `set` touches refresh the
 * recency by re-inserting at the tail.
 */
import type { LineIndex } from '../utils/source'
import { describe, expect, it } from 'vitest'
import { AstCache } from '../cache'

const fakeLineIndex: LineIndex = { lineCount: 1, lineStarts: [0] } as unknown as LineIndex
const fakeEntry = (i: number) => ({ program: { __i: i }, lineIndex: fakeLineIndex })

describe('AstCache — LRU-bounded growth', () => {
  it('REGRESSION: cache size never exceeds maxEntries even after many distinct inserts', () => {
    const cache = new AstCache(10)
    for (let i = 0; i < 100; i++) {
      cache.set(`source-${i}`, fakeEntry(i))
    }
    expect(cache.size).toBe(10)
  })

  it('evicts the least-recently-used entry on overflow', () => {
    const cache = new AstCache(3)
    cache.set('a', fakeEntry(1))
    cache.set('b', fakeEntry(2))
    cache.set('c', fakeEntry(3))

    // 'a' is the oldest. Inserting 'd' should evict 'a'.
    cache.set('d', fakeEntry(4))
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBeDefined()
    expect(cache.get('c')).toBeDefined()
    expect(cache.get('d')).toBeDefined()
  })

  it('`get` refreshes recency — touched entry survives next eviction', () => {
    const cache = new AstCache(3)
    cache.set('a', fakeEntry(1))
    cache.set('b', fakeEntry(2))
    cache.set('c', fakeEntry(3))

    // Touch 'a' → 'a' becomes most-recently-used; 'b' is now LRU.
    cache.get('a')

    // Insert 'd' → 'b' should be evicted, not 'a'.
    cache.set('d', fakeEntry(4))
    expect(cache.get('a')).toBeDefined()
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('c')).toBeDefined()
    expect(cache.get('d')).toBeDefined()
  })

  it('re-setting an existing key refreshes recency (no double-counting)', () => {
    const cache = new AstCache(2)
    cache.set('a', fakeEntry(1))
    cache.set('b', fakeEntry(2))
    expect(cache.size).toBe(2)

    // Re-set 'a' with a new value. Size must stay at 2 (not 3) and
    // 'a' becomes most-recently-used.
    cache.set('a', fakeEntry(99))
    expect(cache.size).toBe(2)
    expect(cache.get('a')?.program).toEqual({ __i: 99 })

    // Now insert 'c'. 'b' should be evicted (LRU), 'a' should survive.
    cache.set('c', fakeEntry(3))
    expect(cache.get('a')).toBeDefined()
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('c')).toBeDefined()
  })

  it('default cap is sane for typical LSP usage (256 entries)', () => {
    const cache = new AstCache() // default constructor
    for (let i = 0; i < 1000; i++) {
      cache.set(`source-${i}`, fakeEntry(i))
    }
    expect(cache.size).toBe(256)
  })
})
