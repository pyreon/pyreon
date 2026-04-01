import { effect } from '@pyreon/reactivity'
import { setUrlRouter, useUrlState } from '../index'
import { inferSerializer } from '../serializers'

/** Helper: set window.location.search. */
function setSearch(search: string) {
  const url = new URL(window.location.href)
  url.search = search
  history.replaceState(null, '', url.toString())
}

beforeEach(() => {
  setSearch('')
  setUrlRouter(null)
})

afterEach(() => {
  setSearch('')
  setUrlRouter(null)
})

// ─── useUrlState single param ───────────────────────────────────────────────

describe('useUrlState single param', () => {
  it('returns default when param not in URL', () => {
    const page = useUrlState('page', 1)
    expect(page()).toBe(1)
  })

  it('reads initial value from URL', () => {
    setSearch('?page=5')
    const page = useUrlState('page', 1)
    expect(page()).toBe(5)
  })

  it('.set() updates signal and URL', () => {
    const page = useUrlState('page', 1)
    page.set(3)
    expect(page()).toBe(3)
    expect(new URLSearchParams(window.location.search).get('page')).toBe('3')
  })

  it('.reset() returns to default and cleans URL', () => {
    setSearch('?page=5')
    const page = useUrlState('page', 1)
    page.reset()
    expect(page()).toBe(1)
    expect(new URLSearchParams(window.location.search).has('page')).toBe(false)
  })

  it('.remove() removes param from URL entirely', () => {
    const page = useUrlState('page', 1)
    page.set(5)
    expect(new URLSearchParams(window.location.search).get('page')).toBe('5')

    page.remove()
    expect(page()).toBe(1)
    expect(new URLSearchParams(window.location.search).has('page')).toBe(false)
  })

  it('removes param from URL when value equals default', () => {
    const page = useUrlState('page', 1)
    page.set(5)
    expect(new URLSearchParams(window.location.search).get('page')).toBe('5')
    page.set(1) // back to default
    expect(new URLSearchParams(window.location.search).has('page')).toBe(false)
  })

  it('preserves other params when modifying one', () => {
    setSearch('?page=1&q=hello')
    const page = useUrlState('page', 1)
    page.set(5)
    expect(new URLSearchParams(window.location.search).get('q')).toBe('hello')
    expect(new URLSearchParams(window.location.search).get('page')).toBe('5')
  })
})

// ─── Signal update changes URL ──────────────────────────────────────────────

describe('signal update changes URL', () => {
  it('string value updates URL correctly', () => {
    const name = useUrlState('name', '')
    name.set('alice')
    expect(new URLSearchParams(window.location.search).get('name')).toBe('alice')
  })

  it('number value updates URL correctly', () => {
    const count = useUrlState('count', 0)
    count.set(42)
    expect(new URLSearchParams(window.location.search).get('count')).toBe('42')
  })

  it('boolean value updates URL correctly', () => {
    const active = useUrlState('active', false)
    active.set(true)
    expect(new URLSearchParams(window.location.search).get('active')).toBe('true')
  })

  it('array value updates URL correctly (comma format)', () => {
    const tags = useUrlState('tags', [] as string[])
    tags.set(['a', 'b', 'c'])
    expect(new URLSearchParams(window.location.search).get('tags')).toBe('a,b,c')
  })

  it('array value updates URL correctly (repeat format)', () => {
    const tags = useUrlState('tags', [] as string[], { arrayFormat: 'repeat' })
    tags.set(['x', 'y'])
    expect(new URLSearchParams(window.location.search).getAll('tags')).toEqual(['x', 'y'])
  })

  it('object value updates URL as JSON', () => {
    const filter = useUrlState('filter', { min: 0, max: 100 })
    filter.set({ min: 5, max: 50 })
    const raw = new URLSearchParams(window.location.search).get('filter')
    expect(JSON.parse(raw!)).toEqual({ min: 5, max: 50 })
  })
})

// ─── Type coercion ──────────────────────────────────────────────────────────

describe('type coercion from URL', () => {
  it('coerces number from string', () => {
    setSearch('?count=42')
    const count = useUrlState('count', 0)
    expect(count()).toBe(42)
    expect(typeof count()).toBe('number')
  })

  it('coerces boolean true', () => {
    setSearch('?active=true')
    const active = useUrlState('active', false)
    expect(active()).toBe(true)
    expect(typeof active()).toBe('boolean')
  })

  it('coerces boolean false', () => {
    setSearch('?active=false')
    const active = useUrlState('active', true)
    expect(active()).toBe(false)
  })

  it('handles string identity', () => {
    setSearch('?name=alice')
    const name = useUrlState('name', '')
    expect(name()).toBe('alice')
  })

  it('handles comma-separated arrays', () => {
    setSearch('?tags=a,b,c')
    const tags = useUrlState('tags', [] as string[])
    expect(tags()).toEqual(['a', 'b', 'c'])
  })

  it('handles empty array from empty string', () => {
    setSearch('?tags=')
    const tags = useUrlState('tags', [] as string[])
    expect(tags()).toEqual([])
  })

  it('handles object via JSON', () => {
    setSearch(`?filter=${encodeURIComponent(JSON.stringify({ a: 1 }))}`)
    const filter = useUrlState('filter', { a: 0 })
    expect(filter()).toEqual({ a: 1 })
  })

  it('falls back to default for NaN number values', () => {
    setSearch('?count=abc')
    const count = useUrlState('count', 0)
    expect(count()).toBe(0)
  })

  it('reads repeated keys from URL', () => {
    setSearch('?tags=a&tags=b&tags=c')
    const tags = useUrlState('tags', [] as string[], { arrayFormat: 'repeat' })
    expect(tags()).toEqual(['a', 'b', 'c'])
  })
})

// ─── Schema mode ────────────────────────────────────────────────────────────

describe('schema mode with multiple params', () => {
  it('returns signals for each schema key', () => {
    const state = useUrlState({ page: 1, q: '', sort: 'name' })
    expect(state.page()).toBe(1)
    expect(state.q()).toBe('')
    expect(state.sort()).toBe('name')
  })

  it('reads initial values from URL', () => {
    setSearch('?page=3&q=hello&sort=date')
    const state = useUrlState({ page: 1, q: '', sort: 'name' })
    expect(state.page()).toBe(3)
    expect(state.q()).toBe('hello')
    expect(state.sort()).toBe('date')
  })

  it('set updates individual params', () => {
    const state = useUrlState({ page: 1, q: '' })
    state.q.set('search')
    expect(state.q()).toBe('search')
    expect(new URLSearchParams(window.location.search).get('q')).toBe('search')
  })

  it('reset resets individual param without affecting others', () => {
    setSearch('?page=5&q=hello')
    const state = useUrlState({ page: 1, q: '' })
    state.page.reset()
    expect(state.page()).toBe(1)
    expect(new URLSearchParams(window.location.search).get('q')).toBe('hello')
  })

  it('remove removes individual param', () => {
    const state = useUrlState({ page: 1, q: '' })
    state.q.set('test')
    state.q.remove()
    expect(state.q()).toBe('')
    expect(new URLSearchParams(window.location.search).has('q')).toBe(false)
  })
})

// ─── Popstate sync ──────────────────────────────────────────────────────────

describe('popstate sync', () => {
  it('updates signal on popstate event', () => {
    const page = useUrlState('page', 1)
    page.set(5)

    setSearch('?page=3')
    window.dispatchEvent(new Event('popstate'))
    expect(page()).toBe(3)
  })

  it('resets to default when param removed via popstate', () => {
    setSearch('?page=5')
    const page = useUrlState('page', 1)

    setSearch('')
    window.dispatchEvent(new Event('popstate'))
    expect(page()).toBe(1)
  })

  it('syncs repeated keys on popstate', () => {
    const tags = useUrlState('tags', [] as string[], { arrayFormat: 'repeat' })
    tags.set(['a', 'b'])

    setSearch('?tags=x&tags=y&tags=z')
    window.dispatchEvent(new Event('popstate'))
    expect(tags()).toEqual(['x', 'y', 'z'])
  })
})

// ─── Debounce ───────────────────────────────────────────────────────────────

describe('debounce', () => {
  it('batches rapid writes to URL', () => {
    vi.useFakeTimers()
    const page = useUrlState('page', 1, { debounce: 50 })

    page.set(2)
    page.set(3)
    page.set(4)

    // Signal updates immediately
    expect(page()).toBe(4)
    // URL not yet updated
    expect(new URLSearchParams(window.location.search).has('page')).toBe(false)

    vi.advanceTimersByTime(50)
    expect(new URLSearchParams(window.location.search).get('page')).toBe('4')

    vi.useRealTimers()
  })

  it('.remove() cancels pending debounced write', () => {
    vi.useFakeTimers()
    const page = useUrlState('page', 1, { debounce: 100 })

    page.set(5)
    page.remove()

    expect(page()).toBe(1)
    expect(new URLSearchParams(window.location.search).has('page')).toBe(false)

    vi.advanceTimersByTime(100)
    expect(new URLSearchParams(window.location.search).has('page')).toBe(false)

    vi.useRealTimers()
  })
})

// ─── History mode ───────────────────────────────────────────────────────────

describe('history mode', () => {
  it('uses replaceState by default', () => {
    const spy = vi.spyOn(history, 'replaceState')
    const page = useUrlState('page', 1)
    page.set(2)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('uses pushState when replace: false', () => {
    const spy = vi.spyOn(history, 'pushState')
    const page = useUrlState('page', 1, { replace: false })
    page.set(2)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

// ─── Custom serializer ─────────────────────────────────────────────────────

describe('custom serializer', () => {
  it('uses custom serialize/deserialize pair', () => {
    setSearch('?date=2024-01-15')
    const date = useUrlState('date', new Date(0), {
      serialize: (d) => d.toISOString().slice(0, 10),
      deserialize: (s) => new Date(s),
    })
    expect(date().getFullYear()).toBe(2024)

    date.set(new Date('2025-06-01'))
    expect(new URLSearchParams(window.location.search).get('date')).toBe('2025-06-01')
  })
})

// ─── Reactivity ─────────────────────────────────────────────────────────────

describe('reactivity', () => {
  it('signal is reactive in effects', () => {
    const page = useUrlState('page', 1)
    const values: number[] = []

    const fx = effect(() => {
      values.push(page())
    })

    page.set(2)
    page.set(3)

    expect(values).toEqual([1, 2, 3])
    fx.dispose()
  })
})

// ─── Router integration ────────────────────────────────────────────────────

describe('router integration', () => {
  it('uses router.replace() when router is set', () => {
    const calls: string[] = []
    setUrlRouter({
      replace: (path: string) => {
        calls.push(path)
        history.replaceState(null, '', path)
      },
    })

    const page = useUrlState('page', 1)
    page.set(3)
    expect(calls.length).toBe(1)
    expect(calls[0]).toContain('page=3')
  })

  it('router.replace() used for remove()', () => {
    const calls: string[] = []
    setUrlRouter({
      replace: (path: string) => {
        calls.push(path)
        history.replaceState(null, '', path)
      },
    })

    const page = useUrlState('page', 1)
    page.set(5)
    calls.length = 0

    page.remove()
    expect(calls.length).toBe(1)
    expect(calls[0]).not.toContain('page=')
  })
})

// ─── onChange callback ──────────────────────────────────────────────────────

describe('onChange callback', () => {
  it('fires on popstate (external change)', () => {
    const changes: number[] = []
    useUrlState('page', 1, { onChange: (v) => changes.push(v) })

    setSearch('?page=7')
    window.dispatchEvent(new Event('popstate'))
    expect(changes).toEqual([7])
  })

  it('does not fire on .set()', () => {
    const changes: number[] = []
    const page = useUrlState('page', 1, { onChange: (v) => changes.push(v) })
    page.set(2)
    expect(changes).toEqual([])
  })

  it('does not fire on .reset()', () => {
    const changes: number[] = []
    const page = useUrlState('page', 1, { onChange: (v) => changes.push(v) })
    page.set(5)
    page.reset()
    expect(changes).toEqual([])
  })
})

// ─── inferSerializer unit tests ─────────────────────────────────────────────

describe('inferSerializer', () => {
  it('infers number serializer', () => {
    const { serialize, deserialize } = inferSerializer(0)
    expect(serialize(42)).toBe('42')
    expect(deserialize('42')).toBe(42)
  })

  it('infers boolean serializer', () => {
    const { serialize, deserialize } = inferSerializer(false)
    expect(serialize(true)).toBe('true')
    expect(deserialize('true')).toBe(true)
    expect(deserialize('false')).toBe(false)
  })

  it('infers string serializer', () => {
    const { serialize, deserialize } = inferSerializer('')
    expect(serialize('hello')).toBe('hello')
    expect(deserialize('hello')).toBe('hello')
  })

  it('infers array serializer with comma format', () => {
    const { serialize, deserialize } = inferSerializer([] as string[])
    expect(serialize(['a', 'b'])).toBe('a,b')
    expect(deserialize('a,b')).toEqual(['a', 'b'])
    expect(deserialize('')).toEqual([])
  })

  it('infers array serializer with repeat format', () => {
    const { serialize } = inferSerializer([] as string[], 'repeat')
    // repeat format uses internal separator
    expect(typeof serialize(['a'])).toBe('string')
  })

  it('infers object serializer via JSON', () => {
    const { serialize, deserialize } = inferSerializer({ a: 1 })
    expect(serialize({ a: 2 })).toBe(JSON.stringify({ a: 2 }))
    expect(deserialize('{"a":3}')).toEqual({ a: 3 })
  })

  it('falls back to string for unknown types', () => {
    const { serialize, deserialize } = inferSerializer(Symbol() as any)
    expect(typeof serialize(Symbol())).toBe('string')
    expect(typeof deserialize('test')).toBe('string')
  })

  it('handles NaN for number deserializer', () => {
    const { deserialize } = inferSerializer(42)
    expect(deserialize('not-a-number')).toBe(42) // falls back to default
  })
})
