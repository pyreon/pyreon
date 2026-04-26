/**
 * Probe: identify the residual ~6 styler.resolve calls per Button mount that
 * remain after PR #344's dimension-prop memo. The memo cuts 22 → 6 by making
 * the rocketstyle accessors return stable identities, which lets the styler's
 * `classCache` (keyed on `($rocketstyle, $rocketstate)` identity) hit and
 * skip the resolve pipeline. The remaining 6 fire from styled wrappers that
 * are NOT rocketstyle-shaped — Element's `Wrapper/styled.ts` and friends.
 *
 * This probe mounts Element + Text directly (no rocketstyle) to isolate
 * which non-rocketstyle styled instances fire and how many resolves each
 * costs. The output drives whether the next perf PR generalizes the
 * styler's classCache to cover non-rocketstyle styled instances or adds
 * a similar memo at the Element/Wrapper layer.
 */

import { h, type VNodeChild } from '@pyreon/core'
import { Element, Text } from '@pyreon/elements'
import { mount } from '@pyreon/runtime-dom'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { flush } from '@pyreon/test-utils/browser'
import { beforeAll, describe, it } from 'vitest'

import { install as installPerfHarness, perfHarness } from '@pyreon/perf-harness'

describe('probe — residual styler.resolve from non-rocketstyle styled wrappers', () => {
  beforeAll(() => {
    installPerfHarness()
    perfHarness.enable()
  })

  it('mounts ONE Element under PyreonUI — counter dump', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)

    perfHarness.reset()
    const before = perfHarness.snapshot()

    const dispose = mount(
      h(
        PyreonUI,
        { theme, mode: 'light' as const },
        h(Element, { tag: 'div' }, 'one'),
      ) as unknown as VNodeChild,
      root,
    )
    await flush()

    const after = perfHarness.snapshot()
    const delta: Record<string, number> = {}
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      delta[k] = (after[k] ?? 0) - (before[k] ?? 0)
    }

    // oxlint-disable-next-line no-console
    console.warn(`[probe-el] ONE Element mount: ${JSON.stringify(delta, null, 2)}`)

    dispose()
    root.remove()
  })

  it('mounts TWO Elements under ONE PyreonUI — second is the residual probe', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)

    perfHarness.reset()
    const before = perfHarness.snapshot()

    const dispose = mount(
      h(
        PyreonUI,
        { theme, mode: 'light' as const },
        h('div', null, [
          h(Element, { tag: 'div' }, 'one'),
          h(Element, { tag: 'div' }, 'two'),
        ]),
      ) as unknown as VNodeChild,
      root,
    )
    await flush()

    const after = perfHarness.snapshot()
    const delta: Record<string, number> = {}
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      delta[k] = (after[k] ?? 0) - (before[k] ?? 0)
    }

    // oxlint-disable-next-line no-console
    console.warn(
      `[probe-el] TWO Elements (same shape) mount: ${JSON.stringify(delta, null, 2)}`,
    )

    dispose()
    root.remove()
  })

  it('mounts TWO Texts (just the Text path)', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)

    perfHarness.reset()
    const before = perfHarness.snapshot()

    const dispose = mount(
      h(
        PyreonUI,
        { theme, mode: 'light' as const },
        h('div', null, [
          h(Text, null, 'one'),
          h(Text, null, 'two'),
        ]),
      ) as unknown as VNodeChild,
      root,
    )
    await flush()

    const after = perfHarness.snapshot()
    const delta: Record<string, number> = {}
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      delta[k] = (after[k] ?? 0) - (before[k] ?? 0)
    }

    // oxlint-disable-next-line no-console
    console.warn(
      `[probe-el] TWO Texts mount: ${JSON.stringify(delta, null, 2)}`,
    )

    dispose()
    root.remove()
  })
})
