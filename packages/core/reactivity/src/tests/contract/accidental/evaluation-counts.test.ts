/**
 * ACCIDENTAL behaviour — pinned so a change is noticed, not because it is
 * promised. The design (reactivity-core.md §1.6, §6) marked these as
 * properties of the pre-graph core; stage (ii) (the link-graph core) changed
 * each one deliberately, and the old value is kept in a comment.
 */
import { computed, effect, signal } from '../../../index'

describe('C6 (accidental; decision D3) — an { equals } computed evaluates once per dependency change with no reader', () => {
  // D3: `{ equals }` computeds are lazy like every computed since stage (ii):
  // ZERO evaluations across the 20 writes (`evals` stays 1). Before: 21.
  test('C6: 20 writes, no reader → no evaluation', () => {
    const n = signal(0)
    let evals = 0
    const c = computed(
      () => {
        evals++
        return n() * 2
      },
      { equals: Object.is },
    )
    expect(c()).toBe(0)
    for (let i = 1; i <= 20; i++) n.set(i)
    expect(evals).toBe(1) // before stage (ii): 21
  })
})

describe('C7 (accidental; §6 "fewer computed evaluations") — evaluations below an unchanged node', () => {
  // Exact cutoff since stage (ii): only `b`, whose own source changed,
  // evaluates; `c1..c3` evaluate ZERO times. Before, the gate landed on the
  // computed immediately above the runner and its refresh pulled the whole
  // chain, so every node below the unchanged one evaluated once per write.
  test('C7: n → b(unchanged) → c1 → c2 → c3 → effect; two writes', () => {
    const n = signal(0)
    const evals = { b: 0, c1: 0, c2: 0, c3: 0 }
    const b = computed(() => {
      evals.b++
      return Math.floor(n() / 10)
    })
    const c1 = computed(() => {
      evals.c1++
      return b() + 1
    })
    const c2 = computed(() => {
      evals.c2++
      return c1() + 1
    })
    const c3 = computed(() => {
      evals.c3++
      return c2() + 1
    })
    let runs = 0
    effect(() => {
      c3()
      runs++
    })
    const base = { ...evals }
    n.set(1)
    n.set(2)
    expect(evals.b - base.b).toBe(2)
    expect(evals.c1 - base.c1).toBe(0) // before stage (ii): 2
    expect(evals.c2 - base.c2).toBe(0) // before stage (ii): 2
    expect(evals.c3 - base.c3).toBe(0) // before stage (ii): 2
    expect(runs).toBe(1) // kept: the effect never re-runs (C4)
  })
})
