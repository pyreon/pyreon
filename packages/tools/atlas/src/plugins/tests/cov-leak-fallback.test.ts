/**
 * The leak check's SLOW path — the ladder a dirty batch falls down, and the
 * two ways the bisect ends in a pass.
 *
 * The fast path answers for a whole group in one collection. When the group's
 * retention does not come back, it records NOTHING and every component falls
 * through — first to the per-component pass, then, if that is dirty too, to
 * `bisectLeak` one scenario at a time. No verdict is ever written
 * optimistically and retracted.
 *
 * `bisectLeak` is where the judgement is, and both of its PASS arms exist for
 * the same reason: a real leak ACCUMULATES, and an engine straggler — a
 * FinalizationRegistry callback that outlives the runway — does not. It is the
 * same one to three nodes wherever it lands. Growth alone is therefore not the
 * verdict, because one false failure costs more trust than ten true ones earn.
 *
 * Also here: the DOM refusal. `ensureDom` reports "no DOM" as a value, but it
 * can THROW on a runtime where the window constructor or a `defineProperty` is
 * refused — and letting that escape kills the scan on its first scenario
 * instead of skipping it. Simulating the acquisition is the only way to reach
 * that path in a runner that HAS happy-dom; it is the same seam
 * `mount.test.ts` uses.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import * as dom from '../../verify/dom'
import { mountPlugin, releaseVerifyDom } from '../mount'
import type { ComponentIntelligence, Scenario } from '../../core'
import type { MountRuntime } from '../../verify/harness'
import type { VerifyContext } from '../types'

const Component = () => h('button', {}, 'ok')

/**
 * Built WITHOUT `args`, because that is the field every mount site defaults.
 *
 * `args` is optional on a scenario, and the catalog-wide pass has its own
 * mount sites — a default applied in the per-component path and not in the
 * wide one means a scenario verifies differently depending on how many
 * components the catalog happens to hold.
 */
const scenarioFor = (id: string): Scenario =>
  ({ id, component: id.split('-')[0]!, name: id, source: 'authored' }) as Scenario

const componentFor = (name: string, ids: string[]): ComponentIntelligence =>
  ({
    name,
    component: Component,
    controls: [],
    axes: [],
    scenarios: ids.map(scenarioFor),
    tags: [],
  }) as unknown as ComponentIntelligence

/** A runtime whose graph is a scripted function of how many mounts happened. */
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

const verifyAll = async (runtime: MountRuntime, components: ComponentIntelligence[]) => {
  const plugin = mountPlugin({ runtime })
  const out = new Map<string, { leak: string; findings: string }>()
  for (const component of components) {
    for (const scenario of component.scenarios) {
      const v = (await plugin.verify!({
        scenario,
        component,
        components,
      } as VerifyContext)) as unknown as {
        leak: { status: string; findings?: readonly { message: string }[] }
      }
      out.set(scenario.id, {
        leak: v.leak.status,
        findings: (v.leak.findings ?? []).map((f) => f.message).join(' '),
      })
    }
  }
  return out
}

const catalog = () => [componentFor('A', ['a-1', 'a-2']), componentFor('B', ['b-1'])]

describe('the bisect passes a scenario whose retention settles', () => {
  it('PASSES when the very first re-probe comes back to the floor', async () => {
    // The batch went dirty, but the scenario on its own strands nothing: one
    // re-mount settles it. Failing here would report a leak against a
    // component whose only crime was sharing a sweep with a noisy neighbour.
    //
    // Scripted on MOUNT COUNT rather than on read count, so what is pinned is
    // the meaning — "retention stops growing" — rather than the checker's
    // exact call sequence, which the settling strategy is free to change.
    const settleAt = 12
    const { runtime } = scriptedRuntime((mounts) => (mounts < settleAt ? mounts * 4 : 0))
    const verdicts = await verifyAll(runtime, catalog())

    expect(verdicts.size).toBe(3)
    expect([...verdicts.values()].some((v) => v.leak === 'pass'), 'at least one settled').toBe(true)
  })

  it('PASSES a straggler — growth that stops rather than accumulating', async () => {
    // The graph jumps once and then holds flat however many more mounts
    // happen. That is a FinalizationRegistry callback outliving the runway,
    // not a per-mount leak, and the second probe is what tells them apart.
    // Without it every noisy catalog would report phantom leaks.
    const { runtime } = scriptedRuntime((mounts) => (mounts > 3 ? 7 : mounts * 2))
    const verdicts = await verifyAll(runtime, catalog())
    for (const [id, v] of verdicts) expect(v.leak, `${id}: ${v.findings}`).toBe('pass')
  })

  it('FAILS the scenario whose count keeps CLIMBING across repeated mounts', async () => {
    // The control for both passes above, and the verdict this check exists to
    // produce. The finding must carry the TRAJECTORY, not just a flag — the
    // three counts are the reasoning.
    const { runtime } = scriptedRuntime((mounts) => mounts * 5)
    const verdicts = await verifyAll(runtime, catalog())
    const failing = [...verdicts.values()].filter((v) => v.leak === 'fail')
    expect(failing.length, 'a real leak is named').toBeGreaterThan(0)
    expect(failing[0]!.findings).toContain('climbed')
    expect(failing[0]!.findings, 'and the fix travels with it').toMatch(/disposer|effect/)
  })
})

describe('when the DOM acquisition itself fails', () => {
  afterEach(() => {
    releaseVerifyDom()
  })

  it('SKIPS with the reason when ensureDom REPORTS no DOM', async () => {
    // The ordinary degradation: happy-dom is an optional peer, and a consumer
    // who never installed it must get a skip carrying the remedy — never a
    // pass, and never a crash.
    const spy = vi
      .spyOn(dom, 'ensureDom')
      .mockResolvedValue({ ok: false, reason: 'install `happy-dom`' })
    releaseVerifyDom()
    try {
      const withGraph: MountRuntime = {
        ...scriptedRuntime(() => 0).runtime,
      }
      const verdicts = await verifyAll(withGraph, catalog())
      for (const [id, v] of verdicts) expect(v.leak, id).toBe('skip')
      expect([...verdicts.values()][0]!.findings).toContain('install `happy-dom`')
    } finally {
      spy.mockRestore()
      releaseVerifyDom()
    }
  })

  it('converts a non-Error REJECTION into a reason rather than letting it escape', async () => {
    // A `throw 'x'` out of a happy-dom constructor. `String(err)` is the only
    // thing left to say, and saying nothing would leave the scan dying with a
    // stack trace on its first scenario.
    const spy = vi.spyOn(dom, 'ensureDom').mockRejectedValue('the window constructor refused')
    releaseVerifyDom()
    try {
      const { runtime } = scriptedRuntime(() => 0)
      const verdicts = await verifyAll(runtime, catalog())
      for (const [id, v] of verdicts) expect(v.leak, id).toBe('skip')
      expect([...verdicts.values()][0]!.findings).toContain('the window constructor refused')
      expect([...verdicts.values()][0]!.findings).toContain('could not create a DOM')
    } finally {
      spy.mockRestore()
      releaseVerifyDom()
    }
  })

  it('does NOT cache the rejection — a later scan gets a real DOM', async () => {
    // Caching the rejected promise would make every later call rethrow the
    // same one, so one transient failure would poison the whole process.
    const spy = vi.spyOn(dom, 'ensureDom').mockRejectedValueOnce(new Error('transient'))
    releaseVerifyDom()
    try {
      const { runtime } = scriptedRuntime(() => 0)
      const first = await verifyAll(runtime, [componentFor('A', ['a-1'])])
      expect([...first.values()][0]!.leak).toBe('skip')

      spy.mockRestore()
      const second = await verifyAll(scriptedRuntime(() => 0).runtime, [componentFor('A', ['a-2'])])
      expect([...second.values()][0]!.leak, 'recovered').toBe('pass')
    } finally {
      spy.mockRestore()
      releaseVerifyDom()
    }
  })
})

describe('ATLAS_PROFILE=1 through the FALLBACK path', () => {
  let saved: string | undefined
  beforeEach(() => {
    saved = process.env.ATLAS_PROFILE
    vi.resetModules()
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.ATLAS_PROFILE
    else process.env.ATLAS_PROFILE = saved
    vi.resetModules()
  })

  it('attributes the dirty-catalog and bisect stages, not only the happy path', async () => {
    // The stages that only run when something went wrong are exactly the ones
    // a reader profiles for: "the scan takes 40 seconds" is almost always a
    // catalog that fell out of the fast path. A breakdown that omits them
    // reports the slow half as free.
    process.env.ATLAS_PROFILE = '1'
    const fresh = await import('../mount')
    fresh.mountSteps.clear()

    const { runtime } = scriptedRuntime((mounts) => mounts * 5)
    const plugin = fresh.mountPlugin({ runtime })
    const components = catalog()
    for (const component of components) {
      for (const scenario of component.scenarios) {
        await plugin.verify!({ scenario, component, components } as VerifyContext)
      }
    }

    const keys = [...fresh.mountSteps.keys()]
    expect(keys, 'the group sweep that came back dirty').toContain('batch dirty → bisect')
    expect(keys, 'the catalog-wide sweep that gave up').toContain('catalog dirty → per-component')
    expect(keys, 'and the re-probes that decide the verdict').toContain(
      'settleGraph(batch re-probe)',
    )
    expect(keys).toContain('settleGraph(catalog re-probe)')
  })
})
