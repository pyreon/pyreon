/**
 * `createSelector` per-key reclamation (leak class C — unbounded cache).
 *
 * The selector keeps a per-key bucket so a selection change can notify only the
 * two affected keys instead of every subscriber. That bucket used to be created
 * on first access and NEVER removed: disposing the subscriber emptied the Set
 * but left the key, its empty Set and its host object in the maps for the
 * selector's lifetime. For a bounded key space (tabs, a radio group) that is
 * invisible; for a list whose ids never repeat (infinite scroll, a chat log, a
 * re-keyed table) it accumulates ~258 bytes per row ever rendered — and with
 * OBJECT keys it pinned the user's own objects too.
 *
 * These tests lock the reclamation contract from both sides: dead keys must be
 * released, and live ones must NOT be — dropping a key that still has a
 * subscriber would turn a memory fix into leak class B (subscriber retention /
 * lost notification).
 */
import { describe, expect, it } from 'vitest'
import { createSelector } from '../createSelector'
import { renderEffect } from '../effect'
import { signal } from '../signal'

/**
 * Give V8 a real chance to collect, then count how many of `refs` are gone.
 *
 * A `WeakRef` is only cleared after a collection that actually traces the
 * object, so a single synchronous `gc()` is not reliable — the loop yields a
 * macrotask between collections (the same reason `bench-fair`'s heap settle
 * loop yields rather than calling `gc()` three times in a row).
 *
 * Counts a POPULATION rather than asserting on one chosen object: under
 * vitest's fork pool the still-live test frame can pin an individual local for
 * the duration of the test (verified — the identical loop releases every key
 * when run as a plain node script). A population assertion is immune to that
 * while still being decisive: before the fix the released count is exactly 0.
 */
async function countCollected(refs: WeakRef<object>[]): Promise<number> {
  const gc = (globalThis as { gc?: () => void }).gc
  if (!gc) throw new Error('these tests require --expose-gc (see vitest.config.ts execArgv)')
  for (let i = 0; i < 10; i++) {
    gc()
    await new Promise((r) => setTimeout(r, 0))
  }
  return refs.reduce((n, r) => n + (r.deref() === undefined ? 1 : 0), 0)
}

describe('createSelector — per-key reclamation', () => {
  it('RELEASES an object key once its last tracked subscriber is disposed', async () => {
    const selected = signal<object | null>(null)
    const isSelected = createSelector(selected)

    // Enough distinct keys to cross the sweep threshold, since reclamation is
    // amortized rather than immediate — the contract is "bounded", not
    // "released on the very next tick".
    const KEYS = 8000
    const refs: WeakRef<object>[] = []
    for (let i = 0; i < KEYS; i++) {
      const key = { id: i }
      refs.push(new WeakRef(key))
      const dispose = renderEffect(() => {
        isSelected(key)
      })
      dispose()
    }
    // Touch one more key so the sweep has a growth event to hang off.
    renderEffect(() => {
      isSelected({ id: -1 })
    })()

    // The contract is that the un-reclaimed residual is BOUNDED (one amortized
    // sweep window) rather than PROPORTIONAL to the keys ever seen. Asserting
    // the bound rather than a percentage is what makes this decisive: before
    // the fix the residual is all 8000, because no key was ever released.
    const released = await countCollected(refs)
    expect(KEYS - released).toBeLessThan(1024)
  })

  it('does NOT release a key that still has a live subscriber, and still notifies it', async () => {
    const selected = signal<object | null>(null)
    const isSelected = createSelector(selected)

    const liveKey = { id: 'live' }
    const seen: boolean[] = []
    // A LIVE subscriber on `liveKey` — this must survive any amount of sweeping.
    renderEffect(() => {
      seen.push(isSelected(liveKey))
    })
    expect(seen).toEqual([false])

    // Churn far past the sweep threshold with dead keys.
    for (let i = 0; i < 4000; i++) {
      const dispose = renderEffect(() => {
        isSelected({ id: i })
      })
      dispose()
    }

    // The live subscriber must still be wired up: selecting its key notifies it.
    selected.set(liveKey)
    expect(seen).toEqual([false, true])
    selected.set(null)
    expect(seen).toEqual([false, true, false])
  })

  it('keeps per-key notification O(1) — selecting a key does not wake other keys', () => {
    const selected = signal<number | null>(null)
    const isSelected = createSelector(selected)

    const runs = new Array<number>(50).fill(0)
    for (let i = 0; i < 50; i++) {
      renderEffect(() => {
        isSelected(i)
        runs[i] = (runs[i] as number) + 1
      })
    }
    expect(runs.every((r) => r === 1)).toBe(true)

    selected.set(7)
    // Only key 7 re-ran; every other row is untouched.
    expect(runs[7]).toBe(2)
    expect(runs.filter((r) => r !== 1).length).toBe(1)

    selected.set(9)
    // Exactly the deselected (7) and newly selected (9) keys re-ran.
    expect(runs[7]).toBe(3)
    expect(runs[9]).toBe(2)
    expect(runs.filter((r) => r !== 1).length).toBe(2)
  })

  it('a swept key still works when queried again', () => {
    const selected = signal<number | null>(null)
    const isSelected = createSelector(selected)

    // Register then drop key 1, then churn enough to guarantee a sweep.
    renderEffect(() => {
      isSelected(1)
    })()
    for (let i = 100; i < 4100; i++) {
      renderEffect(() => {
        isSelected(i)
      })()
    }

    // Re-subscribing to the swept key must behave exactly as a first access.
    const seen: boolean[] = []
    renderEffect(() => {
      seen.push(isSelected(1))
    })
    expect(seen).toEqual([false])
    selected.set(1)
    expect(seen).toEqual([false, true])
  })
})
