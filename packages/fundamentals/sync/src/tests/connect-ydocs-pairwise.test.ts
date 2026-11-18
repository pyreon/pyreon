// @vitest-environment node
/**
 * `connectYDocs` is PAIRWISE: it carries edits made on either of its two docs,
 * and never re-forwards an update a doc received over a link. This file locks
 * that documented contract (#4381). Making `connectYDocs` relay would change it,
 * and must be a deliberate decision that updates the JSDoc, the manifest, the
 * README and the docs page together with these tests.
 */
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createYjsDoc } from '../crdt/yjs-adapter'
import { connectYDocs } from '../crdt/yjs-transport'

const text = (doc: ReturnType<typeof createYjsDoc>) => doc.yDoc.getText('t').toString()

describe('connectYDocs is pairwise (does not relay)', () => {
  it('an update received over one link is not re-sent over another', () => {
    const device1 = createYjsDoc()
    const relay = createYjsDoc()
    const device2 = createYjsDoc()
    const l1 = connectYDocs(device1, relay)
    const l2 = connectYDocs(relay, device2)

    // Count what crosses the relay → device2 link: every update applied to device2.
    let reachedDevice2 = 0
    device2.yDoc.on('update', () => {
      reachedDevice2++
    })

    device1.yDoc.getText('t').insert(0, 'from device1')

    expect(text(relay)).toBe('from device1') // the direct link carries it
    expect(text(device2)).toBe('') // the second link does not forward it
    expect(reachedDevice2).toBe(0)

    // An edit made ON the middle doc still goes over both of its links. (It is
    // made on a separate type: an insert into 't' depends on device1's item,
    // which device2 never received, so Yjs would hold it as pending.)
    relay.yDoc.getText('own').insert(0, 'from relay')
    expect(device1.yDoc.getText('own').toString()).toBe('from relay')
    expect(device2.yDoc.getText('own').toString()).toBe('from relay')
    expect(reachedDevice2).toBe(1)
    expect(text(device2)).toBe('') // still none of device1's edit

    l1.disconnect()
    l2.disconnect()
  })

  it('the chain ends converge only when the second link connects again (initial state merge)', () => {
    const device1 = createYjsDoc()
    const relay = createYjsDoc()
    const device2 = createYjsDoc()
    connectYDocs(device1, relay)
    const l2 = connectYDocs(relay, device2)

    device1.yDoc.getText('t').insert(0, 'offline-ish')
    expect(text(device2)).toBe('')

    l2.disconnect()
    connectYDocs(relay, device2)
    expect(text(device2)).toBe('offline-ish')
  })

  it('linking every pair directly (full mesh) carries live edits to all docs', () => {
    const docs = [createYjsDoc(), createYjsDoc(), createYjsDoc()] as const
    connectYDocs(docs[0], docs[1])
    connectYDocs(docs[1], docs[2])
    connectYDocs(docs[0], docs[2])

    docs[0].yDoc.getText('t').insert(0, 'a')
    docs[2].yDoc.getText('t').insert(1, 'c')
    for (const d of docs) expect(text(d)).toBe('ac')

    // All three hold the same state (same state vector).
    const sv = docs.map((d) => Y.encodeStateVector(d.yDoc).toString())
    expect(new Set(sv).size).toBe(1)
  })
})
