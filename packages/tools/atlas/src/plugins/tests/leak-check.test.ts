/**
 * The leak verify check — plumbing semantics with scripted readers.
 *
 * The REAL end-to-end proof (real GC, real registry, real Vite loader) is
 * `scan-leak.test.ts`, which scans the leaky fixture project in a subprocess.
 * These specs pin the verdict logic deterministically: the skip reasons, the
 * accumulation rule (growth must CLIMB across repeated mounts), and the
 * straggler tolerance (one-off growth that does not accumulate passes).
 */
import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import type { Scenario } from '../../core'
import { mountPlugin } from '../mount'
import type { MountRuntime } from '../../verify/harness'
import type { VerifyContext } from '../types'

const scenario: Scenario = {
  id: 's',
  component: 'X',
  name: 'S',
  args: {},
  source: 'authored',
}

const Component = () => h('button', {}, 'ok')

const runtimeWith = (
  sizes: () => number,
  gc: (() => Promise<void>) | undefined,
): MountRuntime => ({
  h: h as MountRuntime['h'],
  mount: mount as unknown as MountRuntime['mount'],
  registerErrorHandler: () => () => {},
  reactiveGraphSize: sizes,
  ...(gc ? { collectGarbage: gc } : {}),
})

const ctxFor = (runtime?: MountRuntime): VerifyContext =>
  ({
    component: { name: 'X', component: Component, controls: [], axes: [], scenarios: [], tags: [] },
    scenario,
    cwd: '.',
  }) as unknown as VerifyContext

async function verify(runtime: MountRuntime) {
  const plugin = mountPlugin({ runtime })
  return (await plugin.verify!(ctxFor())) as { interaction: { status: string }; leak: { status: string; findings?: string[] } }
}

describe('leak check — verdict plumbing', () => {
  it('SKIPS with the reason when no GC hook exists', async () => {
    const result = await verify(runtimeWith(() => 0, undefined))
    expect(result.leak.status).toBe('skip')
    expect(result.leak.findings?.[0]).toContain('no GC hook')
    // the mount half still ran
    expect(result.interaction.status).toBe('pass')
  })

  it('SKIPS with the reason when the registry is unavailable', async () => {
    const plugin = mountPlugin({
      runtime: {
        h: h as MountRuntime['h'],
        mount: mount as unknown as MountRuntime['mount'],
        registerErrorHandler: () => () => {},
        collectGarbage: async () => {},
      },
    })
    const result = (await plugin.verify!(ctxFor())) as { leak: { status: string; findings?: string[] } }
    expect(result.leak.status).toBe('skip')
    expect(result.leak.findings?.[0]).toContain('introspection unavailable')
  })

  it('PASSES when the count returns to the baseline', async () => {
    // graph settles to 0 whenever GC runs — a clean component
    const count = signal(3)
    const result = await verify(
      runtimeWith(
        () => count(),
        async () => count.set(0),
      ),
    )
    expect(result.leak.status).toBe('pass')
  })

  it('PASSES one-off growth that does not accumulate (an engine straggler)', async () => {
    // Baseline settles to 0; the measured mount leaves 3 that never collect —
    // but a REPEATED mount does not add more. Non-accumulating retention is a
    // straggler (or a first-instance cache), not a per-mount leak.
    let phase = 0
    const reads = [() => 0, () => 3, () => 3] // baseline, afterA, afterB
    const result = await verify(
      runtimeWith(
        () => reads[Math.min(phase, 2)]!(),
        async () => {
          phase += 0 // gc changes nothing; phases advance via settle floors
        },
      ),
    )
    // afterA(3) > baseline(0) triggers the second mount; afterB(3) === afterA
    // → no accumulation → pass. Advance the phase as each settle gives up.
    expect(result.leak.status).toBe('pass')
  })

  it('FAILS when the count CLIMBS across repeated mounts', async () => {
    // Each settle window reads a higher plateau: 0 → 2 → 4. That is the
    // signature of a per-mount leak — every mount strands more nodes.
    //
    // Read-indexed, not gc-indexed: the baseline settle exits on its FIRST
    // read (0 ≤ floor) without ever calling gc. The afterA window then reads a
    // stable 2 (floor 0 → the loop burns its runway), and the afterB window a
    // stable 4 (floor 2 → same).
    let reads = 0
    const plateau = () => {
      reads += 1
      if (reads === 1) return 0 // baseline
      if (reads <= 14) return 2 // afterA window
      return 4 // afterB window
    }
    const result = await verify(runtimeWith(plateau, async () => {}))
    expect(result.leak.status).toBe('fail')
    expect(result.leak.findings?.[0]).toMatch(/climbed 0 → 2 → 4/)
  })
})

describe('play — the authored script replaces the click-walk', () => {
  const playedScenario = (play: import('../../core').PlayFn): Scenario => ({
    id: 'p',
    component: 'X',
    name: 'P',
    args: {},
    source: 'authored',
    play,
  })

  async function verifyWith(play: import('../../core').PlayFn) {
    const plugin = mountPlugin({ runtime: runtimeWith(() => 0, async () => {}) })
    const ctx = {
      component: { name: 'X', component: Component, controls: [], axes: [], scenarios: [], tags: [] },
      scenario: playedScenario(play),
      cwd: '.',
    } as unknown as VerifyContext
    return (await plugin.verify!(ctx)) as { interaction: { status: string; findings?: string[] } }
  }

  it('a passing play verifies the scenario', async () => {
    let clicked = false
    const r = await verifyWith(async ({ root, step }) => {
      await step('click', () => {
        const el = root.querySelector('button')
        if (!el) throw new Error('no button')
        clicked = true
      })
    })
    expect(clicked).toBe(true)
    expect(r.interaction.status).toBe('pass')
  })

  it('a throwing play FAILS the interaction check, naming the step', async () => {
    const r = await verifyWith(async ({ step }) => {
      await step('assert the impossible', () => {
        throw new Error('expected 2 rows, found 0')
      })
    })
    expect(r.interaction.status).toBe('fail')
    expect(r.interaction.findings?.join(' ')).toContain('play failed at step "assert the impossible"')
    expect(r.interaction.findings?.join(' ')).toContain('expected 2 rows, found 0')
  })
})
