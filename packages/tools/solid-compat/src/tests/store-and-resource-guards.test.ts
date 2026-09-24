/**
 * `setStore`'s path forms and `createResource`'s staleness guard.
 *
 * `setStore` has three call shapes — a mutating draft function, a
 * `(...path, value)` walk, and a filter PREDICATE in path position — and the
 * walk carries its own arms for array indices, nested creation and function
 * updaters at the leaf. Only the simplest was exercised.
 *
 * `createResource`'s version counter is the other half: a slow request that
 * resolves after a newer one has landed must be discarded (leak class F).
 * Without it the UI shows the OLDER result, intermittently, which is the
 * hardest kind of bug to reproduce from a report. The catch has its OWN
 * version check for the same reason, and that one is easier to forget.
 *
 * Note on what is NOT here: `safeAssign`'s `DANGEROUS_KEYS` filter looks like
 * the obvious thing to test, but `applyAtPath`'s zero-length-path arm is not
 * reachable through `setStore` — the dispatcher only produces a path of length
 * >= 1 or takes the draft form. A test would assert a branch no caller can
 * reach. The path form is safe for a different reason worth stating: it uses
 * `Object.defineProperty`, which creates an OWN property, so a `__proto__` key
 * lands on the object rather than on `Object.prototype`. That IS asserted.
 */
import { createResource, createStore, mergeProps, splitProps } from '../index'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

describe('setStore — the path form', () => {
  test('writes a nested path without disturbing its siblings', () => {
    const [store, setStore] = createStore<{ user: { name: string; age: number }; other: number }>({
      user: { name: 'a', age: 1 },
      other: 9,
    })
    setStore('user', 'name', 'b')
    expect(store.user.name).toBe('b')
    expect(store.user.age, 'a sibling key must survive the write').toBe(1)
    expect(store.other, 'and so must an unrelated branch').toBe(9)
  })

  test('writes through an ARRAY INDEX', () => {
    const [store, setStore] = createStore<{ items: string[] }>({ items: ['a', 'b', 'c'] })
    setStore('items', 1, 'B')
    expect(store.items).toEqual(['a', 'B', 'c'])
  })

  test('a FUNCTION at the leaf receives the previous value', () => {
    // The updater form. Passing the function itself as the value — rather than
    // calling it — would store a function where a number belongs, which reads
    // as `[object Function]` wherever it renders.
    const [store, setStore] = createStore<{ n: number }>({ n: 5 })
    setStore('n', (prev: number) => prev + 1)
    expect(store.n).toBe(6)
  })

  test('a PREDICATE in path position updates every matching element', () => {
    // Solid's filter form: `setStore('items', item => item.done, 'x', true)`.
    // A predicate that matched only the first element would silently leave the
    // rest of a bulk update unapplied.
    const [store, setStore] = createStore<{ items: Array<{ id: number; done: boolean }> }>({
      items: [
        { id: 1, done: false },
        { id: 2, done: false },
        { id: 3, done: false },
      ],
    })
    setStore('items', (it: { id: number }) => it.id !== 2, 'done', true)
    expect(store.items.map((i) => i.done), 'every match, not just the first').toEqual([
      true,
      false,
      true,
    ])
  })

  test('a predicate at the LEAF replaces the matching elements wholesale', () => {
    const [store, setStore] = createStore<{ items: number[] }>({ items: [1, 2, 3] })
    setStore('items', (n: number) => n > 1, 0)
    expect(store.items).toEqual([1, 0, 0])
  })

  test('a `__proto__` path key lands as an OWN property, not on the prototype', () => {
    // The path walk uses `Object.defineProperty`, which defines an own
    // property — so this is safe by construction rather than by a filter. The
    // assertion that matters is the global one.
    const [, setStore] = createStore<Record<string, unknown>>({ safe: 1 })
    setStore('__proto__', 'polluted', 'yes')
    expect(
      ({} as Record<string, unknown>).polluted,
      'nothing may reach Object.prototype',
    ).toBeUndefined()
  })
})

describe('setStore — the mutating draft form', () => {
  test('applies mutations made to the draft', () => {
    const [store, setStore] = createStore<{ a: number; nested: { b: number } }>({
      a: 1,
      nested: { b: 2 },
    })
    setStore((s: { a: number; nested: { b: number } }) => {
      s.a = 10
      s.nested.b = 20
    })
    expect(store.a).toBe(10)
    expect(store.nested.b, 'a nested mutation must land too').toBe(20)
  })

  test('the draft is a CLONE — mutating it cannot tear the live store mid-update', () => {
    // The store is replaced wholesale once the draft settles. If the draft
    // were the live object, a throw partway through would leave the store in a
    // half-applied state.
    const [store, setStore] = createStore<{ a: number; b: number }>({ a: 1, b: 1 })
    expect(() =>
      setStore((s: { a: number; b: number }) => {
        s.a = 2
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(store.a, 'a failed update must not half-apply').toBe(1)
    expect(store.b).toBe(1)
  })
})

describe('createResource discards a superseded response', () => {
  test('a slow first request does not overwrite a fast second one', async () => {
    // Leak class F. The user types, a request goes out; they type again, a
    // second goes out and lands first. Showing the first would put the OLDER
    // results under the newer query.
    const releases: Record<number, (v: string) => void> = {}
    const [source, setSource] = createStore<{ q: number }>({ q: 1 })
    const [data] = createResource(
      () => source.q,
      (q: number) =>
        new Promise<string>((resolve) => {
          releases[q] = resolve
        }),
    )

    await sleep(10)
    setSource('q', 2)
    await sleep(10)

    releases[2]?.('SECOND') // the NEWER request lands first
    await sleep(20)
    expect(data(), 'the newest response is shown').toBe('SECOND')

    releases[1]?.('FIRST') // and now the older one arrives late
    await sleep(20)
    expect(data(), 'a stale response must not overwrite the newer one').toBe('SECOND')
  })

  test('a stale REJECTION does not surface as the current error', async () => {
    // The symmetric arm, with its own version check in the catch. Without it a
    // superseded request failing puts an error over data that loaded fine.
    const settle: Record<number, { ok: (v: string) => void; fail: (e: Error) => void }> = {}
    const [source, setSource] = createStore<{ q: number }>({ q: 1 })
    const [data] = createResource(
      () => source.q,
      (q: number) =>
        new Promise<string>((resolve, reject) => {
          settle[q] = { ok: resolve, fail: reject }
        }),
    )

    await sleep(10)
    setSource('q', 2)
    await sleep(10)
    settle[2]?.ok('GOOD')
    await sleep(20)
    expect(data()).toBe('GOOD')

    settle[1]?.fail(new Error('stale failure'))
    await sleep(20)
    expect(data(), 'a stale rejection must not disturb the settled value').toBe('GOOD')
  })
})

describe('a store-wrapped ARRAY behaves like an array', () => {
  // Two bugs, one cause: the proxy target was a plain `{}` regardless of the
  // value. `.length`, indexing and `.map()` all worked, so a store looked
  // healthy right up until something reflected over it.
  test('JSON.stringify produces an ARRAY, and does not throw', () => {
    // Before: `TypeError: 'getOwnPropertyDescriptor' on proxy: trap reported
    // non-configurability for property 'length'`. Array `length` is
    // non-configurable, and a Proxy may only report that for a property the
    // TARGET owns — which a `{}` target does not.
    const [store] = createStore<{ items: string[] }>({ items: ['a', 'b'] })
    expect(() => JSON.stringify(store.items)).not.toThrow()
    expect(JSON.stringify(store.items)).toBe('["a","b"]')
  })

  test('the WHOLE store round-trips through JSON with its arrays intact', () => {
    // The shape that matters in practice: an SSR hydration blob, a
    // localStorage write, a request body. An array serialized as
    // `{"0":"a","1":"b"}` parses back as an object, and every consumer
    // downstream then works on the wrong type.
    const [store] = createStore<{ items: string[]; nested: { list: number[] } }>({
      items: ['a', 'b'],
      nested: { list: [1, 2] },
    })
    const round = JSON.parse(JSON.stringify(store)) as { items: unknown; nested: { list: unknown } }
    expect(Array.isArray(round.items), 'a top-level array must survive').toBe(true)
    expect(Array.isArray(round.nested.list), 'and a nested one').toBe(true)
    expect(round).toEqual({ items: ['a', 'b'], nested: { list: [1, 2] } })
  })

  test('Array.isArray recognises it', () => {
    // Every `Array.isArray(x) ? ... : ...` branch in user code and in library
    // code depends on this, and it was false.
    const [store] = createStore<{ items: string[]; o: { a: number } }>({
      items: ['a'],
      o: { a: 1 },
    })
    expect(Array.isArray(store.items)).toBe(true)
    expect(Array.isArray(store.o), 'and a plain object is still not one').toBe(false)
  })

  test('spread and Object.keys give array semantics', () => {
    const [store] = createStore<{ items: string[] }>({ items: ['a', 'b', 'c'] })
    expect([...store.items]).toEqual(['a', 'b', 'c'])
    expect(Object.keys(store.items)).toEqual(['0', '1', '2'])
  })

  test('it still serializes correctly AFTER a write', () => {
    // The proxy is rebuilt per read, so a write must not reintroduce the
    // mismatch.
    const [store, setStore] = createStore<{ items: string[] }>({ items: ['a', 'b'] })
    setStore('items', 1, 'B')
    expect(JSON.stringify(store.items)).toBe('["a","B"]')
    expect(Array.isArray(store.items)).toBe(true)
  })
})

describe('store proxy traps when the path no longer resolves', () => {
  test('a held sub-proxy reports empty rather than throwing once its value is gone', () => {
    // A component can hold `store.user` across an update that sets `user` to
    // null. The traps resolve the CURRENT value on every call, so they have to
    // answer for "there is nothing there" — `in`, `Object.keys` and
    // `getOwnPropertyDescriptor` all reach that arm.
    const [store, setStore] = createStore<{ user: { name: string } | null }>({
      user: { name: 'a' },
    })
    const held = store.user as object
    expect('name' in held).toBe(true)

    setStore('user', null)
    expect('name' in held, 'a vanished value has no keys').toBe(false)
    expect(Object.keys(held)).toEqual([])
    expect(Object.getOwnPropertyDescriptor(held, 'name')).toBeUndefined()
  })
})

describe('setStore ignores a call it cannot interpret', () => {
  test('a single NON-function argument is a no-op, not a crash', () => {
    // The dispatcher handles `setStore(draftFn)` and `setStore(...path, value)`
    // and nothing else. A stray one-argument object call — the shape someone
    // reaches for coming from Solid's own merge form — must leave the store
    // alone rather than half-apply or throw.
    const [store, setStore] = createStore<{ a: number }>({ a: 1 })
    expect(() => (setStore as (v: unknown) => void)({ a: 99 })).not.toThrow()
    expect(store.a, 'nothing may be applied').toBe(1)
  })
})

describe('mergeProps and splitProps survive a source whose keys and descriptors disagree', () => {
  /** A proxy that lists a key but has no descriptor for it — legal, and what a
   *  virtual props object produces when its backing value moves underneath it.
   *  This package's own store proxy is exactly that shape: `ownKeys` reads the
   *  CURRENT value and `getOwnPropertyDescriptor` reads it again, so a value
   *  that vanishes between the two calls yields a key with no descriptor. */
  const inconsistent = new Proxy(
    {},
    {
      ownKeys: () => ['ghost', 'real'],
      getOwnPropertyDescriptor: (_t, k) =>
        k === 'real'
          ? { value: 1, enumerable: true, configurable: true, writable: true }
          : undefined,
      get: (_t, k) => (k === 'real' ? 1 : undefined),
    },
  )

  test('mergeProps skips the descriptor-less key instead of throwing', () => {
    // `Object.defineProperty(target, key, undefined)` throws. The `continue` is
    // the whole defence, and skipping the bad key must not lose the good one.
    let merged: Record<string, unknown> = {}
    expect(() => {
      merged = mergeProps(inconsistent, { extra: 2 }) as Record<string, unknown>
    }).not.toThrow()
    expect(merged.real, 'the well-formed key must still merge').toBe(1)
    expect(merged.extra).toBe(2)
  })

  test('splitProps skips it too', () => {
    let picked: Record<string, unknown> = {}
    let rest: Record<string, unknown> = {}
    expect(() => {
      const [p, r] = (splitProps as (o: never, k: never) => unknown[])(
        inconsistent as never,
        ['real'] as never,
      ) as unknown as [
        Record<string, unknown>,
        Record<string, unknown>,
      ]
      picked = p
      rest = r
    }).not.toThrow()
    expect(picked.real).toBe(1)
    expect('ghost' in rest, 'the descriptor-less key is dropped, not carried').toBe(false)
  })
})
