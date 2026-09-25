import { createRouter } from '@pyreon/router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inferSerializer } from '../serializers'
import { setUrlRouter } from '../url'
import { useUrlState } from '../use-url-state'

const settle = () => new Promise<void>((r) => setTimeout(r, 0))
const setSearch = (s: string) => history.replaceState(null, '', `/${s}`)

let dispose: (() => void) | undefined
beforeEach(() => {
  history.replaceState(null, '', '/')
  setUrlRouter(null)
})
afterEach(() => {
  setUrlRouter(null)
  dispose?.()
  dispose = undefined
  vi.restoreAllMocks()
})

// ─── 1. Router navigations refresh the signal ──────────────────────────────

describe('a navigation through the registered router updates the signal', () => {
  const routes = [
    { path: '/', component: () => null },
    { path: '/products', component: () => null },
  ]

  it('history mode: router.push("/products?page=2") is reflected', async () => {
    const router = createRouter({ routes, mode: 'history' })
    dispose = () => router.destroy()
    setUrlRouter(router)
    const page = useUrlState('page', 1)
    const onChange = vi.fn()
    const page2 = useUrlState('page', 1, { onChange })
    expect(page()).toBe(1)
    await router.push('/products?page=2')
    await settle()
    expect(page()).toBe(2)
    expect(page2()).toBe(2)
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('hash mode: router.push("/products?page=4") is reflected', async () => {
    history.replaceState(null, '', '#/')
    const router = createRouter({ routes })
    dispose = () => router.destroy()
    setUrlRouter(router)
    const page = useUrlState('page', 1)
    await router.push('/products?page=4')
    await settle()
    expect(page()).toBe(4)
  })

  it('a router registered AFTER the signal was created is still followed', async () => {
    const page = useUrlState('page', 1)
    const router = createRouter({ routes, mode: 'history' })
    dispose = () => router.destroy()
    setUrlRouter(router)
    await router.push('/?page=7')
    await settle()
    expect(page()).toBe(7)
  })

  it("a signal's own write does not report itself as an external change", async () => {
    const router = createRouter({ routes, mode: 'history' })
    dispose = () => router.destroy()
    setUrlRouter(router)
    const onChange = vi.fn()
    const page = useUrlState<number>('page', 1, { onChange })
    page.set(3)
    await settle()
    expect(page()).toBe(3)
    expect(onChange).not.toHaveBeenCalled()
  })
})

// ─── 2. Typed, separator-safe arrays ────────────────────────────────────────

describe('array params keep their element type and survive commas', () => {
  it('number[] round-trips as numbers', () => {
    setSearch('?ids=1,2,30')
    const ids = useUrlState('ids', [0])
    expect(ids()).toEqual([1, 2, 30])
    ids.set([4, 5])
    expect(new URLSearchParams(location.search).get('ids')).toBe('4,5')
    expect(useUrlState('ids', [0])()).toEqual([4, 5])
  })

  it('an element containing the separator round-trips', () => {
    const tags = useUrlState('tags', ['x'])
    tags.set(['a,b', 'c%d', 'e'])
    expect(useUrlState('tags', ['x'])()).toEqual(['a,b', 'c%d', 'e'])
  })

  it('a non-numeric element in a number[] param falls back to the default', () => {
    setSearch('?ids=1,oops')
    expect(useUrlState('ids', [9])()).toEqual([9])
  })

  it('boolean[] round-trips as booleans', () => {
    setSearch('?f=true,false')
    expect(useUrlState('f', [false])()).toEqual([true, false])
  })

  it('repeat format: number[] elements are deserialized per element', () => {
    setSearch('?n=1&n=2')
    expect(useUrlState('n', [0], { arrayFormat: 'repeat' })()).toEqual([1, 2])
  })

  it('the inferred comma serializer is exported typed too', () => {
    const { serialize, deserialize } = inferSerializer([1, 2])
    expect(deserialize(serialize([3, 4]))).toEqual([3, 4])
  })
})

// ─── 3. Half a custom codec ──────────────────────────────────────────────────

describe('a custom serialize OR deserialize alone is honoured', () => {
  it('deserialize alone is used for reading', () => {
    setSearch('?d=2024-01-02')
    const d = useUrlState('d', 'none', { deserialize: (raw) => `parsed:${raw}` })
    expect(d()).toBe('parsed:2024-01-02')
  })

  it('serialize alone is used for writing', () => {
    const n = useUrlState('n', 0, { serialize: (v) => `n${v}` })
    n.set(5)
    expect(new URLSearchParams(location.search).get('n')).toBe('n5')
  })

  it('repeat format applies a custom deserialize per element', () => {
    setSearch('?t=a&t=b')
    const t = useUrlState('t', [] as string[], {
      arrayFormat: 'repeat',
      deserialize: ((raw: string) => raw.toUpperCase()) as never,
    })
    expect(t()).toEqual(['A', 'B'])
  })
})

// ─── 4. onChange only on a real change ───────────────────────────────────────

describe('popstate only reports a change when the value changed', () => {
  it('an unrelated popstate does not fire onChange', () => {
    setSearch('?page=2')
    const onChange = vi.fn()
    useUrlState('page', 1, { onChange })
    history.replaceState(null, '', '/?page=2&other=x')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(onChange).not.toHaveBeenCalled()
    history.replaceState(null, '', '/?page=3')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(3)
  })
})

// ─── 5. Empty / invalid params fall back to the default ──────────────────────

describe('empty and invalid scalar params fall back to the default', () => {
  it('`?page=` is the default, not 0', () => {
    setSearch('?page=')
    expect(useUrlState('page', 5)()).toBe(5)
  })

  it('boolean accepts true/false/1/0 and defaults otherwise', () => {
    setSearch('?a=1&b=0&c=yes&d=true')
    expect(useUrlState('a', false)()).toBe(true)
    expect(useUrlState('b', true)()).toBe(false)
    expect(useUrlState('c', true)()).toBe(true)
    expect(useUrlState('d', false)()).toBe(true)
  })
})

describe('element codec edge cases', () => {
  it('an empty numeric element or an invalid boolean element falls back to the default', () => {
    setSearch('?a=1,&b=true,maybe')
    expect(useUrlState('a', [0])()).toEqual([0])
    expect(useUrlState('b', [false])()).toEqual([false])
  })

  it('repeat format: a custom serialize is applied per element', () => {
    const t = useUrlState('t', [0], {
      arrayFormat: 'repeat',
      serialize: ((v: number) => `#${v}`) as never,
    })
    t.set([1, 2])
    expect(new URLSearchParams(location.search).getAll('t')).toEqual(['#1', '#2'])
  })

  it('repeat format: a throwing element deserializer falls back to the default', () => {
    setSearch('?t=a')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const t = useUrlState('t', ['z'], {
      arrayFormat: 'repeat',
      deserialize: (() => {
        throw new Error('bad')
      }) as never,
    })
    expect(t()).toEqual(['z'])
    expect(warn).toHaveBeenCalled()
  })

  it('a throwing custom serializer on re-read still reports the change', () => {
    setSearch('?s=a')
    const onChange = vi.fn()
    useUrlState('s', 'x', {
      serialize: () => {
        throw new Error('nope')
      },
      onChange,
    })
    history.replaceState(null, '', '/?s=b')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(onChange).toHaveBeenCalledWith('b')
  })
})
