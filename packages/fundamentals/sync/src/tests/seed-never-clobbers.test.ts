/**
 * #2519 — a create-if-missing DEFAULT must never destroy real data.
 *
 * The bug: seeding `initial` into the SAME map as real data makes the two
 * writes causally concurrent when two fresh peers meet in an empty room, and
 * `Y.Map` resolves concurrency by clientId — which Yjs assigns RANDOMLY. Half
 * the time the default won and the real value was permanently lost.
 *
 * Every test here runs BOTH clientId orderings, because that is the variable
 * the bug rode on: a single ordering passes 50% of the time by luck, which is
 * exactly how this survived as an intermittent "flake" through several rounds
 * of timeout-raising.
 */
import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { createYjsDoc } from '../yjs'
import { syncedSignal } from '../synced-signal'
import { REMOTE_ORIGIN } from '../crdt/types'

type Doc = ReturnType<typeof createYjsDoc>

/** Apply every update from `from` into `to` — REMOTE origin, as a transport would. */
const merge = (from: Doc, to: Doc) => {
  Y.applyUpdate(to.yDoc, Y.encodeStateAsUpdate(from.yDoc), REMOTE_ORIGIN)
}

/** Converge two docs both ways until stable. */
const converge = (a: Doc, b: Doc) => {
  merge(a, b)
  merge(b, a)
}

/**
 * Build two docs with a DETERMINISTIC clientId ordering, so a test can assert
 * the invariant under both — `lower` always has the smaller clientId.
 */
const pair = (order: 'lower-first' | 'higher-first') => {
  const x = createYjsDoc()
  const y = createYjsDoc()
  const xId = x.yDoc.clientID
  const yId = y.yDoc.clientID
  const [lower, higher] = xId < yId ? [x, y] : [y, x]
  return order === 'lower-first' ? { a: lower, b: higher } : { a: higher, b: lower }
}

describe('a default never clobbers a real value', () => {
  for (const order of ['lower-first', 'higher-first'] as const) {
    it(`a peer's default loses to another peer's real write — ${order}`, () => {
      const { a, b } = pair(order)

      // Peer A has a real value.
      const sa = syncedSignal({ doc: a, key: 'k', initial: '' })
      sa.set('real')

      // Peer B is FRESH and seeds its default with no knowledge of A — the
      // exact concurrency that used to be a coin flip.
      const sb = syncedSignal({ doc: b, key: 'k', initial: 'default' })

      converge(a, b)

      expect(sa(), 'A keeps its real value').toBe('real')
      expect(sb(), 'B adopts the real value, not its own default').toBe('real')
    })

    it(`a real write LANDING LATER still wins over an existing default — ${order}`, () => {
      const { a, b } = pair(order)

      // Both peers seed defaults into an empty room and converge.
      const sa = syncedSignal({ doc: a, key: 'k', initial: 'default' })
      const sb = syncedSignal({ doc: b, key: 'k', initial: 'default' })
      converge(a, b)
      expect(sa()).toBe('default')
      expect(sb()).toBe('default')

      // Now a real write from one side must win everywhere.
      sa.set('typed')
      converge(a, b)

      expect(sa()).toBe('typed')
      expect(sb(), 'the default must not resurface').toBe('typed')
    })

    it(`SIMULTANEOUS default + real write converges on the real one — ${order}`, () => {
      const { a, b } = pair(order)

      // Neither peer has seen the other — writes are genuinely concurrent.
      const sa = syncedSignal({ doc: a, key: 'k', initial: 'A-default' })
      const sb = syncedSignal({ doc: b, key: 'k', initial: 'B-default' })
      sa.set('real')

      converge(a, b)

      // This is the assertion that failed ~50% of the time before the fix.
      expect(sa()).toBe('real')
      expect(sb()).toBe('real')
    })
  }
})

describe('defaults still behave like defaults', () => {
  it('a lone peer shows its default', () => {
    const doc = createYjsDoc()
    expect(syncedSignal({ doc, key: 'k', initial: 'hello' })()).toBe('hello')
  })

  it('two peers converge on ONE default rather than diverging', () => {
    const { a, b } = pair('lower-first')
    const sa = syncedSignal({ doc: a, key: 'k', initial: 'A-default' })
    const sb = syncedSignal({ doc: b, key: 'k', initial: 'B-default' })
    converge(a, b)
    // Which one wins is a tie-break and unspecified — but they must AGREE.
    expect(sa()).toBe(sb())
  })

  it('an EXISTING real value is adopted, never overwritten by a default', () => {
    const { a, b } = pair('lower-first')
    syncedSignal({ doc: a, key: 'k', initial: '' }).set('existing')
    converge(a, b)
    // B joins after the value exists.
    expect(syncedSignal({ doc: b, key: 'k', initial: 'late-default' })()).toBe('existing')
  })

  it('reads a value written into the DATA map by an older client (back-compat)', () => {
    // Docs persisted before this change hold their default in the data map.
    // Reads prefer the data map, so they keep working untouched.
    const doc = createYjsDoc()
    doc.getMap('pyreon').set('k', 'legacy')
    expect(syncedSignal({ doc, key: 'k', initial: 'ignored' })()).toBe('legacy')
  })

  it('a peer default reaches a peer that has none', () => {
    const { a, b } = pair('lower-first')
    const sa = syncedSignal({ doc: a, key: 'k', initial: 'from-A' })
    expect(sa()).toBe('from-A')
    converge(a, b)
    const sb = syncedSignal({ doc: b, key: 'k', initial: 'from-B' })
    expect(sb(), 'A published its default first, so B adopts it').toBe('from-A')
  })

  it('dispose detaches BOTH observers (data + defaults)', () => {
    const doc = createYjsDoc()
    const s = syncedSignal({ doc, key: 'k', initial: 'x' })
    s.dispose()
    // A later default write must not revive the disposed signal.
    doc.getMap('pyreon:defaults').set('k', 'after-dispose')
    expect(s()).toBe('x')
    expect(() => s.dispose()).not.toThrow() // idempotent
  })
})
