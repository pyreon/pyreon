import { afterEach, describe, expect, it, vi } from 'vitest'
import { type PyreonCrdtOp, PyreonCrdtDoc } from '../crdt/pyreon-adapter'
import { REMOTE_ORIGIN } from '../crdt/types'
import { createYjsDoc } from '../crdt/yjs-adapter'
import { getDocAwareness, onDocAwareness } from '../crdt/yjs-awareness'
import { syncedSignal } from '../synced-signal'

// Inbound ops are UNTRUSTED wire data: a transport JSON-decodes them from a peer
// (or a relay relaying a peer). A clock that is not a finite non-negative safe
// integer poisons last-writer-wins permanently — `Infinity` / `1e308` out-ranks
// every future local write (`clock++` on Infinity is still Infinity, so the
// local write TIES and loses on actor), and a string clock compares
// lexicographically. The merge must refuse such ops rather than adopt them.

const op = (over: Partial<Record<keyof PyreonCrdtOp, unknown>>): PyreonCrdtOp =>
  ({ map: 'm', key: 'k', value: 'evil', clock: 1, actor: 'zzz', ...over }) as PyreonCrdtOp

describe('PyreonCrdtDoc.applyOps — rejects ops that would poison LWW', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const poison: Array<[string, Partial<Record<keyof PyreonCrdtOp, unknown>>]> = [
    ['Infinity clock', { clock: Number.POSITIVE_INFINITY }],
    ['1e308 clock', { clock: 1e308 }],
    ['clock beyond MAX_SAFE_INTEGER', { clock: Number.MAX_SAFE_INTEGER + 2 }],
    ['NaN clock', { clock: Number.NaN }],
    ['negative clock', { clock: -1 }],
    ['fractional clock', { clock: 1.5 }],
    ['string clock', { clock: '999' }],
    ['non-string actor', { actor: 42 }],
    ['non-string map', { map: null }],
    ['non-string key', { key: { toString: () => 'k' } }],
  ]

  for (const [label, over] of poison) {
    it(`drops an op with a ${label} and a later local write still wins`, () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const doc = new PyreonCrdtDoc('aaa')
      doc.applyOps([op(over)], REMOTE_ORIGIN)
      expect(doc.encodeState(), 'the poisoned op was not adopted anywhere').toEqual([])

      // The Lamport clock was not poisoned: a local write is stamped with a
      // sane clock and survives a legitimate remote op at a LOWER clock.
      doc.getMap('m').set('k', 'mine')
      expect(doc.getMap('m').get('k')).toBe('mine')
      const [stamp] = doc.encodeState()
      expect(Number.isSafeInteger(stamp!.clock)).toBe(true)
      expect(stamp!.clock).toBe(1)
    })
  }

  it('applies the valid ops of a mixed batch and drops only the bad one', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const doc = new PyreonCrdtDoc('aaa')
    doc.applyOps(
      [
        op({ key: 'good', value: 'ok', clock: 3 }),
        op({ key: 'bad', clock: Number.POSITIVE_INFINITY }),
      ],
      REMOTE_ORIGIN,
    )
    expect(doc.getMap('m').get('good')).toBe('ok')
    expect(doc.getMap('m').has('bad')).toBe(false)
    // Clock advanced to the VALID op's 3, not to Infinity.
    doc.getMap('m').set('after', 'x')
    const after = doc.encodeState().find((o) => o.key === 'after')
    expect(after!.clock).toBe(4)
  })

  it('dev-warns once per rejected batch with a [Pyreon] prefix', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const doc = new PyreonCrdtDoc('aaa')
    doc.applyOps([op({ clock: -5 }), op({ clock: 'x' })], REMOTE_ORIGIN)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).toMatch(/^\[Pyreon\]/)
  })

  it('accepts clock 0 and MAX_SAFE_INTEGER (the inclusive bounds)', () => {
    const doc = new PyreonCrdtDoc('aaa')
    doc.applyOps([op({ key: 'zero', clock: 0 }), op({ key: 'max', clock: Number.MAX_SAFE_INTEGER })])
    expect(doc.getMap('m').get('zero')).toBe('evil')
    expect(doc.getMap('m').get('max')).toBe('evil')
  })
})

describe('syncedSignal.set — an unchanged value produces no CRDT transaction', () => {
  it('does not emit a Yjs update when setting the value the key already holds', () => {
    const doc = createYjsDoc()
    const s = syncedSignal({ doc, key: 'title', initial: '' })
    s.set('hello')
    let updates = 0
    doc.yDoc.on('update', () => {
      updates++
    })
    s.set('hello')
    s.set('hello')
    expect(updates, 'Y.Map.set of an equal value still writes a new item').toBe(0)
    s.set('world')
    expect(updates).toBe(1)
    expect(s()).toBe('world')
  })

  it('still writes when the displayed value is only a DEFAULT (promotes it to real data)', () => {
    const doc = createYjsDoc()
    const s = syncedSignal({ doc, key: 'title', initial: 'Untitled' })
    expect(doc.getMap('pyreon').has('title')).toBe(false)
    s.set('Untitled')
    expect(doc.getMap('pyreon').get('title'), 'an explicit set is real data').toBe('Untitled')
  })
})

describe('onDocAwareness — wires transports to an awareness created later', () => {
  it('fires every waiter once when the awareness is created, and honours cancel', () => {
    const doc = createYjsDoc()
    const seen: string[] = []
    onDocAwareness(doc, () => seen.push('first'))
    const cancel = onDocAwareness(doc, () => seen.push('cancelled'))
    onDocAwareness(doc, () => seen.push('second'))
    cancel()
    expect(seen).toEqual([])
    const aw = getDocAwareness(doc)
    expect(seen).toEqual(['first', 'second'])
    getDocAwareness(doc) // cached — waiters do not re-fire
    expect(seen).toEqual(['first', 'second'])
    // Already exists → synchronous, cancel is a no-op.
    let got: unknown
    onDocAwareness(doc, (a) => {
      got = a
    })()
    expect(got).toBe(aw)
  })
})
