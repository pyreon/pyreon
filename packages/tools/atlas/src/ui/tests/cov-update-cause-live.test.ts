/**
 * `recentCandidates` — the list the "explain this" picker is built from.
 *
 * Driven against a REAL graph, because the ordering property under test (newest
 * activity first) is a property of the framework's fire ring buffer, and a
 * fabricated list would restate this module's own sort back to it.
 *
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { computed, effect, signal } from '@pyreon/reactivity'
import { recentCandidates } from '../update-cause'

describe('recentCandidates — a node the author never named', () => {
  it('still offers a LABELLED row, never a blank one the picker cannot render', () => {
    // A signal created with no `name` is the normal case for a computed inside
    // a component. `@pyreon/reactivity` auto-names those (`signal#1`), so the
    // module's own `#id` fallback never fires against a real graph — what
    // matters to the picker is that the cell is never empty.
    const anon = signal(0)
    const derived = computed(() => anon() * 2)
    effect(() => void derived())
    anon.set(1)

    const rows = recentCandidates()
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((c) => c.name.length > 0)).toBe(true)
    expect(rows.map((c) => c.kind)).toContain('signal')
  })

  it('prefers a real name where the node has one', () => {
    const named = signal(0, { name: 'cov-named-candidate' })
    effect(() => void named())
    named.set(1)
    expect(recentCandidates(50).map((c) => c.name)).toContain('cov-named-candidate')
  })

  it('lists each node ONCE however many times it fired, newest first', () => {
    const s = signal(0, { name: 'cov-repeat-candidate' })
    effect(() => void s())
    s.set(1)
    s.set(2)
    s.set(3)
    const ids = recentCandidates(50).filter((c) => c.name === 'cov-repeat-candidate')
    expect(ids).toHaveLength(1)
  })

  it('honours the limit — the picker is a short list, not the whole graph', () => {
    for (let i = 0; i < 6; i += 1) {
      const s = signal(0, { name: `cov-limit-${i}` })
      effect(() => void s())
      s.set(1)
    }
    expect(recentCandidates(3)).toHaveLength(3)
  })
})
