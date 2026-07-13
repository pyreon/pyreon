import { effect, effectScope } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { subscribeKey } from '../sync'
import { batchUrlUpdates, setUrlRouter, useUrlState } from '../index'

/** Helper: set window.location.search to a given query string. */
function setSearch(search: string) {
  const url = new URL(window.location.href)
  url.search = search
  history.replaceState(null, '', url.toString())
}

describe('cross-hook sync', () => {
  beforeEach(() => {
    setSearch('')
    setUrlRouter(null)
  })
  afterEach(() => {
    setSearch('')
    setUrlRouter(null)
  })

  it('two signals bound to the same key stay in sync on .set()', () => {
    const a = useUrlState('page', 1)
    const b = useUrlState('page', 1)
    a.set(5)
    expect(a()).toBe(5)
    // b re-reads the URL after a writes — no popstate needed.
    expect(b()).toBe(5)
  })

  it('sync propagates through .reset() and .remove()', () => {
    const a = useUrlState('q', '')
    const b = useUrlState('q', '')
    a.set('hello')
    expect(b()).toBe('hello')
    a.reset()
    expect(b()).toBe('')
    a.set('again')
    expect(b()).toBe('again')
    a.remove()
    expect(b()).toBe('')
  })

  it('sync works for comma-format arrays', () => {
    const a = useUrlState('tags', [] as string[])
    const b = useUrlState('tags', [] as string[])
    a.set(['x', 'y'])
    expect(b()).toEqual(['x', 'y'])
  })

  it('sync works for repeat-format arrays', () => {
    const a = useUrlState('tags', [] as string[], { arrayFormat: 'repeat' })
    const b = useUrlState('tags', [] as string[], { arrayFormat: 'repeat' })
    a.set(['a', 'b'])
    expect(b()).toEqual(['a', 'b'])
  })

  it('a sibling write fires the other signal onChange', () => {
    const changes: number[] = []
    useUrlState('page', 1, { onChange: (v) => changes.push(v) })
    const writer = useUrlState('page', 1)
    writer.set(9)
    expect(changes).toEqual([9])
  })

  it('the writer signal does NOT fire its own onChange', () => {
    const writerChanges: number[] = []
    const observerChanges: number[] = []
    const writer = useUrlState('page', 1, { onChange: (v) => writerChanges.push(v) })
    useUrlState('page', 1, { onChange: (v) => observerChanges.push(v) })
    writer.set(4)
    expect(writerChanges).toEqual([]) // own write — no onChange
    expect(observerChanges).toEqual([4]) // external write — onChange fires
  })

  it('a different key is not notified', () => {
    const page = useUrlState('page', 1)
    const q = useUrlState('q', '')
    const qChanges: string[] = []
    useUrlState('q', '', { onChange: (v) => qChanges.push(v) })
    page.set(7)
    expect(q()).toBe('') // untouched
    expect(qChanges).toEqual([])
  })

  it('a disposed sibling is unsubscribed and no longer notified', () => {
    const observerChanges: number[] = []
    const scope = effectScope()
    scope.runInScope(() => {
      useUrlState('page', 1, { onChange: (v) => observerChanges.push(v) })
    })
    const writer = useUrlState('page', 1)

    writer.set(2)
    expect(observerChanges).toEqual([2])

    // Dispose the observer's scope → its subscription is removed.
    scope.stop()
    writer.set(3)
    // No further notifications after dispose.
    expect(observerChanges).toEqual([2])
  })

  it('sync propagates through a registered router', () => {
    setUrlRouter({
      replace: (path: string) => history.replaceState(null, '', path),
    })
    const a = useUrlState('page', 1)
    const b = useUrlState('page', 1)
    a.set(6)
    expect(b()).toBe(6)
  })
})

describe('batchUrlUpdates', () => {
  beforeEach(() => {
    setSearch('')
    setUrlRouter(null)
  })
  afterEach(() => {
    setSearch('')
    setUrlRouter(null)
  })

  it('coalesces multiple param writes into ONE history entry (replace)', () => {
    const spy = vi.spyOn(history, 'replaceState')
    const { page, q } = useUrlState({ page: 1, q: '' })
    const before = spy.mock.calls.length

    batchUrlUpdates(() => {
      page.set(2)
      q.set('hello')
    })

    // Exactly one replaceState for the two-param update.
    expect(spy.mock.calls.length - before).toBe(1)
    expect(new URLSearchParams(window.location.search).get('page')).toBe('2')
    expect(new URLSearchParams(window.location.search).get('q')).toBe('hello')
    spy.mockRestore()
  })

  it('coalesces into ONE pushState when replace:false', () => {
    let pushes = 0
    const orig = history.pushState.bind(history)
    history.pushState = ((...args: unknown[]) =>
      (pushes++, orig(...(args as [unknown, string, string])))) as typeof history.pushState

    const { page, q } = useUrlState({ page: 1, q: '' }, { replace: false })
    batchUrlUpdates(() => {
      page.set(2)
      q.set('hello')
    })

    expect(pushes).toBe(1)
    history.pushState = orig
  })

  it('mixed single + repeat params commit in one write with the correct URL', () => {
    const spy = vi.spyOn(history, 'replaceState')
    const page = useUrlState('page', 1)
    const tags = useUrlState('tags', [] as string[], { arrayFormat: 'repeat' })
    const before = spy.mock.calls.length

    batchUrlUpdates(() => {
      page.set(3)
      tags.set(['a', 'b'])
    })

    expect(spy.mock.calls.length - before).toBe(1)
    const params = new URLSearchParams(window.location.search)
    expect(params.get('page')).toBe('3')
    expect(params.getAll('tags')).toEqual(['a', 'b'])
    spy.mockRestore()
  })

  it('signal values update synchronously inside the batch', () => {
    const { page, q } = useUrlState({ page: 1, q: '' })
    batchUrlUpdates(() => {
      page.set(2)
      q.set('hi')
      // Values are live immediately, before the URL flush.
      expect(page()).toBe(2)
      expect(q()).toBe('hi')
    })
  })

  it('coalesces reactive notifications — a subscriber reading two params runs once', () => {
    const { page, q } = useUrlState({ page: 1, q: '' })
    let runs = 0
    const fx = effect(() => {
      page()
      q()
      runs++
    })
    expect(runs).toBe(1) // initial run

    batchUrlUpdates(() => {
      page.set(2)
      q.set('x')
    })
    // Both writes → a single re-run, not two.
    expect(runs).toBe(2)
    fx.dispose()
  })

  it('bypasses debounce (writes land in the batch synchronously)', () => {
    const spy = vi.spyOn(history, 'replaceState')
    const page = useUrlState('page', 1, { debounce: 500 })
    const before = spy.mock.calls.length

    batchUrlUpdates(() => {
      page.set(2)
    })
    // No timer — the URL is written immediately as part of the batch.
    expect(spy.mock.calls.length - before).toBe(1)
    expect(new URLSearchParams(window.location.search).get('page')).toBe('2')
    spy.mockRestore()
  })

  it('returns the value produced by the batch fn', () => {
    const page = useUrlState('page', 1)
    const result = batchUrlUpdates(() => {
      page.set(2)
      return 'done'
    })
    expect(result).toBe('done')
  })

  it('nested batches flush once (outermost)', () => {
    const spy = vi.spyOn(history, 'replaceState')
    const { page, q } = useUrlState({ page: 1, q: '' })
    const before = spy.mock.calls.length

    batchUrlUpdates(() => {
      page.set(2)
      batchUrlUpdates(() => {
        q.set('nested')
      })
    })

    expect(spy.mock.calls.length - before).toBe(1)
    expect(new URLSearchParams(window.location.search).get('q')).toBe('nested')
    spy.mockRestore()
  })

  it('an empty batch performs no history write', () => {
    const spy = vi.spyOn(history, 'replaceState')
    const before = spy.mock.calls.length
    batchUrlUpdates(() => {
      /* no writes */
    })
    expect(spy.mock.calls.length - before).toBe(0)
    spy.mockRestore()
  })

  it('coalesces a param REMOVAL inside the batch (single null commit)', () => {
    setSearch('?page=5&keep=1')
    const spy = vi.spyOn(history, 'replaceState')
    const page = useUrlState('page', 1)
    const before = spy.mock.calls.length

    batchUrlUpdates(() => {
      page.reset() // → default → param removed → null accumulated
    })

    expect(spy.mock.calls.length - before).toBe(1)
    const params = new URLSearchParams(window.location.search)
    expect(params.has('page')).toBe(false)
    expect(params.get('keep')).toBe('1') // untouched
    spy.mockRestore()
  })

  it('coalesces a repeat-array REMOVAL inside the batch (repeated null commit)', () => {
    setSearch('?tags=a&tags=b')
    const spy = vi.spyOn(history, 'replaceState')
    const tags = useUrlState('tags', [] as string[], { arrayFormat: 'repeat' })
    const before = spy.mock.calls.length

    batchUrlUpdates(() => {
      tags.remove() // → null accumulated → commitParams deletes the repeated key
    })

    expect(spy.mock.calls.length - before).toBe(1)
    expect(new URLSearchParams(window.location.search).has('tags')).toBe(false)
    spy.mockRestore()
  })

  it('coalesces a repeat-array push write inside the batch (replace:false)', () => {
    let pushes = 0
    const orig = history.pushState.bind(history)
    history.pushState = ((...args: unknown[]) =>
      (pushes++, orig(...(args as [unknown, string, string])))) as typeof history.pushState

    const tags = useUrlState('tags', [] as string[], {
      arrayFormat: 'repeat',
      replace: false,
    })
    batchUrlUpdates(() => {
      tags.set(['a', 'b'])
    })

    expect(pushes).toBe(1)
    expect(new URLSearchParams(window.location.search).getAll('tags')).toEqual(['a', 'b'])
    history.pushState = orig
  })

  it('notifies sibling signals once after the flush, not the writers', () => {
    const observerChanges: number[] = []
    useUrlState('page', 1, { onChange: (v) => observerChanges.push(v) })
    const writerChanges: number[] = []
    const page = useUrlState('page', 1, { onChange: (v) => writerChanges.push(v) })

    batchUrlUpdates(() => {
      page.set(2)
    })

    expect(observerChanges).toEqual([2]) // sibling notified after flush
    expect(writerChanges).toEqual([]) // writer's own onChange never fires
  })
})

describe('clearOnDefault option', () => {
  beforeEach(() => {
    setSearch('')
    setUrlRouter(null)
  })
  afterEach(() => {
    setSearch('')
    setUrlRouter(null)
  })

  it('defaults to true — the param is removed at the default value', () => {
    const page = useUrlState('page', 1)
    page.set(5)
    page.set(1) // back to default
    expect(new URLSearchParams(window.location.search).has('page')).toBe(false)
  })

  it('clearOnDefault:false keeps the param written at the default value', () => {
    const page = useUrlState('page', 1, { clearOnDefault: false })
    page.set(5)
    page.set(1) // back to default — but keep it in the URL
    expect(new URLSearchParams(window.location.search).get('page')).toBe('1')
  })

  it('clearOnDefault:false keeps a comma-array at its default', () => {
    const tags = useUrlState('tags', ['a'] as string[], { clearOnDefault: false })
    tags.set(['x'])
    tags.set(['a']) // default
    expect(new URLSearchParams(window.location.search).get('tags')).toBe('a')
  })

  it('clearOnDefault:false keeps a repeat-array at its default', () => {
    const tags = useUrlState('tags', ['a'] as string[], {
      arrayFormat: 'repeat',
      clearOnDefault: false,
    })
    tags.set(['x'])
    tags.set(['a']) // default
    expect(new URLSearchParams(window.location.search).getAll('tags')).toEqual(['a'])
  })

  it('reset() with clearOnDefault:false writes the default into the URL', () => {
    const page = useUrlState('page', 1, { clearOnDefault: false })
    page.set(5)
    page.reset()
    expect(new URLSearchParams(window.location.search).get('page')).toBe('1')
  })
})

describe('subscribeKey registry (internal)', () => {
  it('unsubscribe is idempotent — a double call is a safe no-op', () => {
    const cb = () => {}
    const unsub = subscribeKey('probe', cb)
    unsub()
    // Second call: the key entry was already dropped (set emptied) — must not throw.
    expect(() => unsub()).not.toThrow()
  })

  it('a second subscriber keeps the entry alive after the first unsubscribes', () => {
    const a = subscribeKey('probe2', () => {})
    const b = subscribeKey('probe2', () => {})
    a()
    // b's unsubscribe should still cleanly remove the last entry.
    expect(() => b()).not.toThrow()
  })
})
