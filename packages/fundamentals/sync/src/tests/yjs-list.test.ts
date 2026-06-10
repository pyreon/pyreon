import { afterEach, describe, expect, it } from 'vitest'
import { createYjsDoc } from '../crdt/yjs-adapter'
import { syncedList } from '../crdt/yjs-list'
import { connectYDocs } from '../crdt/yjs-transport'
import { REMOTE_ORIGIN } from '../crdt/types'

describe('syncedList — collaborative Y.Array', () => {
  it('starts empty and reads the array', () => {
    const l = syncedList<string>(createYjsDoc(), 'items')
    expect(l()).toEqual([])
  })

  it('push / insert / delete update the signal', () => {
    const l = syncedList<string>(createYjsDoc(), 'items')
    l.push('a', 'b')
    expect(l()).toEqual(['a', 'b'])
    l.insert(1, ['x'])
    expect(l()).toEqual(['a', 'x', 'b'])
    l.delete(0, 1)
    expect(l()).toEqual(['x', 'b'])
    l.delete(0) // default count 1
    expect(l()).toEqual(['b'])
  })

  it('.set replaces the whole list', () => {
    const l = syncedList<number>(createYjsDoc(), 'items')
    l.push(1, 2, 3)
    l.set([9, 8])
    expect(l()).toEqual([9, 8])
    l.set([])
    expect(l()).toEqual([])
  })

  it('notifies subscribers and returns a fresh array each change', () => {
    const l = syncedList<string>(createYjsDoc(), 'items')
    let fires = 0
    let last: string[] = []
    l.subscribe(() => {
      fires++
      last = l()
    })
    l.push('a')
    expect(fires).toBe(1)
    expect(last).toEqual(['a'])
  })

  it('CONCURRENT pushes from two peers MERGE with no lost items', () => {
    const a = createYjsDoc()
    const b = createYjsDoc()
    connectYDocs(a, b)
    const la = syncedList<string>(a, 'items')
    const lb = syncedList<string>(b, 'items')

    la.push('from-A')
    lb.push('from-B')

    // Both peers converge AND both items survive — no item dropped.
    expect(la()).toEqual(lb())
    expect(la()).toContain('from-A')
    expect(la()).toContain('from-B')
    expect(la().length).toBe(2)
  })

  it('OFFLINE concurrent pushes merge on reconnect (no lost items)', () => {
    const a = createYjsDoc()
    const b = createYjsDoc()
    const la = syncedList<string>(a, 'items')
    const lb = syncedList<string>(b, 'items')

    la.push('a1', 'a2') // offline on A
    lb.push('b1') // offline on B
    connectYDocs(a, b) // reconnect → state-vector merge

    expect(la()).toEqual(lb())
    expect(la()).toEqual(expect.arrayContaining(['a1', 'a2', 'b1']))
    expect(la().length).toBe(3)
  })

  it('.dispose detaches the observer', () => {
    const doc = createYjsDoc()
    const l = syncedList<string>(doc, 'items')
    l.dispose()
    doc.yDoc.getArray('items').push(['z']) // direct mutate after dispose
    expect(l()).toEqual([]) // observer gone — signal stays at its last value
  })
})

describe('syncedList — one op → exactly one signal write (perf-counter / measure)', () => {
  const sink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }
  let saved: ((name: string, n?: number) => void) | undefined

  afterEach(() => {
    if (saved === undefined) delete sink.__pyreon_count__
    else sink.__pyreon_count__ = saved
  })

  it('a remote list change fires exactly one reactivity.signalWrite', () => {
    const doc = createYjsDoc()
    const yarr = doc.yDoc.getArray<string>('items')
    const l = syncedList<string>(doc, 'items')

    saved = sink.__pyreon_count__
    let writes = 0
    sink.__pyreon_count__ = (name) => {
      if (name === 'reactivity.signalWrite') writes++
    }

    // Inbound remote op — what the transport applies on receiving a peer update.
    doc.transact(() => yarr.push(['remote']), REMOTE_ORIGIN)

    expect(writes).toBe(1) // exactly one base.set drives the (one) keyed-For reconcile
    expect(l()).toEqual(['remote'])
  })

  it('.set replaces the whole list — both clear-then-insert branches', () => {
    const l = syncedList<string>(createYjsDoc(), 'items')
    // From empty → insert (yarr.length === 0, so the clear branch is skipped).
    l.set(['a', 'b'])
    expect(l()).toEqual(['a', 'b'])
    // From non-empty → clear THEN insert (both branches).
    l.set(['c'])
    expect(l()).toEqual(['c'])
    // To empty → clear, no insert (the next.length === 0 branch).
    l.set([])
    expect(l()).toEqual([])
  })

  it('.dispose is idempotent (second call is a no-op)', () => {
    const doc = createYjsDoc()
    const l = syncedList<string>(doc, 'items')
    l.dispose()
    l.dispose() // second call hits the `disposed` early-return
    doc.yDoc.getArray('items').push(['after']) // mutate after dispose
    expect(l()).toEqual([]) // observer detached — signal frozen at last value
  })
})
