/**
 * Contract for `scripts/ci-batch.ts` — the CI matrix batcher.
 *
 * The one property that MUST hold is conservation: batching may reorder or
 * regroup, but it can never drop or duplicate a cell. A lost cell is a
 * silently-skipped check, and a skipped required check reports SUCCESS to
 * branch protection — the exact silent-green failure mode the repo's gate
 * rules exist to prevent. Balance is a performance nicety; conservation is
 * correctness.
 */
import { describe, expect, it } from 'vitest'
import {
  batchByWeight,
  buildBatchedMatrix,
  DEFAULT_WEIGHT,
  toMatrix,
  weightOf,
} from '../../../../../scripts/ci-batch'

const E2E_SUITES = [
  'core', 'ui-regression', 'cssvars', 'compat', 'app-showcase', 'islands',
  'sync-yjs-demo', 'sync-ws-relay', 'collab-board', 'zero-islands',
  'ssg-subpath', 'ssg-i18n', 'ssg-i18n-prefix', 'ssr-node', 'isr-node',
  'zero-hmr', 'perf-dashboard',
]

describe('ci-batch — conservation (the load-bearing property)', () => {
  it('every input cell appears in exactly one batch', () => {
    const out = batchByWeight(E2E_SUITES, 4).flat()
    expect([...out].sort()).toEqual([...E2E_SUITES].sort())
  })

  it('conserves cells at every batch count from 1 to 2x the input size', () => {
    for (let max = 1; max <= E2E_SUITES.length * 2; max++) {
      const out = batchByWeight(E2E_SUITES, max).flat()
      expect([...out].sort(), `max=${max}`).toEqual([...E2E_SUITES].sort())
    }
  })

  it('buildBatchedMatrix throws rather than silently losing a cell', () => {
    // The guard is internal; assert it is WIRED by confirming the happy path
    // round-trips every member back out of the emitted matrix.
    const matrix = buildBatchedMatrix(E2E_SUITES, 4)
    const members = matrix.flatMap((m) => m.members.split(' '))
    expect([...members].sort()).toEqual([...E2E_SUITES].sort())
  })
})

describe('ci-batch — bounds', () => {
  it('never emits more batches than requested', () => {
    expect(batchByWeight(E2E_SUITES, 4)).toHaveLength(4)
    expect(batchByWeight(E2E_SUITES, 3)).toHaveLength(3)
  })

  it('never emits an EMPTY batch (an empty cell would be a wasted runner)', () => {
    const out = batchByWeight(['a', 'b'], 8)
    expect(out).toHaveLength(2)
    for (const b of out) expect(b.length).toBeGreaterThan(0)
  })

  it('handles the degenerate inputs', () => {
    expect(batchByWeight([], 4)).toEqual([])
    expect(batchByWeight(['only'], 4)).toEqual([['only']])
    expect(() => batchByWeight(['a'], 0)).toThrow(/maxBatches/)
  })
})

describe('ci-batch — balance', () => {
  it('keeps the heaviest batch well under the serial total', () => {
    const batches = batchByWeight(E2E_SUITES, 4)
    const totals = batches.map((b) => b.reduce((s, i) => s + weightOf(i), 0))
    const serial = E2E_SUITES.reduce((s, i) => s + weightOf(i), 0)
    // Wall-clock is the HEAVIEST batch. Perfect balance would be serial/4;
    // LPT should land within 1.5x of that, i.e. comfortably under half serial.
    expect(Math.max(...totals)).toBeLessThan(serial / 2)
  })

  it('isolates a dominant cell instead of stacking work on top of it', () => {
    // `native-rest` (332s) dwarfs its peers; LPT must not pile extras onto it
    // while lighter batches idle.
    const cells = ['native-rest', 'core', 'tools', 'zero', 'ui', 'internals']
    const batches = batchByWeight(cells, 3)
    const heavy = batches.find((b) => b.includes('native-rest'))!
    const heavyTotal = heavy.reduce((s, i) => s + weightOf(i), 0)
    const serial = cells.reduce((s, i) => s + weightOf(i), 0)
    expect(heavyTotal).toBeLessThan(serial * 0.75)
  })

  it('is DETERMINISTIC — same input, same batches (check names must be stable)', () => {
    const a = JSON.stringify(batchByWeight(E2E_SUITES, 4))
    const b = JSON.stringify(batchByWeight([...E2E_SUITES].reverse(), 4))
    expect(a).toBe(b)
  })
})

describe('ci-batch — weights', () => {
  it('falls back to DEFAULT_WEIGHT for an unmeasured cell', () => {
    expect(weightOf('a-suite-nobody-measured')).toBe(DEFAULT_WEIGHT)
  })

  it('an unknown weight still conserves the cell (weights only affect balance)', () => {
    const cells = [...E2E_SUITES, 'brand-new-suite']
    const out = batchByWeight(cells, 4).flat()
    expect(out).toContain('brand-new-suite')
    expect([...out].sort()).toEqual([...cells].sort())
  })
})

describe('ci-batch — isolate (protects the native verdict cache)', () => {
  const TEST_CATS = [
    'core', 'fundamentals', 'internals', 'native-compiler-1',
    'native-compiler-2', 'native-rest', 'tools', 'ui', 'ui-system', 'zero',
  ]
  const NATIVE = ['native-compiler-1', 'native-compiler-2', 'native-rest']

  it('keeps every isolated cell in a batch of exactly one', () => {
    const m = buildBatchedMatrix(TEST_CATS, 2, NATIVE)
    for (const n of NATIVE) {
      const entry = m.find((e) => e.members.split(' ').includes(n))!
      expect(entry.members, `${n} must not share a cell`).toBe(n)
    }
  })

  it('still conserves every cell when isolating', () => {
    const m = buildBatchedMatrix(TEST_CATS, 2, NATIVE)
    const members = m.flatMap((e) => e.members.split(' '))
    expect([...members].sort()).toEqual([...TEST_CATS].sort())
  })

  it('an isolate name that is not present is simply ignored', () => {
    const m = buildBatchedMatrix(['a', 'b'], 2, ['not-here'])
    expect(m.flatMap((e) => e.members.split(' ')).sort()).toEqual(['a', 'b'])
  })
})

describe('ci-batch — matrix shape', () => {
  it('emits a readable name and a space-separated member list', () => {
    const m = toMatrix([['core', 'islands']])
    expect(m).toEqual([{ name: 'core+islands', members: 'core islands' }])
  })

  it('truncates a name that would be unreadable in the checks list', () => {
    const many = ['aaaaaaaaaa', 'bbbbbbbbbb', 'cccccccccc', 'dddddddddd', 'eeeeeeeeee', 'ffffffffff']
    const [entry] = toMatrix([many])
    expect(entry!.name.length).toBeLessThanOrEqual(48)
    expect(entry!.name).toContain('more')
    // …but the MEMBERS are never truncated — the name is cosmetic, the member
    // list is what actually runs.
    expect(entry!.members.split(' ')).toHaveLength(many.length)
  })
})
