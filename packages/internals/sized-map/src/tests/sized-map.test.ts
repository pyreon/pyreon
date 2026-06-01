import { SizedMap } from '../index'

describe('SizedMap', () => {
  describe('basic Map surface', () => {
    it('set + get + has + delete + size + clear behave like Map', () => {
      const m = new SizedMap<string, number>({ maxEntries: 4 })
      expect(m.size).toBe(0)
      expect(m.has('a')).toBe(false)
      expect(m.get('a')).toBeUndefined()

      m.set('a', 1)
      m.set('b', 2)
      expect(m.size).toBe(2)
      expect(m.has('a')).toBe(true)
      expect(m.get('a')).toBe(1)
      expect(m.get('b')).toBe(2)

      expect(m.delete('a')).toBe(true)
      expect(m.delete('a')).toBe(false)
      expect(m.has('a')).toBe(false)
      expect(m.size).toBe(1)

      m.clear()
      expect(m.size).toBe(0)
      expect(m.has('b')).toBe(false)
    })

    it('exposes iterators in insertion order', () => {
      const m = new SizedMap<string, number>({ maxEntries: 4 })
      m.set('a', 1)
      m.set('b', 2)
      m.set('c', 3)
      expect([...m.keys()]).toEqual(['a', 'b', 'c'])
      expect([...m.values()]).toEqual([1, 2, 3])
      expect([...m.entries()]).toEqual([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ])
      expect([...m]).toEqual([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ])
    })

    it('clamps maxEntries to >= 1 for sub-1 inputs', () => {
      const m = new SizedMap<string, number>({ maxEntries: 0 })
      m.set('a', 1)
      m.set('b', 2)
      // 0 clamps to 1 → second set evicts first.
      expect(m.size).toBe(1)
      expect(m.has('a')).toBe(false)
      expect(m.get('b')).toBe(2)
    })
  })

  describe('FIFO mode (default, lru: false)', () => {
    it('evicts the oldest entry when set exceeds maxEntries', () => {
      const m = new SizedMap<string, number>({ maxEntries: 3 })
      m.set('a', 1)
      m.set('b', 2)
      m.set('c', 3)
      m.set('d', 4) // evicts 'a'
      expect(m.size).toBe(3)
      expect(m.has('a')).toBe(false)
      expect([...m.keys()]).toEqual(['b', 'c', 'd'])
    })

    it('get does NOT touch insertion order', () => {
      const m = new SizedMap<string, number>({ maxEntries: 3 })
      m.set('a', 1)
      m.set('b', 2)
      m.set('c', 3)
      // Read 'a' repeatedly — should NOT promote it.
      m.get('a')
      m.get('a')
      m.get('a')
      m.set('d', 4) // still evicts 'a' (it's oldest)
      expect(m.has('a')).toBe(false)
      expect([...m.keys()]).toEqual(['b', 'c', 'd'])
    })

    it('set on existing key refreshes position (recency hit)', () => {
      const m = new SizedMap<string, number>({ maxEntries: 3 })
      m.set('a', 1)
      m.set('b', 2)
      m.set('c', 3)
      m.set('a', 99) // re-set 'a' → moves to tail with new value
      m.set('d', 4) // evicts 'b' (now oldest after 'a' was moved)
      expect(m.size).toBe(3)
      expect(m.get('a')).toBe(99)
      expect(m.has('b')).toBe(false)
      expect([...m.keys()]).toEqual(['c', 'a', 'd'])
    })
  })

  describe('LRU mode (lru: true)', () => {
    it('get moves the entry to the tail (touch)', () => {
      const m = new SizedMap<string, number>({ maxEntries: 3, lru: true })
      m.set('a', 1)
      m.set('b', 2)
      m.set('c', 3)
      m.get('a') // touch 'a' → moves to tail
      m.set('d', 4) // evicts 'b' (now oldest)
      expect(m.has('a')).toBe(true)
      expect(m.has('b')).toBe(false)
      expect([...m.keys()]).toEqual(['c', 'a', 'd'])
    })

    it('get on missing key does not allocate or insert', () => {
      const m = new SizedMap<string, number>({ maxEntries: 3, lru: true })
      m.set('a', 1)
      expect(m.get('zzz')).toBeUndefined()
      expect(m.size).toBe(1)
      expect([...m.keys()]).toEqual(['a'])
    })

    it('set on existing key refreshes position (same as FIFO)', () => {
      const m = new SizedMap<string, number>({ maxEntries: 3, lru: true })
      m.set('a', 1)
      m.set('b', 2)
      m.set('c', 3)
      m.set('a', 99)
      m.set('d', 4) // evicts 'b'
      expect(m.has('b')).toBe(false)
      expect(m.get('a')).toBe(99)
    })

    it('repeated reads of the oldest entry keep it alive under cap pressure', () => {
      const m = new SizedMap<string, number>({ maxEntries: 3, lru: true })
      m.set('a', 1)
      m.set('b', 2)
      m.set('c', 3)
      // Continuously touch 'a' between sets.
      m.get('a')
      m.set('d', 4) // evicts 'b' (oldest is 'b' now)
      m.get('a')
      m.set('e', 5) // evicts 'c'
      expect(m.has('a')).toBe(true)
      expect([...m.keys()]).toEqual(['d', 'a', 'e'])
    })
  })

  describe('value types', () => {
    it('preserves identity of stored values (no clone)', () => {
      const m = new SizedMap<string, { x: number }>({ maxEntries: 2 })
      const v = { x: 42 }
      m.set('a', v)
      expect(m.get('a')).toBe(v)
    })

    it('treats undefined as absent', () => {
      // Map can technically store undefined as a value, but our get-hit check
      // uses `value === undefined` for both "missing" and "stored undefined" —
      // document the contract: don't store undefined.
      const m = new SizedMap<string, number | undefined>({ maxEntries: 2 })
      m.set('a', undefined)
      expect(m.has('a')).toBe(true)
      // get returns undefined regardless — caller must use has() to distinguish.
      expect(m.get('a')).toBeUndefined()
    })
  })
})
