/**
 * `bisectLeak`'s two PASS arms — the judgement that keeps a noisy engine from
 * reading as a leaking component.
 *
 * Reached only after a batch has come back dirty TWICE: the group sweep
 * records nothing, the re-probe still climbs, and only then is it worth a
 * sweep per scenario to say which one is at fault. Both arms below are that
 * last question answered NO, and they answer it differently:
 *
 *   afterA <= floor   the scenario on its own strands nothing. The batch was
 *                     dirty because of a NEIGHBOUR, and failing here would
 *                     report a leak against a component whose only crime was
 *                     sharing a sweep.
 *   afterB <= afterA  the count grew once and stopped. That is a
 *                     FinalizationRegistry callback outliving the runway — the
 *                     same one to three nodes wherever it lands — not
 *                     per-mount retention.
 *
 * One false failure costs more trust than ten true ones earn, which is why
 * growth alone is not the verdict.
 *
 * The graphs are scripted on MOUNT COUNT, and each steps at a boundary read
 * off the observed sequence: a batch of two scenarios spends mounts 1-3 on its
 * warm-up and exercise and 4-5 on its re-probe, leaving 6 and 7 as the
 * bisect's own two probes. Scripting on mounts rather than on READS is the
 * property that matters — a read-indexed script pins the checker's exact call
 * sequence instead of its meaning, and breaks the moment the settling strategy
 * changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { mountPlugin } from '../mount'
import type { ComponentIntelligence, Scenario } from '../../core'
import type { MountRuntime } from '../../verify/harness'
import type { VerifyContext } from '../types'

const Component = () => h('button', {}, 'ok')

/** Built by hand so `args` is genuinely ABSENT at every mount site's fallback. */
const scenarioFor = (id: string): Scenario =>
  ({ id, component: 'A', name: id, source: 'authored' }) as Scenario

const oneComponent = (ids: string[]) =>
  ({
    name: 'A',
    component: Component,
    controls: [],
    axes: [],
    scenarios: ids.map(scenarioFor),
    tags: [],
  }) as unknown as ComponentIntelligence

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

const verifyAll = async (runtime: MountRuntime, component: ComponentIntelligence) => {
  const plugin = mountPlugin({ runtime })
  const out = new Map<string, { leak: string; findings: string }>()
  for (const scenario of component.scenarios) {
    const v = (await plugin.verify!({
      scenario,
      component,
      components: [component],
    } as VerifyContext)) as unknown as {
      leak: { status: string; findings?: readonly { message: string }[] }
    }
    out.set(scenario.id, {
      leak: v.leak.status,
      findings: (v.leak.findings ?? []).map((f) => f.message).join(' '),
    })
  }
  return out
}

let debugLines: string[]
let savedDebug: string | undefined
beforeEach(() => {
  savedDebug = process.env.ATLAS_DEBUG_LEAK
  debugLines = []
})
afterEach(() => {
  if (savedDebug === undefined) delete process.env.ATLAS_DEBUG_LEAK
  else process.env.ATLAS_DEBUG_LEAK = savedDebug
  vi.restoreAllMocks()
})

describe('the bisect PASSES a scenario that is not the one leaking', () => {
  it('passes on the FIRST probe when the scenario settles back to the floor', async () => {
    // The batch was dirty; this scenario on its own is not. One re-mount
    // brings the graph back at or below where the batch left it, so there is
    // nothing to accumulate and the second probe is not even needed.
    const { runtime } = scriptedRuntime((mounts) => (mounts <= 5 ? mounts * 5 : 20))
    const verdicts = await verifyAll(runtime, oneComponent(['a-1', 'a-2']))

    for (const [id, v] of verdicts) expect(v.leak, `${id}: ${v.findings}`).toBe('pass')
    expect(verdicts.get('a-1')?.findings, 'a pass carries no leak finding').toBe('')
  })

  it('passes on the SECOND probe when growth stops — the engine straggler', async () => {
    // The first probe grew past the floor, so the verdict was still open. The
    // second says the growth was one-time. Failing on the first probe alone is
    // exactly the false failure this arm exists to prevent.
    process.env.ATLAS_DEBUG_LEAK = '1'
    vi.spyOn(process.stderr, 'write').mockImplementation((c: unknown) => {
      debugLines.push(String(c))
      return true
    })

    const { runtime } = scriptedRuntime((mounts) => (mounts <= 6 ? mounts * 5 : 28))
    const verdicts = await verifyAll(runtime, oneComponent(['a-1', 'a-2']))
    vi.restoreAllMocks()

    for (const [id, v] of verdicts) expect(v.leak, `${id}: ${v.findings}`).toBe('pass')
    // The debug line is what proves WHICH arm decided it: the first probe grew
    // past the floor and the verdict is still a pass, so only the second can
    // have produced it.
    const debug = debugLines.filter((l) => l.includes('[leak-debug]')).join('')
    expect(debug, 'the bisect really ran').toContain('a-1')
    const matched = /floor=(\d+) afterA=(\d+) afterB=(\d+)/.exec(debug)
    expect(matched, 'the trajectory was reported').not.toBeNull()
    const [floor, afterA, afterB] = matched!.slice(1).map(Number) as [number, number, number]
    expect(afterA, 'the first probe grew past the floor').toBeGreaterThan(floor)
    expect(afterB, 'and the second did not grow further').toBeLessThanOrEqual(afterA)
  })

  it('still FAILS the shape where every probe adds more — the control', async () => {
    // Without this, the two passes above would be satisfied by a bisect that
    // simply never fails.
    const { runtime } = scriptedRuntime((mounts) => mounts * 5)
    const verdicts = await verifyAll(runtime, oneComponent(['a-1', 'a-2']))
    const failing = [...verdicts.values()].filter((v) => v.leak === 'fail')
    expect(failing.length, 'a real leak is named').toBeGreaterThan(0)
    expect(failing[0]!.findings).toContain('climbed')
  })
})
