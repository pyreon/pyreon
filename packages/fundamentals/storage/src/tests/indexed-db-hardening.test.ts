// happy-dom stubs IDB object-store operations (their callbacks never fire), so
// install a real in-memory IndexedDB. See coverage-gaps.test.ts for the why.
import { IDBFactory } from 'fake-indexeddb'
globalThis.indexedDB = new IDBFactory()

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetDBCache, _resetRegistry, _resetStorageListener, useIndexedDB } from '../index'

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetRegistry()
  _resetDBCache()
  _resetStorageListener()
})

afterEach(() => {
  vi.restoreAllMocks()
  _resetRegistry()
  _resetDBCache()
  _resetStorageListener()
})

async function seed(key: string, value: unknown, options = {}): Promise<void> {
  const s = useIndexedDB(key, null as unknown, { debounceMs: 0, ...options })
  await s.whenReady()
  s.set(value)
  await s.flush()
  _resetRegistry()
}

describe('useIndexedDB — initial load never clobbers a local write', () => {
  it('a set() made before the async load finished wins over the stored value', async () => {
    await seed('draft', 'stored')

    const draft = useIndexedDB('draft', 'default', { debounceMs: 0 })
    draft.set('typed-before-load')
    await draft.whenReady()
    await tick(20)

    expect(draft()).toBe('typed-before-load')
  })

  it('a remove() made before the load finished is not undone by the load', async () => {
    await seed('draft', 'stored')

    const draft = useIndexedDB('draft', 'default', { debounceMs: 0 })
    const sibling = useIndexedDB('draft', 'default', { debounceMs: 0 })
    draft.remove()
    await sibling.whenReady()
    await tick(20)

    expect(sibling()).toBe('default')
  })

  it('with no local write, the stored value still loads', async () => {
    await seed('draft', 'stored')
    const draft = useIndexedDB('draft', 'default')
    await draft.whenReady()
    expect(draft()).toBe('stored')
  })
})

describe('useIndexedDB — several object stores in one database', () => {
  it('a second storeName in an EXISTING database is created and usable', async () => {
    const onError = vi.fn()
    await seed('a', 'from-s1', { dbName: 'app', storeName: 's1' })

    const b = useIndexedDB('b', 'default', { dbName: 'app', storeName: 's2', debounceMs: 0, onError })
    await b.whenReady()
    b.set('from-s2')
    await b.flush()

    _resetRegistry()
    _resetDBCache()
    const again = useIndexedDB('b', 'default', { dbName: 'app', storeName: 's2', onError })
    await again.whenReady()
    const first = useIndexedDB('a', 'default', { dbName: 'app', storeName: 's1', onError })
    await first.whenReady()

    expect(onError).not.toHaveBeenCalled()
    expect(again()).toBe('from-s2')
    expect(first()).toBe('from-s1')
  })

  it('two stores requested concurrently on a fresh database both work', async () => {
    const onError = vi.fn()
    const x = useIndexedDB('x', 0, { dbName: 'fresh', storeName: 'one', debounceMs: 0, onError })
    const y = useIndexedDB('y', 0, { dbName: 'fresh', storeName: 'two', debounceMs: 0, onError })
    x.set(1)
    y.set(2)
    await Promise.all([x.flush(), y.flush()])

    _resetRegistry()
    _resetDBCache()
    const x2 = useIndexedDB('x', 0, { dbName: 'fresh', storeName: 'one', onError })
    const y2 = useIndexedDB('y', 0, { dbName: 'fresh', storeName: 'two', onError })
    await Promise.all([x2.whenReady(), y2.whenReady()])

    expect(onError).not.toHaveBeenCalled()
    expect([x2(), y2()]).toEqual([1, 2])
  })
})

describe('useIndexedDB — ready state + unload flush', () => {
  it('ready() flips to true once the initial load settles', async () => {
    const d = useIndexedDB('r', 'default')
    expect(d.ready()).toBe(false)
    await d.whenReady()
    expect(d.ready()).toBe(true)
  })

  it('a pending debounced write is flushed on pagehide', async () => {
    const d = useIndexedDB('p', 'default', { debounceMs: 10_000 })
    await d.whenReady()
    d.set('unsaved')

    window.dispatchEvent(new Event('pagehide'))
    await tick(30)

    _resetRegistry()
    _resetDBCache()
    const again = useIndexedDB('p', 'default')
    await again.whenReady()
    expect(again()).toBe('unsaved')
  })
})

describe('useIndexedDB — connection lifecycle', () => {
  it('steps aside when another connection upgrades the database, then reopens', async () => {
    const onError = vi.fn()
    const a = useIndexedDB('a', 'default', { dbName: 'shared', debounceMs: 0, onError })
    await a.whenReady()

    // Another tab upgrades `shared` — this tab's open connection must close,
    // or the upgrade is blocked forever.
    const current = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('shared')
      r.onsuccess = () => resolve(r.result)
    })
    const version = current.version
    current.close()
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.open('shared', version + 1)
      r.onsuccess = () => {
        r.result.close()
        resolve()
      }
      r.onerror = () => reject(r.error)
      r.onblocked = () => reject(new Error('upgrade blocked by the open connection'))
    })

    a.set('after-upgrade')
    await a.flush()
    expect(onError).not.toHaveBeenCalled()

    _resetRegistry()
    _resetDBCache()
    const again = useIndexedDB('a', 'default', { dbName: 'shared' })
    await again.whenReady()
    expect(again()).toBe('after-upgrade')
  })

  it('a call queued behind a FAILED open retries instead of inheriting the failure', async () => {
    const realOpen = indexedDB.open.bind(indexedDB)
    let calls = 0
    vi.spyOn(indexedDB, 'open').mockImplementation((...args: Parameters<IDBFactory['open']>) => {
      calls++
      if (calls === 1) {
        const request = {} as IDBOpenDBRequest
        setTimeout(() => {
          Object.defineProperty(request, 'error', { value: new Error('blocked by settings') })
          request.onerror?.(new Event('error'))
        })
        return request
      }
      return realOpen(...args)
    })

    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const firstError = vi.fn()
    const first = useIndexedDB('f1', 'd', { dbName: 'flaky', onError: firstError })
    const second = useIndexedDB('f2', 'stored-default', { dbName: 'flaky', debounceMs: 0 })
    await Promise.all([first.whenReady(), second.whenReady()])

    expect(firstError).toHaveBeenCalledTimes(1)
    second.set('ok')
    await second.flush()
    _resetRegistry()
    _resetDBCache()
    vi.restoreAllMocks()
    const again = useIndexedDB('f2', 'x', { dbName: 'flaky' })
    await again.whenReady()
    expect(again()).toBe('ok')
  })

  it('flush() with nothing pending resolves without writing', async () => {
    const d = useIndexedDB('idle', 'default')
    await d.whenReady()
    await expect(d.flush()).resolves.toBeUndefined()
  })
})
