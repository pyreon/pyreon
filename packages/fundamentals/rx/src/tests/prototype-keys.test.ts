import { signal } from '@pyreon/reactivity'
import { countBy, groupBy, keyBy, mapValues } from '../collections'
import { search } from '../search'

// Record-building operators must produce PROTOTYPE-FREE results. A plain `{}`
// accumulator reads inherited members (`constructor`, `toString`) as if they
// were existing buckets and turns a `__proto__` key into a prototype write.
const ITEMS = [
  { k: 'constructor', v: 1 },
  { k: 'constructor', v: 2 },
  { k: '__proto__', v: 3 },
  { k: 'toString', v: 4 },
  { k: 'hasOwnProperty', v: 5 },
]

describe('rx record operators — prototype-named keys', () => {
  it('groupBy buckets inherited-member keys instead of throwing', () => {
    const g = groupBy(ITEMS, 'k')
    expect(g.constructor).toEqual([ITEMS[0], ITEMS[1]])
    expect(g.toString).toEqual([ITEMS[3]])
    expect(Object.keys(g).sort()).toEqual(['__proto__', 'constructor', 'hasOwnProperty', 'toString'])
    expect(Object.hasOwn(g, '__proto__')).toBe(true)
    expect(g.__proto__).toEqual([ITEMS[2]])
  })

  it('keyBy stores a __proto__ key as data, never as the prototype', () => {
    const k = keyBy(ITEMS, 'k')
    expect(Object.getPrototypeOf(k)).toBe(null)
    expect(Object.hasOwn(k, '__proto__')).toBe(true)
    expect(k.__proto__).toEqual(ITEMS[2])
    expect(k.constructor).toEqual(ITEMS[1])
  })

  it('countBy counts every bucket, including inherited-member names', () => {
    const c = countBy(ITEMS, 'k')
    expect({ ...c }).toEqual(
      Object.fromEntries([
        ['constructor', 2],
        ['__proto__', 1],
        ['toString', 1],
        ['hasOwnProperty', 1],
      ]),
    )
    expect(c.constructor).toBe(2)
    expect(c.toString).toBe(1)
    expect(Object.hasOwn(c, '__proto__')).toBe(true)
  })

  it('mapValues preserves a __proto__ key as data', () => {
    const src = groupBy(ITEMS, 'k')
    const m = mapValues(src, (g) => g.length)
    expect(Object.hasOwn(m, '__proto__')).toBe(true)
    expect(m.__proto__).toBe(1)
    expect(m.constructor).toBe(2)
  })

  it('signal inputs get the same prototype-free result', () => {
    const s = signal(ITEMS)
    expect(countBy(s, 'k')().constructor).toBe(2)
    expect(Object.getPrototypeOf(groupBy(s, 'k')())).toBe(null)
  })
})

describe('rx search — typed overloads', () => {
  it('plain inputs return a plain array; signal inputs return a computed', () => {
    const users = [{ name: 'Ann' }, { name: 'Bob' }]
    const plain: { name: string }[] = search(users, 'an', ['name'])
    expect(plain).toEqual([{ name: 'Ann' }])
    const q = signal('bo')
    const reactive = search(users, q, ['name'])
    expect(reactive()).toEqual([{ name: 'Bob' }])
    q.set('')
    expect(reactive()).toEqual(users)
  })
})
