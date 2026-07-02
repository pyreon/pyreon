// @vitest-environment node
/**
 * CRDT convergence + reactive-wrapper parity fuzz gate.
 *
 * The underlying Yjs CRDT is battle-tested; what's PYREON-specific and
 * previously unfuzzed is the reactive WRAPPER — `syncedList` / `syncedText` /
 * `syncedSignal` each observe the CRDT and drive a Pyreon signal — plus the
 * update-loop invariant (a remote `applyUpdate` must land in the signal
 * exactly once; no lost updates, no echo). This gate runs N real Yjs docs,
 * each with all three wrapped primitives, applies random concurrent op
 * interleavings on random docs, exchanges updates mid-stream (simulating a
 * relay's out-of-order delivery), then fully gossips and asserts:
 *
 *   O1 CRDT convergence : every doc's Y.Array/Y.Text/Y.Map is identical.
 *   O2 wrapper parity   : each doc's Pyreon SIGNAL === its CRDT state (the
 *                         observer reflected every applied update).
 *   O3 no throws.
 *
 * Runs in the node env so `yjs` resolves to the package's single instance
 * (a second copy breaks Yjs's constructor identity checks — the reason this
 * must live in-package, not a standalone script).
 */
import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { createYjsDoc } from '../crdt/yjs-adapter'
import { syncedList } from '../crdt/yjs-list'
import { syncedText } from '../crdt/yjs-text'
import { REMOTE_ORIGIN } from '../crdt/types'
import { syncedSignal } from '../synced-signal'

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = <T,>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)]!

interface Peer {
  doc: ReturnType<typeof createYjsDoc>
  list: ReturnType<typeof syncedList<number>>
  text: ReturnType<typeof syncedText>
  sig: ReturnType<typeof syncedSignal<number>>
}

function makePeer(): Peer {
  const doc = createYjsDoc()
  return {
    doc,
    list: syncedList<number>(doc, 'L'),
    text: syncedText(doc, 'T'),
    sig: syncedSignal<number>({ doc, key: 'S', initial: 0 }),
  }
}

function sync2(a: Peer, b: Peer) {
  const ua = Y.encodeStateAsUpdate(a.doc.yDoc)
  const ub = Y.encodeStateAsUpdate(b.doc.yDoc)
  Y.applyUpdate(b.doc.yDoc, ua, REMOTE_ORIGIN)
  Y.applyUpdate(a.doc.yDoc, ub, REMOTE_ORIGIN)
}
function syncAll(peers: Peer[]) {
  for (let round = 0; round < 3; round++)
    for (let i = 0; i < peers.length; i++)
      for (let j = i + 1; j < peers.length; j++) sync2(peers[i]!, peers[j]!)
}

describe('sync convergence + wrapper-parity fuzz', () => {
  it('300 seeded concurrent op-interleavings converge AND the Pyreon signals reflect the CRDT', () => {
    const SEEDS = 300
    const failures: string[] = []

    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = mulberry32(seed)
      const nPeers = 2 + Math.floor(r() * 2) // 2..3
      const peers = Array.from({ length: nPeers }, makePeer)
      const trace: string[] = []
      let counter = 1
      try {
        const nOps = 8 + Math.floor(r() * 20)
        for (let op = 0; op < nOps; op++) {
          const p = pick(r, peers)
          const which = r()
          if (which < 0.35) {
            const lr = r()
            const cur = p.list()
            if (lr < 0.4 || cur.length === 0) {
              p.list.push(counter++)
              trace.push('push')
            } else if (lr < 0.6) {
              p.list.insert(Math.floor(r() * (cur.length + 1)), [counter++])
              trace.push('insert')
            } else if (lr < 0.8) {
              p.list.delete(Math.floor(r() * cur.length), 1)
              trace.push('delete')
            } else {
              // Whole-list replace (the coarser `.set` path — clear + insert
              // in one transaction; a concurrent replace resolves by
              // last-writer, which must still leave every peer identical).
              p.list.set([counter++, counter++])
              trace.push('list.set')
            }
          } else if (which < 0.6) {
            const tr = r()
            const cur = p.text()
            if (tr < 0.6 || cur.length === 0) {
              p.text.insert(Math.floor(r() * (cur.length + 1)), pick(r, ['a', 'bc', 'x']))
              trace.push('text.insert')
            } else {
              p.text.delete(Math.floor(r() * cur.length), 1)
              trace.push('text.delete')
            }
          } else if (which < 0.75) {
            p.sig.set(counter++)
            trace.push('sig.set')
          } else if (peers.length >= 2) {
            const a = pick(r, peers)
            let b = pick(r, peers)
            if (a === b) b = peers[(peers.indexOf(a) + 1) % peers.length]!
            sync2(a, b)
            trace.push('sync2')
          }
        }
        syncAll(peers)

        const ref = peers[0]!
        const refList = JSON.stringify(ref.doc.yDoc.getArray<number>('L').toArray())
        const refText = ref.doc.yDoc.getText('T').toString()
        const refSig = ref.doc.yDoc.getMap('pyreon').get('S')
        for (let i = 0; i < peers.length && failures.length < 5; i++) {
          const pe = peers[i]!
          const cl = JSON.stringify(pe.doc.yDoc.getArray<number>('L').toArray())
          const ct = pe.doc.yDoc.getText('T').toString()
          const cs = pe.doc.yDoc.getMap('pyreon').get('S')
          if (cl !== refList || ct !== refText || cs !== refSig) {
            failures.push(`O1 seed=${seed} peer${i} diverged (trace: ${trace.join(' ')})`)
          } else if (JSON.stringify(pe.list()) !== cl) {
            failures.push(`O2 seed=${seed} peer${i} LIST signal!=crdt (trace: ${trace.join(' ')})`)
          } else if (pe.text() !== ct) {
            failures.push(`O2 seed=${seed} peer${i} TEXT signal!=crdt`)
          } else if (pe.sig() !== cs) {
            failures.push(`O2 seed=${seed} peer${i} SIG signal!=crdt`)
          }
        }
      } catch (e) {
        failures.push(`THREW seed=${seed}: ${(e as Error).message.slice(0, 120)}`)
      } finally {
        for (const pe of peers) {
          pe.list.dispose?.()
          pe.text.dispose?.()
          pe.sig.dispose()
        }
      }
      if (failures.length >= 5) break
    }

    expect(failures, failures.join('\n')).toEqual([])
  })
})
