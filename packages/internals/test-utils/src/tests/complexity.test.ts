import { expectSubQuadratic, measureComplexity } from '../complexity'

// Count the work performed by real loops, rather than timing a microbenchmark
// inside a concurrent coverage run. The helper still uses performance.now by
// default; these controls exercise its calibration, sampling and verdicts.
function linear(n: number, tick: () => void): void {
  for (let i = 0; i < n; i++) tick()
}

function quadratic(n: number, tick: () => void): void {
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) tick()
}

function counted(work: (n: number, tick: () => void) => void) {
  let ticks = 0
  return {
    run: (n: number) =>
      work(n, () => {
        ticks++
      }),
    clock: () => ticks / 4,
  }
}

describe('measureComplexity', () => {
  it('reports the scale factor for linear work', () => {
    const { run, clock } = counted(linear)
    const r = measureComplexity(run, 4, { clock, scale: 8, samples: 3 })
    expect(r.baseMs).toBe(1)
    expect(r.ratio).toBe(8)
    expect(r.ok).toBe(true)
  })

  it('reports the squared scale factor for quadratic work', () => {
    const { run, clock } = counted(quadratic)
    const r = measureComplexity(run, 4, { clock, scale: 8, samples: 5 })
    expect(r.ratio).toBe(64)
    expect(r.ok).toBe(false)
  })

  it('grows the base size until the run is measurable', () => {
    const { run, clock } = counted(linear)
    const r = measureComplexity(run, 1, { clock, minMs: 1, samples: 3 })
    expect(r.baseN).toBe(4)
    expect(r.baseMs).toBe(1)
    expect(r.ok).toBe(true)
  })

  it('uses the fastest sample from the injected clock', () => {
    const durations = [2, 1, 3, 20, 8, 12]
    let calls = 0
    let elapsed = 0
    const r = measureComplexity(
      () => {
        elapsed += durations[calls++] ?? 1
      },
      4,
      {
        clock: () => elapsed,
        samples: 3,
      },
    )
    expect(r).toMatchObject({ baseN: 4, baseMs: 1, scaledMs: 8, ratio: 8, ok: true })
    expect(calls).toBe(6)
  })

  it('remeasures both sizes once when contention skews the first scaled samples', () => {
    const durations = [1, 1, 32, 32, ...Array<number>(6).fill(1), ...Array<number>(6).fill(8)]
    let calls = 0
    let elapsed = 0
    const r = measureComplexity(
      () => {
        elapsed += durations[calls++] ?? 1
      },
      4,
      {
        clock: () => elapsed,
        samples: 2,
      },
    )
    expect(r).toMatchObject({ baseMs: 1, scaledMs: 8, ratio: 8, ok: true })
    expect(calls).toBe(16)
  })

  it('uses performance.now by default', () => {
    const times = [0, 2, 5, 7, 11, 17, 18, 24]
    let calls = 0
    const now = vi.spyOn(performance, 'now').mockImplementation(() => times[calls++] ?? 24)
    let result: ReturnType<typeof measureComplexity>
    try {
      result = measureComplexity(() => {}, 4, { scale: 3, samples: 2 })
    } finally {
      now.mockRestore()
    }
    expect(result).toMatchObject({ baseMs: 2, scaledMs: 6, ratio: 3, ok: true })
    expect(calls).toBe(8)
  })

  it('marks an unmeasurable run instead of silently passing', () => {
    const r = measureComplexity(() => {}, 1, { clock: () => 0, minMs: 1_000_000 })
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('UNMEASURABLE')
  })

  it('stops growing a run whose cost is flat in n, instead of doubling into an OOM', () => {
    let sink = 0
    const { run, clock } = counted((_n, tick) => {
      for (let i = 0; i < 4; i++) {
        sink++
        tick()
      }
    })
    const r = measureComplexity(run, 8, { clock, minMs: 1_000, samples: 1 })
    expect(sink).toBeGreaterThan(0)
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('FLAT in n')
    expect(r.detail).toContain('more iterations inside run()')
    expect(r.baseN).toBe(8 * 2 ** 4)
  })

  it('bounds a run that retains a fixture per size — the shape that killed the worker', () => {
    // Keep real retained allocations, capped so a missing stop fails an
    // assertion rather than killing the worker. Count each filled slot.
    const kept: number[][] = []
    const { run, clock } = counted((n, tick) => {
      const size = Math.min(n, 50_000)
      const fixture = new Array<number>(size)
      for (let i = 0; i < size; i++) {
        fixture[i] = i
        tick()
      }
      kept.push(fixture)
    })
    const r = measureComplexity(run, 4096, { clock, minMs: 60_000, samples: 1 })
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('UNMEASURABLE')
    expect(r.baseN).toBeLessThan(4096 * 2 ** 10)
    expect(kept.length).toBeGreaterThan(0)
  })
})

describe('expectSubQuadratic', () => {
  it('passes linear work', () => {
    const { run, clock } = counted(linear)
    expect(() => expectSubQuadratic(run, 4, { clock, label: 'linear', samples: 3 })).not.toThrow()
  })

  it('throws on quadratic work, naming the observed curve', () => {
    const { run, clock } = counted(quadratic)
    expect(() => expectSubQuadratic(run, 4, { clock, label: 'quadratic', samples: 2 })).toThrow(
      'expected sub-quadratic growth but measured quadratic:',
    )
    expect(() => expectSubQuadratic(run, 4, { clock, label: 'quadratic', samples: 2 })).toThrow(
      'ratio 64.00',
    )
  })
})
