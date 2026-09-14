/**
 * The mount plugin's two DIAGNOSTIC modes and the batching bound.
 *
 * `ATLAS_PROFILE=1` and `ATLAS_DEBUG_LEAK` exist because the two most
 * expensive answers this plugin gives — "where did the scan's time go" and
 * "why did this scenario fail the leak check" — are otherwise unanswerable
 * from the outside. Both are read from the environment, and a diagnostic that
 * quietly does nothing when its flag is set is worse than one that does not
 * exist: it sends a reader looking for the timing that never appeared.
 *
 * `PROFILE` is a MODULE-LEVEL constant, so the flag is read exactly once at
 * import. Each block below therefore re-imports the module with the
 * environment it is asserting about — which is also the honest shape, because
 * it is what a real process does.
 *
 * The batching bound is the third: groups hold WHOLE components until the
 * group holds about `LEAK_BATCH` scenarios, because a group is the unit that
 * falls back. Ungrouped, ONE leaking component anywhere would send the entire
 * catalog through the slowest path — on exactly the large catalogs the fast
 * path exists for.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import type { ComponentIntelligence, Scenario } from '../../core'
import type { MountRuntime } from '../../verify/harness'
import type { VerifyContext } from '../types'

const Component = () => h('button', {}, 'ok')

const scenarioFor = (id: string): Scenario =>
  ({ id, component: id.split('-')[0]!, name: id, args: {}, source: 'authored' }) as Scenario

const componentFor = (name: string, ids: string[]): ComponentIntelligence =>
  ({
    name,
    component: Component,
    controls: [],
    axes: [],
    scenarios: ids.map(scenarioFor),
    tags: [],
  }) as unknown as ComponentIntelligence

/**
 * A runtime whose graph size is a scripted function of how many mounts have
 * happened, counting the collections the plugin asks for.
 */
function scriptedRuntime(graph: (mounts: number) => number) {
  const state = { mounts: 0, gcCalls: 0 }
  const runtime: MountRuntime = {
    h: h as MountRuntime['h'],
    mount: ((root: unknown, container: Element) => {
      state.mounts += 1
      return (mount as unknown as MountRuntime['mount'])(root, container)
    }) as MountRuntime['mount'],
    registerErrorHandler: () => () => {},
    reactiveGraphSize: () => graph(state.mounts),
    collectGarbage: async () => {
      state.gcCalls += 1
    },
  }
  return { runtime, state }
}

async function verifyAll(
  mountPlugin: typeof import('../mount').mountPlugin,
  runtime: MountRuntime,
  components: ComponentIntelligence[],
) {
  const plugin = mountPlugin({ runtime })
  const out = new Map<string, string>()
  for (const component of components) {
    for (const scenario of component.scenarios) {
      const v = (await plugin.verify!({ scenario, component, components } as VerifyContext)) as {
        leak: { status: string }
      }
      out.set(scenario.id, v.leak.status)
    }
  }
  return out
}

const envKeys = ['ATLAS_PROFILE', 'ATLAS_DEBUG_LEAK'] as const
let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]))
  vi.resetModules()
})
afterEach(() => {
  for (const key of envKeys) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  vi.resetModules()
})

describe('ATLAS_PROFILE=1 — where the scan\'s time went', () => {
  it('records a step timing for every stage it claims to measure', async () => {
    // Without these the only answer to "the scan takes 9 seconds, on what" is
    // a profiler run. The keys are the contract: a stage that stops reporting
    // silently disappears from the breakdown rather than reading as free.
    process.env.ATLAS_PROFILE = '1'
    const { mountPlugin, mountSteps } = await import('../mount')
    mountSteps.clear()

    const { runtime } = scriptedRuntime(() => 10)
    await verifyAll(mountPlugin, runtime, [componentFor('A', ['a-1', 'a-2']), componentFor('B', ['b-1'])])

    expect(mountSteps.size, 'something was recorded').toBeGreaterThan(0)
    const keys = [...mountSteps.keys()]
    expect(keys, 'the mount itself').toContain('real mount')
    expect(keys, 'and the graph reads that bound the leak check').toContain('graphSize()')
    for (const [key, entry] of mountSteps) {
      expect(entry.calls, key).toBeGreaterThan(0)
      expect(entry.ms, key).toBeGreaterThanOrEqual(0)
    }
  })

  it('ACCUMULATES across calls rather than replacing the previous timing', async () => {
    // A per-call overwrite would report the LAST mount's cost as the total,
    // which is the number a reader would then act on.
    process.env.ATLAS_PROFILE = '1'
    const { mountPlugin, mountSteps } = await import('../mount')
    mountSteps.clear()

    const { runtime } = scriptedRuntime(() => 10)
    await verifyAll(mountPlugin, runtime, [componentFor('A', ['a-1', 'a-2', 'a-3'])])
    const calls = mountSteps.get('real mount')?.calls ?? 0
    expect(calls, 'one per mount, not one overall').toBeGreaterThan(1)
  })

  it('records NOTHING when the flag is unset — profiling is not free', async () => {
    // The control. `performance.now()` per step on a 1090-scenario catalog is
    // real work, and the whole reason the flag exists.
    delete process.env.ATLAS_PROFILE
    const { mountPlugin, mountSteps } = await import('../mount')
    mountSteps.clear()

    const { runtime } = scriptedRuntime(() => 10)
    await verifyAll(mountPlugin, runtime, [componentFor('A', ['a-1', 'a-2'])])
    expect(mountSteps.size).toBe(0)
  })

  it('is OFF for any value other than exactly "1"', async () => {
    // `ATLAS_PROFILE=true` reads as "on" to a person and must not be, or the
    // flag's contract is "any truthy string" and the docs are wrong.
    process.env.ATLAS_PROFILE = 'true'
    const { mountPlugin, mountSteps } = await import('../mount')
    mountSteps.clear()
    const { runtime } = scriptedRuntime(() => 10)
    await verifyAll(mountPlugin, runtime, [componentFor('A', ['a-1'])])
    expect(mountSteps.size).toBe(0)
  })
})

describe('ATLAS_DEBUG_LEAK — why THIS scenario failed', () => {
  /** A catalog whose retention climbs with every mount — a real leak shape. */
  const climbing = () => scriptedRuntime((mounts) => 10 + mounts * 3)

  it('prints the three counts the verdict is derived from', async () => {
    // `floor → afterA → afterB` IS the reasoning: a real leak ACCUMULATES,
    // and an engine straggler does not. Without the numbers a reader cannot
    // tell which one they are looking at.
    process.env.ATLAS_DEBUG_LEAK = '1'
    const { mountPlugin } = await import('../mount')
    const lines: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((c: unknown) => {
      lines.push(String(c))
      return true
    })

    const { runtime } = climbing()
    await verifyAll(mountPlugin, runtime, [componentFor('A', ['a-1', 'a-2'])])
    vi.restoreAllMocks()

    const debug = lines.filter((l) => l.includes('[leak-debug]'))
    expect(debug.length, 'one line per bisected scenario').toBeGreaterThan(0)
    expect(debug.join(''), 'naming the scenario').toContain('a-1')
    expect(debug.join('')).toMatch(/floor=\d+ afterA=\d+ afterB=\d+/)
  })

  it('prints NOTHING when the flag is unset', async () => {
    delete process.env.ATLAS_DEBUG_LEAK
    const { mountPlugin } = await import('../mount')
    const lines: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((c: unknown) => {
      lines.push(String(c))
      return true
    })

    const { runtime } = climbing()
    await verifyAll(mountPlugin, runtime, [componentFor('A', ['a-1', 'a-2'])])
    vi.restoreAllMocks()
    expect(lines.filter((l) => l.includes('[leak-debug]'))).toEqual([])
  })
})

/**
 * A runtime whose graph needs exactly ONE collection to come back to rest.
 *
 * `scriptedRuntime`'s constant-zero graph is already at rest, so it settles in
 * zero sweeps and the sweep count cannot distinguish one group from four. This
 * shape makes each group's settle cost exactly one collection, which is what
 * makes the bound observable.
 */
function settlesInOneSweep() {
  const state = { mounts: 0, gcCalls: 0, dirty: false }
  const runtime: MountRuntime = {
    h: h as MountRuntime['h'],
    mount: ((root: unknown, container: Element) => {
      state.mounts += 1
      state.dirty = true
      return (mount as unknown as MountRuntime['mount'])(root, container)
    }) as MountRuntime['mount'],
    registerErrorHandler: () => () => {},
    reactiveGraphSize: () => (state.dirty ? 5 : 0),
    collectGarbage: async () => {
      state.gcCalls += 1
      state.dirty = false
    },
  }
  return { runtime, state }
}

describe('the leak batch bound', () => {
  it('splits a catalog past the bound into SEVERAL sweeps, not one', async () => {
    // A group is the unit that falls back. Ungrouped, one leaking component
    // anywhere would send the whole catalog through the slowest path — on
    // exactly the large catalogs the fast path exists for. The bound is 256
    // scenarios, held to WHOLE components so a verdict is never split across
    // sweeps.
    const { mountPlugin } = await import('../mount')
    // 400 scenarios over 8 components: past the bound, and no single
    // component large enough to be the bound on its own.
    const catalog = Array.from({ length: 8 }, (_, c) =>
      componentFor(
        `C${c}`,
        Array.from({ length: 50 }, (_, s) => `C${c}-${s}`),
      ),
    )
    const { runtime, state } = settlesInOneSweep()
    const verdicts = await verifyAll(mountPlugin, runtime, catalog)

    expect(verdicts.size).toBe(400)
    expect([...verdicts.values()].every((v) => v === 'pass'), 'a clean catalog passes').toBe(true)
    // TWO groups (the bound falls after the sixth component, 300 scenarios),
    // at two sweeps each — a warm-up settle and the measuring one. Not 400.
    expect(state.gcCalls, 'per GROUP, never per scenario').toBe(4)
  })

  it('costs ONE sweep for a catalog under the bound', async () => {
    // The control for the spec above. The win is collapsing thousands of
    // collections into one, and a bound that engaged early would give it back.
    const { mountPlugin } = await import('../mount')
    const small = Array.from({ length: 2 }, (_, c) =>
      componentFor(
        `S${c}`,
        Array.from({ length: 50 }, (_, s) => `S${c}-${s}`),
      ),
    )
    const { runtime, state } = settlesInOneSweep()
    const verdicts = await verifyAll(mountPlugin, runtime, small)
    expect([...verdicts.values()].every((v) => v === 'pass')).toBe(true)
    expect(state.gcCalls, '100 scenarios still fit in ONE group').toBe(2)
  })
})
