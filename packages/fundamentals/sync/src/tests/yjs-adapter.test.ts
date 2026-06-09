import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_ORIGIN, REMOTE_ORIGIN } from '../crdt/types'
import { YjsAdapter, YjsCrdtDoc, createYjsDoc } from '../crdt/yjs-adapter'
import { connectYDocs } from '../crdt/yjs-transport'
import { syncedSignal } from '../synced-signal'
import { syncedStore } from '../synced-store'

describe('YjsAdapter — CrdtAdapter contract over real Yjs', () => {
  it('createDoc returns a YjsCrdtDoc; getMap is stable per name', () => {
    const doc = new YjsAdapter().createDoc()
    expect(doc).toBeInstanceOf(YjsCrdtDoc)
    expect(doc.getMap('m')).toBe(doc.getMap('m'))
    expect(doc.getMap('m')).not.toBe(doc.getMap('n'))
  })

  it('batches a transaction → observer fires once with changed keys + origin', () => {
    const doc = createYjsDoc()
    const map = doc.getMap('m')
    const fired: Array<{ keys: string[]; origin: unknown }> = []
    map.observe((keys, origin) => fired.push({ keys: [...keys].sort(), origin }))

    doc.transact(() => {
      map.set('a', 1)
      map.set('b', 2)
    }, LOCAL_ORIGIN)

    expect(fired).toEqual([{ keys: ['a', 'b'], origin: LOCAL_ORIGIN }])
    expect(map.get('a')).toBe(1)
    expect(map.get('b')).toBe(2)
    expect(map.has('a')).toBe(true)
    expect(map.keys().sort()).toEqual(['a', 'b'])
  })

  it('propagates a REMOTE origin (the transport tag) to observers', () => {
    const doc = createYjsDoc()
    const map = doc.getMap('m')
    const seen: unknown[] = []
    map.observe((_k, origin) => seen.push(origin))
    doc.transact(() => map.set('a', 1), REMOTE_ORIGIN)
    expect(seen).toEqual([REMOTE_ORIGIN])
  })

  it('observe disposer detaches the observer', () => {
    const doc = createYjsDoc()
    const map = doc.getMap('m')
    const obs = vi.fn()
    const off = map.observe(obs)
    doc.transact(() => map.set('a', 1))
    off()
    doc.transact(() => map.set('a', 2))
    expect(obs).toHaveBeenCalledTimes(1)
  })
})

describe('bridge over real Yjs — syncedSignal', () => {
  it('seeds initial when absent + reads it', () => {
    const doc = createYjsDoc()
    const s = syncedSignal({ doc, key: 'title', initial: 'Untitled' })
    expect(s()).toBe('Untitled')
    expect(doc.getMap('pyreon').get('title')).toBe('Untitled')
  })

  it('uses the existing Yjs value when the key is present — initial ignored', () => {
    const doc = createYjsDoc()
    doc.transact(() => doc.getMap('pyreon').set('title', 'Existing'))
    const s = syncedSignal({ doc, key: 'title', initial: 'Untitled' })
    expect(s()).toBe('Existing')
  })

  it('a local .set writes the Yjs map and notifies the base once', () => {
    const doc = createYjsDoc()
    const s = syncedSignal({ doc, key: 'title', initial: 'a' })
    let fires = 0
    s.subscribe(() => fires++)
    s.set('b')
    expect(s()).toBe('b')
    expect(doc.getMap('pyreon').get('title')).toBe('b')
    expect(fires).toBe(1)
  })

  it('a remote apply updates the signal once', () => {
    const doc = createYjsDoc()
    const map = doc.getMap('pyreon')
    const s = syncedSignal({ doc, key: 'title', initial: 'a' })
    let fires = 0
    s.subscribe(() => fires++)
    doc.transact(() => map.set('title', 'remote'), REMOTE_ORIGIN)
    expect(s()).toBe('remote')
    expect(fires).toBe(1)
  })

  it('.dispose detaches the observer', () => {
    const doc = createYjsDoc()
    const map = doc.getMap('pyreon')
    const s = syncedSignal({ doc, key: 'title', initial: 'a' })
    s.dispose()
    doc.transact(() => map.set('title', 'remote'), REMOTE_ORIGIN)
    expect(s()).toBe('a')
  })
})

describe('bridge over real Yjs — one op → one signal write (perf-counter)', () => {
  const sink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }
  let saved: ((name: string, n?: number) => void) | undefined

  afterEach(() => {
    if (saved === undefined) delete sink.__pyreon_count__
    else sink.__pyreon_count__ = saved
  })

  it('a remote Yjs apply fires exactly one reactivity.signalWrite', () => {
    const doc = createYjsDoc()
    const map = doc.getMap('pyreon')
    const s = syncedSignal({ doc, key: 'title', initial: 'a' })

    saved = sink.__pyreon_count__
    let writes = 0
    sink.__pyreon_count__ = (name) => {
      if (name === 'reactivity.signalWrite') writes++
    }

    doc.transact(() => map.set('title', 'b'), REMOTE_ORIGIN)

    expect(writes).toBe(1)
    expect(s()).toBe('b')
  })
})

describe('Yjs peer convergence (connectYDocs)', () => {
  it('a live write on one peer converges on the other', () => {
    const a = createYjsDoc()
    const b = createYjsDoc()
    connectYDocs(a, b)
    const ta = syncedSignal({ doc: a, key: 'title', initial: '' })
    const tb = syncedSignal({ doc: b, key: 'title', initial: '' })

    ta.set('hello')

    expect(ta()).toBe('hello')
    expect(tb()).toBe('hello')
  })

  it('a syncedStore syncs across peers', () => {
    const a = createYjsDoc()
    const b = createYjsDoc()
    connectYDocs(a, b)
    const sa = syncedStore({ title: '', count: 0 }, { doc: a })
    const sb = syncedStore({ title: '', count: 0 }, { doc: b })

    sa.title.set('shared')
    sb.count.set(7)

    expect(sb.title()).toBe('shared')
    expect(sa.count()).toBe(7)
  })

  it('OFFLINE edits on separate keys CONVERGE on reconnect (real CRDT merge — the fake cannot do this)', () => {
    const a = createYjsDoc()
    const b = createYjsDoc()
    // Both edit different keys while disconnected.
    syncedSignal({ doc: a, key: 'a-field', initial: 'A' }).set('A2')
    syncedSignal({ doc: b, key: 'b-field', initial: 'B' }).set('B2')

    connectYDocs(a, b) // reconnect → state-vector merge

    // Each peer now sees the other's offline edit — no lost update.
    expect(a.getMap('pyreon').get('b-field')).toBe('B2')
    expect(b.getMap('pyreon').get('a-field')).toBe('A2')
    // A signal constructed post-merge adopts the merged value.
    expect(syncedSignal({ doc: a, key: 'b-field', initial: 'ignored' })()).toBe('B2')
  })

  it('CONCURRENT same-key offline writes CONVERGE to one agreed value on reconnect', () => {
    const a = createYjsDoc()
    const b = createYjsDoc()
    const ta = syncedSignal({ doc: a, key: 'x', initial: 'init' })
    const tb = syncedSignal({ doc: b, key: 'x', initial: 'init' })

    ta.set('from-a')
    tb.set('from-b') // concurrent conflicting offline writes

    connectYDocs(a, b)

    // CRDTs guarantee CONVERGENCE (both agree), not which value wins — assert
    // agreement, not a specific winner. (One write's value is dropped — the
    // "lost update vs semantic conflict" honesty: no op is lost, but LWW does
    // pick a winner.)
    expect(ta()).toBe(tb())
    expect(['from-a', 'from-b']).toContain(ta())
  })

  it('disconnect stops live relay', () => {
    const a = createYjsDoc()
    const b = createYjsDoc()
    const { disconnect } = connectYDocs(a, b)
    const ta = syncedSignal({ doc: a, key: 'title', initial: '' })
    const tb = syncedSignal({ doc: b, key: 'title', initial: '' })

    ta.set('one')
    expect(tb()).toBe('one')

    disconnect()
    ta.set('two')
    expect(ta()).toBe('two')
    expect(tb()).toBe('one') // no longer relayed
  })
})
