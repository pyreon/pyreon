import { describe, expect, it } from 'vitest'
import { FakeCrdtDoc, connectFakeDocs } from '../crdt/fake-adapter'
import { REMOTE_ORIGIN } from '../crdt/types'
import { syncedStore } from '../synced-store'

describe('syncedStore', () => {
  it('builds one synced field per key; reads and writes route through the CRDT', () => {
    const doc = new FakeCrdtDoc()
    const store = syncedStore({ title: 'Untitled', done: false }, { doc })

    expect(store.title()).toBe('Untitled')
    expect(store.done()).toBe(false)

    store.title.set('Roadmap')
    expect(store.title()).toBe('Roadmap')
    expect(doc.getMap('pyreon').get('title')).toBe('Roadmap')
  })

  it('one op → exactly one base write across the store (other fields untouched)', () => {
    const doc = new FakeCrdtDoc()
    const store = syncedStore({ title: 'a', count: 0 }, { doc })
    let titleFires = 0
    let countFires = 0
    store.title.subscribe(() => titleFires++)
    store.count.subscribe(() => countFires++)

    store.title.set('b')

    expect(titleFires).toBe(1)
    expect(countFires).toBe(0) // the other field's observer early-returned
  })

  it('throws if a field is named "dispose" (reserved)', () => {
    const doc = new FakeCrdtDoc()
    expect(() => syncedStore({ dispose: 1 } as Record<string, unknown>, { doc })).toThrow(
      /reserved field name/,
    )
  })

  it('dispose tears down every field observer (later remote changes update nothing)', () => {
    const doc = new FakeCrdtDoc()
    const map = doc.getMap('pyreon')
    const store = syncedStore({ title: 'a', count: 0 }, { doc })

    store.dispose()

    doc.transact(() => {
      map.set('title', 'remote')
      map.set('count', 99)
    }, REMOTE_ORIGIN)

    expect(store.title()).toBe('a')
    expect(store.count()).toBe(0)
  })

  it('respects a custom map name', () => {
    const doc = new FakeCrdtDoc()
    const store = syncedStore({ title: 'a' }, { doc, map: 'doc-meta' })
    store.title.set('b')
    expect(doc.getMap('doc-meta').get('title')).toBe('b')
    expect(doc.getMap('pyreon').has('title')).toBe(false)
  })

  it('syncs across peers', () => {
    const a = new FakeCrdtDoc()
    const b = new FakeCrdtDoc()
    connectFakeDocs(a, b)
    const sa = syncedStore({ title: '', count: 0 }, { doc: a })
    const sb = syncedStore({ title: '', count: 0 }, { doc: b })

    sa.title.set('hello')
    sb.count.set(7)

    expect(sb.title()).toBe('hello')
    expect(sa.count()).toBe(7)
  })
})
