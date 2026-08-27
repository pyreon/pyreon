import { describe, expect, it } from 'vitest'
import { PyreonCrdtDoc } from '../crdt/pyreon-adapter'
import { LOCAL_ORIGIN } from '../crdt/types'

/**
 * Locks the single-observer / single-opListener fast paths in the CRDT adapter.
 * `_notify` fires per transaction commit and the keyed dispatcher installs
 * exactly ONE observer per map, so the `[...observers]` snapshot was a throwaway
 * array every commit. The fast path captures the sole subscriber and fires it;
 * these specs pin it fires once with the right args, and that the multi-observer
 * snapshot path still fires everyone.
 */
describe('CRDT adapter — single-observer/opListener fast path', () => {
  it('fires the sole map observer once with the changed keys', () => {
    const doc = new PyreonCrdtDoc('peer-a')
    const map = doc.getMap('m')
    let fired = 0
    let keys: ReadonlySet<string> | null = null
    const off = map.observe((k) => {
      fired++
      keys = k as ReadonlySet<string>
    })
    doc.transact(() => map.set('x', 1), LOCAL_ORIGIN)
    expect(fired).toBe(1)
    expect(keys!.has('x')).toBe(true)
    off()
  })

  it('fires the sole op listener with the committed ops', () => {
    const doc = new PyreonCrdtDoc('peer-a')
    let opsSeen: unknown = null
    const off = doc._onOps((ops) => {
      opsSeen = ops
    })
    doc.transact(() => doc.getMap('m').set('y', 2), LOCAL_ORIGIN)
    expect(Array.isArray(opsSeen)).toBe(true)
    expect((opsSeen as unknown[]).length).toBeGreaterThan(0)
    off()
  })

  it('multi-observer snapshot path still fires every observer', () => {
    const doc = new PyreonCrdtDoc('peer-a')
    const map = doc.getMap('m')
    let a = 0
    let b = 0
    const offA = map.observe(() => a++)
    const offB = map.observe(() => b++)
    doc.transact(() => map.set('z', 3), LOCAL_ORIGIN)
    expect(a).toBe(1)
    expect(b).toBe(1)
    offA()
    offB()
  })
})
