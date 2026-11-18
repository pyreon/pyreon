/**
 * Tests for the heap audits' verdict (`scripts/perf/leak-verdict.ts`): a
 * window whose slope exceeds the threshold is a leak only when the heap keeps
 * growing through the confirmation cycles.
 *
 * The recorded series are real: the nightly Leak Sweep's
 * `domConditionalToggle-1000` samples from the last green night and a red
 * one, and a local sweep that ran the confirmation cycles. The growth in them is
 * ONE table doubling (the dev component registry), which the sweep reported
 * as 93,675 bytes per cycle ("91 KB") on six consecutive nights.
 */
import {
  DEFAULT_MAX_CONFIRM_CYCLES,
  confirmationCycles,
  judgeHeapGrowth,
  linearRegression,
} from '../../../../../scripts/perf/leak-verdict'

const TAU = 50_000
const WINDOW = 15

/** Rebuild a sample series from its first value and the deltas between samples. */
function fromDeltas(first: number, deltas: number[]): number[] {
  const out = [first]
  for (const d of deltas) out.push(out[out.length - 1]! + d)
  return out
}

/** Judge `series`: the first 15 samples are the window, the rest feed the confirmation. */
function judge(series: number[], maxCycles = DEFAULT_MAX_CONFIRM_CYCLES) {
  let asked = 0
  const verdict = judgeHeapGrowth(series.slice(0, WINDOW), TAU, maxCycles, (cycles) => {
    asked = cycles
    if (WINDOW + cycles > series.length) {
      throw new Error(`series too short for ${cycles} confirmation cycles`)
    }

    return series.slice(WINDOW, WINDOW + cycles)
  })

  return verdict.then((v) => ({ ...v, asked }))
}

// Leak Sweep run 44090558012 (2026-11-17, main @ fe63ea9): flagged 91.48 KB/cycle.
const RED_NIGHT = fromDeltas(
  93_042_277,
  [14216, 15648, -96, -2128, 680, 160, 208, 917636, -720, 300, 312, -432, 13916, 12228],
)

// Leak Sweep run 43015013922 (2026-11-11, main @ bbac2d8): passed at 46.09 KB/cycle.
const GREEN_NIGHT = fromDeltas(
  106_496_424,
  [11364, 5232, 776, 460, 424, -908, 412, 458632, 1272, -1200, 396, 36, 8880, 10732],
)

// Local full sweep with the confirmation cycles, main @ 9cd858f: the 15-sample window and the 40 cycles after it.
const WINDOW_AND_CONFIRMATION = fromDeltas(
  93_018_679,
  [
    13172, 15016, -436, -1656, 428, 40, -176, 917540, -216, 756, -264, 180, 13008, 10900, 444, 180,
    -192, 156, -372, 444, -436, 372, -600, 276, 180, -48, -348, 144, 276, 132, -288, -3532, -204,
    -12, 204, 504, -192, 192, -156, 72, -120, 504, -204, -120, 168, 216, -1008, 12, 312, -96, 504,
    -912, 468, 1052,
  ],
)

/**
 * Heap of a table-only leak: `rate` bytes of entries per cycle into a
 * container of `capacity` bytes that grows by `factor` when full. The heap
 * shows the capacity, so the leak is visible only as isolated steps.
 */
function geometricLeak(
  rate: number,
  factor: number,
  fill: number,
  capacity: number,
  length: number,
): number[] {
  let cap = capacity
  let used = fill * capacity
  const out: number[] = []
  for (let i = 0; i < length; i++) {
    used += rate
    while (used > cap) cap = Math.ceil(cap * factor)
    out.push(100_000_000 + cap)
  }

  return out
}

describe('one window reads a single step as a slope', () => {
  it('a step in the middle of 15 samples has slope 1.5·S·n/(n²−1), a tenth of the step', () => {
    const step = 917_504
    const samples = Array.from({ length: WINDOW }, (_, i) => (i >= 8 ? step : 0))
    const { slope } = linearRegression(samples)
    // 6·S·k·(n−k) / (n·(n²−1)) with k = 8 samples after the step, n = 15
    expect(slope).toBeCloseTo((6 * step * 8 * 7) / (WINDOW * (WINDOW * WINDOW - 1)), 3)
    expect(slope).toBeGreaterThan(TAU)
    expect(slope / step).toBeCloseTo(0.1, 2)
  })

  it('the recorded red night is over the threshold on its window alone, the green night just under', () => {
    expect(linearRegression(RED_NIGHT).slope).toBeGreaterThan(TAU)
    expect(linearRegression(RED_NIGHT).slope).toBeCloseTo(93_675, -1)
    // 94% of the threshold from one map doubling: one more map was enough.
    expect(linearRegression(GREEN_NIGHT).slope).toBeCloseTo(47_197, -1)
  })
})

describe('confirmationCycles', () => {
  it('is twice the cycles the threshold needs to account for the window range', () => {
    // range 1,000,000 at 50,000 per cycle = 20 cycles, doubled
    expect(confirmationCycles([0, 1_000_000], TAU, 120)).toBe(40)
    expect(confirmationCycles([5, 1_000_005, 400], TAU, 120)).toBe(40)
  })

  it('is never shorter than the window it confirms', () => {
    const samples = Array.from({ length: WINDOW }, (_, i) => i * 1000)
    expect(confirmationCycles(samples, TAU, 120)).toBe(WINDOW)
  })

  it('is 0 when the growth cannot be cleared within the budget, or confirmation is off', () => {
    expect(confirmationCycles([0, 3_000_000], TAU, 120)).toBe(120)
    expect(confirmationCycles([0, 3_000_001], TAU, 120)).toBe(0)
    expect(confirmationCycles([0, 1_000_000], TAU, 0)).toBe(0)
    expect(confirmationCycles([], TAU, 120)).toBe(0)
  })
})

describe('judgeHeapGrowth', () => {
  it('does not sample further when the window is within the threshold', async () => {
    const v = await judge(GREEN_NIGHT)
    expect(v.leak).toBe(false)
    expect(v.reason).toBe('within-threshold')
    expect(v.asked).toBe(0)
    expect(v.confirmation).toBeUndefined()
  })

  it('clears the recorded table doubling: over the threshold once, then flat', async () => {
    const v = await judge(WINDOW_AND_CONFIRMATION)
    expect(v.slope).toBeCloseTo(93_561, 0) // the window alone still reads 91 KB/cycle
    expect(v.reason).toBe('one-time-step')
    expect(v.leak).toBe(false)
    // window range 968,292 bytes -> 2 · ⌈968,292 / 50,000⌉ = 40 further cycles
    expect(v.asked).toBe(40)
    expect(v.confirmation!.slope).toBeCloseTo(-120, 0)
  })

  it('a linear leak just over the threshold stays a leak', async () => {
    const series = Array.from({ length: 200 }, (_, i) => 10_000_000 + 51_000 * i)
    const v = await judge(series)
    expect(v.reason).toBe('confirmed-leak')
    expect(v.leak).toBe(true)
    expect(v.confirmation!.slope).toBeCloseTo(51_000, 0)
  })

  it('growth beyond the confirmation budget is a leak without further sampling', async () => {
    // The context-snapshot leak the harness was built for: 5 MB per cycle.
    const series = Array.from({ length: WINDOW }, (_, i) => 50_000_000 + 5_000_000 * i)
    const v = await judge(series)
    expect(v.reason).toBe('too-large-to-confirm')
    expect(v.leak).toBe(true)
    expect(v.asked).toBe(0)
  })

  it('with confirmation off, an over-threshold window is a leak (the previous behaviour)', async () => {
    const v = await judge(RED_NIGHT, 0)
    expect(v.leak).toBe(true)
    expect(v.reason).toBe('too-large-to-confirm')
  })

  it('a one-time allocation is never a leak, wherever it lands in the window', async () => {
    for (const size of [100_000, 458_752, 917_504, 1_835_008, 2_900_000]) {
      for (let at = 1; at < WINDOW; at++) {
        const series = Array.from(
          { length: WINDOW + 120 },
          (_, i) => 90_000_000 + (i >= at ? size : 0),
        )
        const v = await judge(series)
        expect(v.leak, `step of ${size} at sample ${at}`).toBe(false)
      }
    }
  })

  it('a leak that shows only as container growth steps is still a leak once a window flags it', async () => {
    // Every rate at or above the threshold, growth factors from 1.25 to 2,
    // any fill level and container size the budget can confirm: whenever the
    // first window is over the threshold, the verdict must be a leak. This is
    // the grid that fixes the confirmation length (2·⌈range/τ⌉) and the
    // clearing bound (half the threshold): the lowest confirmation slope a
    // real leak produces over it is 0.55 τ.
    let flagged = 0
    let lowest = Number.POSITIVE_INFINITY
    for (const factor of [1.25, 1.5, 2]) {
      for (const multiple of [1, 1.02, 1.1, 1.25, 1.5, 2, 3, 5, 8, 13, 21, 40]) {
        for (const capacity of [100_000, 200_000, 458_752, 917_504, 1_835_008, 3_000_000]) {
          for (let fill = 0; fill < 1; fill += 0.01) {
            const series = geometricLeak(TAU * multiple, factor, fill, capacity, WINDOW + 125)
            const v = await judge(series)
            if (v.reason === 'within-threshold') continue
            flagged++
            if (v.confirmation !== undefined) lowest = Math.min(lowest, v.confirmation.slope / TAU)
            expect(
              v.leak,
              `rate ${multiple}τ, ×${factor}, ${capacity} bytes, fill ${fill.toFixed(2)}`,
            ).toBe(true)
          }
        }
      }
    }
    expect(flagged).toBeGreaterThan(10_000)
    expect(lowest).toBeGreaterThan(0.5)
  })
})
