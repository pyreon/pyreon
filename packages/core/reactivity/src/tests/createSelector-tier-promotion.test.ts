/**
 * `notifyBucket` dispatches a key's TRACKED subscribers from the two-tier
 * store (`_s1` inline slot + `_s`, which holds either a second inline
 * subscriber or a promoted Set of three-or-more). It snapshots both inline
 * slots before dispatching — but it then re-read the LIVE storage to decide
 * whether the second one was still subscribed, and asked only the two INLINE
 * shapes:
 *
 *     if (s2 !== null && (host._s === s2 || host._s1 === s2)) s2()
 *
 * When the first subscriber registers a THIRD subscriber on the same key,
 * `addSubscriber` PROMOTES both inline slots into a Set — `_s` becomes that Set
 * and `_s1` becomes null — so neither identity matched and `s2` was silently
 * skipped despite being live inside the Set. v0.51.0 iterated the Set with a
 * size cap and was correct; the inline fast path (#3350) reintroduced the hole.
 *
 * Three arms, because only ONE of them was ever broken: the defect needs the
 * bucket to be in the two-inline shape AT ENTRY and promoted DURING dispatch.
 * A bucket that is already a Set takes the Set branch and was always correct —
 * those arms are the controls that prove the fix did not simply make everything
 * fire twice.
 */
import { createSelector, effect, signal } from '../index'

/**
 * Drive one selection change across a key watched by `2 + extra` effects, where
 * the FIRST effect registers one more subscriber on that same key as it re-runs.
 *
 * `extra = 0` is the two-inline shape (the regression). `extra >= 1` starts the
 * bucket as a promoted Set.
 */
function runArm(extra: number) {
  const src = signal('other')
  const selected = createSelector(src)
  let aRuns = 0
  let bRuns = 0
  let cRuns = 0
  let armed = false

  for (let i = 0; i < extra; i++) effect(() => void selected('k'))

  effect(() => {
    aRuns++
    selected('k')
    if (armed) {
      armed = false
      // The third subscriber, registered from INSIDE the dispatch — this is
      // what promotes the bucket's two inline slots into a Set mid-notify.
      effect(() => {
        cRuns++
        selected('k')
      })
    }
  })
  effect(() => {
    bRuns++
    selected('k')
  })

  const mounted = { aRuns, bRuns, cRuns }
  armed = true
  src.set('k') // selection crosses 'k' → notifyBucket over the 'k' bucket
  return { mounted, aRuns, bRuns, cRuns }
}

describe('createSelector — a subscriber added DURING dispatch promotes the tier', () => {
  it('two-inline: the SECOND subscriber still fires when the first promotes the bucket', () => {
    const r = runArm(0)
    expect(r.mounted).toEqual({ aRuns: 1, bRuns: 1, cRuns: 0 })
    expect(r.aRuns, 'first subscriber re-ran').toBe(2)
    // The regression: `bRuns` stayed at 1 — b was live in the promoted Set but
    // matched neither inline identity, so it never saw the selection change.
    expect(r.bRuns, 'second subscriber must not be skipped by the promotion').toBe(2)
    // The subscriber registered mid-dispatch runs once (its own mount run) and
    // is deliberately NOT delivered this pass — same rule as the Set branch's
    // `originalSize` cap.
    expect(r.cRuns).toBe(1)
  })

  for (const extra of [1, 3]) {
    it(`promoted Set (${extra} extra subscriber${extra > 1 ? 's' : ''}): unchanged — every subscriber fires`, () => {
      const r = runArm(extra)
      expect(r.aRuns).toBe(2)
      expect(r.bRuns).toBe(2)
      expect(r.cRuns).toBe(1)
    })
  }

  it('the ordinary shapes are untouched: sole subscriber, and two with no promotion', () => {
    const src = signal('other')
    const selected = createSelector(src)
    let sole = 0
    effect(() => {
      sole++
      selected('k')
    })
    src.set('k')
    expect(sole).toBe(2)

    const src2 = signal('other')
    const sel2 = createSelector(src2)
    let x = 0
    let y = 0
    effect(() => {
      x++
      sel2('k')
    })
    effect(() => {
      y++
      sel2('k')
    })
    src2.set('k')
    expect([x, y]).toEqual([2, 2])
    // …and crossing back OFF the key notifies both again.
    src2.set('other')
    expect([x, y]).toEqual([3, 3])
  })

  it('a subscriber that UNSUBSCRIBES the second one mid-dispatch does not resurrect it', () => {
    const src = signal('other')
    const selected = createSelector(src)
    let bRuns = 0
    let armed = false
    const b = effect(() => {
      bRuns++
      selected('k')
    })
    effect(() => {
      selected('k')
      if (armed) {
        armed = false
        b.dispose()
      }
    })
    // `b` is `_s1` (subscribed first); the disposing effect is `_s`. Whichever
    // slot each lands in, a disposed subscriber must not be called.
    const before = bRuns
    armed = true
    src.set('k')
    expect(bRuns).toBeLessThanOrEqual(before + 1)
  })
})
