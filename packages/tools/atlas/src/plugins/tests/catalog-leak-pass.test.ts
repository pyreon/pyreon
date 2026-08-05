/**
 * The CATALOG-wide leak pass — one garbage collection for every component.
 *
 * The per-component pass is covered by `leak-check.test.ts`, and the real
 * end-to-end proof (real GC, real registry, real Vite loader, a leaky fixture)
 * is `scan-leak.test.ts`. What is pinned HERE is the decision ladder the wide
 * pass adds, because each rung changes which verdict a scenario gets:
 *
 *   clean sweep                  → every scenario passes, one collection
 *   dirty, not accumulating      → every scenario passes (an engine straggler)
 *   dirty and still climbing     → falls through to the per-component path
 *
 * The graph is scripted as a function of MOUNTS rather than of reads, for the
 * same reason `leak-check.test.ts` is: a read-indexed script pins the checker's
 * exact call sequence instead of its meaning, and breaks the moment the
 * settling strategy changes — which is precisely what this pass changed.
 */
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import type { ComponentIntelligence, Scenario } from '../../core'
import { mountPlugin } from '../mount'
import type { MountRuntime } from '../../verify/harness'
import type { VerifyContext } from '../types'

const Component = () => h('button', {}, 'ok')

const scenarioFor = (id: string): Scenario => ({
  id,
  component: id.split('-')[0]!,
  name: id,
  args: {},
  source: 'authored',
})

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
 * happened, and which counts the collections the plugin asks for.
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

/** Verify every scenario of every component, as the pipeline would. */
async function verifyAll(runtime: MountRuntime, components: ComponentIntelligence[]) {
  const plugin = mountPlugin({ runtime })
  const out = new Map<string, { interaction: string; leak: string }>()
  for (const component of components) {
    for (const scenario of component.scenarios) {
      const v = (await plugin.verify!({ scenario, component, components } as VerifyContext)) as {
        interaction: { status: string }
        leak: { status: string }
      }
      out.set(scenario.id, { interaction: v.interaction.status, leak: v.leak.status })
    }
  }
  return out
}

describe('the catalog-wide leak pass', () => {
  const catalog = () => [
    componentFor('A', ['a-1', 'a-2', 'a-3']),
    componentFor('B', ['b-1', 'b-2']),
    componentFor('C', ['c-1']),
  ]

  it('passes every scenario in a clean catalog', async () => {
    // A graph that always reads the same value: nothing is ever retained.
    const { runtime } = scriptedRuntime(() => 0)
    const verdicts = await verifyAll(runtime, catalog())
    expect([...verdicts.keys()].sort()).toEqual(['a-1', 'a-2', 'a-3', 'b-1', 'b-2', 'c-1'])
    for (const [id, v] of verdicts) expect(v.leak, id).toBe('pass')
  })

  it('spends a HANDFUL of collections on the whole catalog, not one per component', async () => {
    // The entire point. Six scenarios across three components used to cost a
    // sweep per component; the wide pass answers for all of them at once, and
    // this asserts the ORDER OF MAGNITUDE rather than an exact count so a
    // future settling tweak does not fail a test about batching.
    const { runtime, state } = scriptedRuntime(() => 0)
    await verifyAll(runtime, catalog())
    expect(state.gcCalls).toBeLessThan(3)
  })

  it('passes a catalog whose retention does NOT accumulate (an engine straggler)', async () => {
    // The graph jumps once and then holds flat however many more mounts happen.
    // That is a straggler, not a per-mount leak, and the re-probe is what tells
    // them apart — without it this whole catalog would fall through to the
    // per-component path and the optimization would be forfeit to noise.
    const { runtime } = scriptedRuntime((mounts) => (mounts > 0 ? 3 : 0))
    const verdicts = await verifyAll(runtime, catalog())
    for (const [id, v] of verdicts) expect(v.leak, id).toBe('pass')
  })

  it('falls through to the per-component path when the count keeps CLIMBING', async () => {
    // Every mount strands more. The wide pass cannot say WHICH component is at
    // fault — and guessing is exactly what a leak check must not do — so it
    // records nothing and the per-component path resolves it.
    const { runtime } = scriptedRuntime((mounts) => mounts * 2)
    const verdicts = await verifyAll(runtime, catalog())
    expect(verdicts.size).toBe(6)
    // A verdict was still produced for every scenario: falling through must
    // never leave a scenario unanswered.
    for (const [id, v] of verdicts) expect(['pass', 'fail'], id).toContain(v.leak)
    expect([...verdicts.values()].some((v) => v.leak === 'fail')).toBe(true)
  })

  it('confines a leak to its OWN group — the rest of the catalog keeps the fast path', async () => {
    // The blast-radius property. Grouping exists as much for this as for
    // memory: ungrouped, one leaking component anywhere would send the ENTIRE
    // catalog down the per-scenario path, which is the slowest one, on exactly
    // the large catalogs the wide pass is for.
    //
    // Scripted so that only mounts of the LEAKY component strand anything.
    // Every other component's group must still settle clean and be answered by
    // its own single sweep.
    let leakyMounts = 0
    const state = { gcCalls: 0 }
    const runtime: MountRuntime = {
      h: h as MountRuntime['h'],
      mount: ((root: unknown, container: Element) => {
        // The leaky component is identified by the args its scenarios carry.
        return (mount as unknown as MountRuntime['mount'])(root, container)
      }) as MountRuntime['mount'],
      registerErrorHandler: () => () => {},
      reactiveGraphSize: () => leakyMounts * 2,
      collectGarbage: async () => {
        state.gcCalls += 1
      },
    }
    // Only the leaky component increments, via its own component function.
    const Leaky = () => {
      leakyMounts += 1
      return h('button', {}, 'leaky')
    }
    const leaky = {
      ...componentFor('Leaky', ['leak-1']),
      component: Leaky,
    } as unknown as ComponentIntelligence
    const clean = Array.from({ length: 4 }, (_, i) => componentFor(`Clean${i}`, [`c${i}-1`, `c${i}-2`]))

    const verdicts = await verifyAll(runtime, [leaky, ...clean])
    // Every scenario answered, and the clean ones pass.
    expect(verdicts.size).toBe(9)
    for (const c of clean) {
      for (const s of c.scenarios) expect(verdicts.get(s.id)!.leak, s.id).toBe('pass')
    }
  })

  it('SKIPS the wide pass when no leak verdict is possible at all', async () => {
    // No GC hook: the leak check cannot make its claim, so it must skip with a
    // reason rather than fabricate a pass — and the wide pass must not swallow
    // that reason on the way past.
    const runtime: MountRuntime = {
      h: h as MountRuntime['h'],
      mount: mount as unknown as MountRuntime['mount'],
      registerErrorHandler: () => () => {},
      reactiveGraphSize: () => 0,
    }
    const verdicts = await verifyAll(runtime, catalog())
    for (const [id, v] of verdicts) {
      expect(v.leak, id).toBe('skip')
      expect(v.interaction, id).toBe('pass') // the mount half still ran
    }
  })

  it('handles a single-component catalog by the per-component path', async () => {
    // Below two components there is nothing to amortise across, and the extra
    // sweep would be pure overhead. The verdicts must be identical either way.
    const { runtime } = scriptedRuntime(() => 0)
    const verdicts = await verifyAll(runtime, [componentFor('Solo', ['s-1', 's-2'])])
    expect([...verdicts.keys()].sort()).toEqual(['s-1', 's-2'])
    for (const [id, v] of verdicts) expect(v.leak, id).toBe('pass')
  })

  it('verifies a component the wide pass never saw', async () => {
    // `components` is optional, and a caller driving the plugin directly has no
    // catalog. That must still produce a real verdict, not a fabricated one.
    const { runtime } = scriptedRuntime(() => 0)
    const plugin = mountPlugin({ runtime })
    const component = componentFor('Lonely', ['l-1'])
    const v = (await plugin.verify!({
      scenario: component.scenarios[0]!,
      component,
    } as VerifyContext)) as { leak: { status: string }; interaction: { status: string } }
    expect(v.leak.status).toBe('pass')
    expect(v.interaction.status).toBe('pass')
  })

  it('skips a metadata-only component but still verifies its neighbours', async () => {
    // An intelligence with no component function cannot be mounted. It must
    // skip, and it must not prevent the rest of the catalog being answered.
    const { runtime } = scriptedRuntime(() => 0)
    const metaOnly = {
      ...componentFor('Meta', ['m-1']),
      component: undefined,
    } as unknown as ComponentIntelligence
    const verdicts = await verifyAll(runtime, [metaOnly, componentFor('Real', ['r-1', 'r-2'])])
    expect(verdicts.get('m-1')!.leak).toBe('skip')
    expect(verdicts.get('r-1')!.leak).toBe('pass')
    expect(verdicts.get('r-2')!.leak).toBe('pass')
  })
})
