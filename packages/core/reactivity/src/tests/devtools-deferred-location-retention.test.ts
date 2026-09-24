/**
 * The dev-mode devtools registry must not keep a reactive node, or anything
 * its creator closed over, reachable.
 *
 * Every signal / computed / effect created in dev captures an unformatted
 * `Error` so its source location can be parsed later, on demand. An
 * unformatted V8 Error holds one call-site record per captured frame, and each
 * record holds that frame's FUNCTION — with its closure context. Two leaks came
 * out of that, both found by a 1,000-node flow canvas that never released:
 *
 *   1. The Error sat on the record, and the record in a strong Map. When the
 *      creating frame's closure could reach the node, the node could never be
 *      collected, so its FinalizationRegistry entry never fired and the record
 *      was never pruned. A component that created a signal stayed in memory
 *      for the whole dev session after it unmounted.
 *   2. The default capture keeps TEN frames. A caller far above the creation
 *      site stayed pinned, with everything it closed over, for as long as the
 *      node lived — which is how the canvas kept nodes it had removed.
 *
 * GC-observable: needs `--expose-gc` (wired in this package's vitest config).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { __resetReactiveDevtoolsForTesting } from '../reactive-devtools'
import { signal } from '../signal'

const hasGc = typeof globalThis.gc === 'function'

async function collectGarbage(): Promise<void> {
  // A finalizer runs after the collection that found the node dead, and the
  // record it prunes is what held the Error, so this needs several rounds.
  for (let i = 0; i < 4; i++) {
    globalThis.gc!()
    await new Promise((r) => setTimeout(r, 0))
  }
}

class Payload {
  node: unknown = null
}

describe('dev-mode deferred source locations do not retain', () => {
  afterEach(() => __resetReactiveDevtoolsForTesting())

  it('the GC harness is present, so the specs below run rather than skip', () => {
    expect(hasGc, 'run with --expose-gc (see vitest.config.ts)').toBe(true)
  })

  it.runIf(hasGc)('a node whose creator closes over it is collected once unreferenced', async () => {
    // The creating function closes over `payload`, and `payload` holds the
    // signal: exactly the component-closure shape. Nothing outside keeps it.
    const probe = () => {
      const payload = new Payload()
      const create = () => {
        payload.node = signal(0)
        return payload
      }
      create()
      return new WeakRef(payload)
    }
    const ref = probe()
    await collectGarbage()
    expect(ref.deref(), 'the registry kept the creator closure reachable').toBeUndefined()
  })

  it.runIf(hasGc)('a caller far above the creation site is not pinned while the node lives', async () => {
    // The node stays alive (held by the test). Its creation site is five frames
    // below a caller that closes over `payload`. Only the frames the location
    // parser reads may be retained, and this caller is not one of them.
    let held: unknown = null
    // The deep chain is built in its OWN scope. Closures created in one
    // function share one V8 context, so building it beside `payload` would pin
    // `payload` through the retained creation frame itself and prove nothing.
    const makeDeep = () => {
      const depth5 = () => {
        held = signal(0)
      }
      const depth4 = () => depth5()
      const depth3 = () => depth4()
      return () => depth3()
    }
    const probe = () => {
      const payload = new Payload()
      const deep = makeDeep()
      const caller = () => {
        void payload
        deep()
      }
      caller()
      return new WeakRef(payload)
    }
    const ref = probe()
    await collectGarbage()
    expect(held).not.toBeNull()
    expect(ref.deref(), 'a distant caller stayed pinned by the captured stack').toBeUndefined()
  })
})
