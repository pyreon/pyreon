import { mapArray } from '../map-array'

describe('mapArray', () => {
  describe('basic mapping', () => {
    test('maps all items on first call', () => {
      const mapped = mapArray(
        () => [1, 2, 3],
        (item) => item,
        (item) => item * 10,
      )
      expect(mapped()).toEqual([10, 20, 30])
    })

    test('returns empty array for empty source', () => {
      const mapped = mapArray(
        () => [],
        (item: number) => item,
        (item) => item * 10,
      )
      expect(mapped()).toEqual([])
    })

    test('maps single item', () => {
      const mapped = mapArray(
        () => [42],
        (item) => item,
        (item) => `value-${item}`,
      )
      expect(mapped()).toEqual(['value-42'])
    })
  })

  describe('caching behavior', () => {
    test('caches results — map function called once per key', () => {
      let callCount = 0
      const items = [1, 2, 3]
      const mapped = mapArray(
        () => items,
        (item) => item,
        (item) => {
          callCount++
          return item * 10
        },
      )

      mapped()
      expect(callCount).toBe(3)

      // Second call — all cached
      mapped()
      expect(callCount).toBe(3)

      // Third call — still cached
      mapped()
      expect(callCount).toBe(3)
    })

    test('only maps new keys when items are added', () => {
      let callCount = 0
      let items = [1, 2, 3]
      const mapped = mapArray(
        () => items,
        (item) => item,
        (item) => {
          callCount++
          return item * 10
        },
      )

      mapped()
      expect(callCount).toBe(3)

      items = [1, 2, 3, 4, 5]
      mapped()
      expect(callCount).toBe(5) // only 4 and 5 are new
    })

    test('does not re-map when items are removed', () => {
      let callCount = 0
      let items = [1, 2, 3, 4, 5]
      const mapped = mapArray(
        () => items,
        (item) => item,
        (item) => {
          callCount++
          return item * 10
        },
      )

      mapped()
      expect(callCount).toBe(5)

      items = [1, 3, 5] // remove 2 and 4
      const result = mapped()
      expect(result).toEqual([10, 30, 50])
      expect(callCount).toBe(5) // no new calls
    })
  })

  describe('key eviction', () => {
    test('evicted keys are re-mapped when they return', () => {
      let callCount = 0
      let items = [1, 2, 3]
      const mapped = mapArray(
        () => items,
        (item) => item,
        (item) => {
          callCount++
          return item * 10
        },
      )

      mapped()
      expect(callCount).toBe(3)

      // Remove key 2
      items = [1, 3]
      mapped()
      expect(callCount).toBe(3) // no new mapping

      // Re-add key 2 — should re-map since it was evicted
      items = [1, 2, 3]
      mapped()
      expect(callCount).toBe(4) // key 2 re-mapped
    })

    test('evicts all keys when source becomes empty', () => {
      let callCount = 0
      let items: number[] = [1, 2, 3]
      const mapped = mapArray(
        () => items,
        (item) => item,
        (item) => {
          callCount++
          return item * 10
        },
      )

      mapped()
      expect(callCount).toBe(3)

      items = []
      mapped()
      expect(callCount).toBe(3)

      // All keys were evicted — re-adding requires re-mapping
      items = [1, 2, 3]
      mapped()
      expect(callCount).toBe(6)
    })
  })

  describe('reordering', () => {
    test('reordered items use cached values (no re-mapping)', () => {
      let callCount = 0
      let items = [1, 2, 3]
      const mapped = mapArray(
        () => items,
        (item) => item,
        (item) => {
          callCount++
          return item * 10
        },
      )

      mapped()
      expect(callCount).toBe(3)

      items = [3, 1, 2]
      const result = mapped()
      expect(result).toEqual([30, 10, 20])
      expect(callCount).toBe(3) // no new calls
    })

    test('reverse order uses cached values', () => {
      let callCount = 0
      let items = [1, 2, 3, 4]
      const mapped = mapArray(
        () => items,
        (item) => item,
        (item) => {
          callCount++
          return `item-${item}`
        },
      )

      mapped()
      items = [4, 3, 2, 1]
      const result = mapped()
      expect(result).toEqual(['item-4', 'item-3', 'item-2', 'item-1'])
      expect(callCount).toBe(4) // initial 4 only
    })
  })

  describe('string keys', () => {
    test('works with string keys from objects', () => {
      interface User {
        id: string
        name: string
      }
      let callCount = 0
      let users: User[] = [
        { id: 'a', name: 'Alice' },
        { id: 'b', name: 'Bob' },
      ]
      const mapped = mapArray(
        () => users,
        (u) => u.id,
        (u) => {
          callCount++
          return u.name.toUpperCase()
        },
      )

      expect(mapped()).toEqual(['ALICE', 'BOB'])
      expect(callCount).toBe(2)

      // Add new user
      users = [
        { id: 'a', name: 'Alice' },
        { id: 'b', name: 'Bob' },
        { id: 'c', name: 'Charlie' },
      ]
      expect(mapped()).toEqual(['ALICE', 'BOB', 'CHARLIE'])
      expect(callCount).toBe(3)
    })
  })

  describe('mixed additions and removals', () => {
    test('simultaneous add and remove', () => {
      let callCount = 0
      let items = [1, 2, 3]
      const mapped = mapArray(
        () => items,
        (item) => item,
        (item) => {
          callCount++
          return item * 10
        },
      )

      mapped()
      expect(callCount).toBe(3)

      // Remove 2, add 4
      items = [1, 3, 4]
      const result = mapped()
      expect(result).toEqual([10, 30, 40])
      expect(callCount).toBe(4) // only key 4 is new
    })

    test('complete replacement of all items', () => {
      let callCount = 0
      let items = [1, 2, 3]
      const mapped = mapArray(
        () => items,
        (item) => item,
        (item) => {
          callCount++
          return item * 10
        },
      )

      mapped()
      expect(callCount).toBe(3)

      items = [4, 5, 6]
      const result = mapped()
      expect(result).toEqual([40, 50, 60])
      expect(callCount).toBe(6) // all new
    })
  })

  describe('duplicate keys', () => {
    test('duplicate keys in source share the same cached value', () => {
      let callCount = 0
      const mapped = mapArray(
        () => [1, 1, 2],
        (item) => item,
        (item) => {
          callCount++
          return item * 10
        },
      )

      const result = mapped()
      // Key 1 mapped once, key 2 mapped once
      expect(callCount).toBe(2)
      // Both occurrences of key 1 get the same cached value
      expect(result).toEqual([10, 10, 20])
    })
  })

  describe('map function receives correct item', () => {
    test('map receives the item, not the key', () => {
      const received: Array<{ id: number; val: string }> = []
      const items = [
        { id: 1, val: 'a' },
        { id: 2, val: 'b' },
      ]
      const mapped = mapArray(
        () => items,
        (item) => item.id,
        (item) => {
          received.push(item)
          return item.val
        },
      )
      mapped()
      expect(received).toEqual(items)
    })
  })
})
