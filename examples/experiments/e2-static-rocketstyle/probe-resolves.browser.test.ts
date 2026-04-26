/**
 * Probe: identify what 22 styler.resolve calls fire during ONE Button mount.
 *
 * Intercepts `resolve()` from `@pyreon/styler` via a wrapper that counts
 * calls grouped by the first 60 characters of the template string. Tells
 * us which templates are resolved most, which suggests where redundancy
 * (or recursion depth) lives.
 */

import { h, type VNodeChild } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { resolve as origResolve } from '@pyreon/styler'
import { Button } from '@pyreon/ui-components'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { flush } from '@pyreon/test-utils/browser'
import { beforeAll, describe, expect, it } from 'vitest'

interface CountEntry {
  count: number
  sample: string
}

const counts: Map<string, CountEntry> = new Map()
let totalResolves = 0

// Monkey-patch the exported `resolve` is hard (re-export semantics).
// Workaround: depend on the shared sink. Instead we go with the next
// best thing: spy on `styler.resolve` counter increments by hooking the
// global perf counter sink. That gives total count but not per-template.
//
// For per-template, intercept by wrapping: replace the `_countSink`
// emit hook with one that ALSO captures the resolve call's template
// (passed via a side-channel from a temporary patch in resolve.ts).
//
// Simplest probe: run resolve() through a wrapper that snapshots the
// strings[0]. Done by importing `resolve` and patching the module's
// exports — but ESM modules are immutable. So: wrap via a local
// proxy + measure manually.

// Take 2: we can't easily intercept the styler.resolve calls inside
// rocketstyle without patching the source. So this test instead:
//
// - Mounts one Button
// - Reads back the perf counters to confirm the 22-resolve count
// - Inspects the styler sheet to see how many UNIQUE CSS rules ended
//   up there (a proxy for "unique compositions per Button")
//
// That's enough to say whether the 22 resolves produce 22 unique
// templates (no redundancy) or N << 22 unique (lots of redundancy).

import { install as installPerfHarness, perfHarness } from '@pyreon/perf-harness'

describe('probe — what fires 22 styler.resolve per Button mount', () => {
  beforeAll(() => {
    installPerfHarness()
    perfHarness.enable()
  })

  it('mounts one Button and reports per-mount counter breakdown', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)

    perfHarness.reset()
    const before = perfHarness.snapshot()

    const dispose = mount(
      h(
        PyreonUI,
        { theme, mode: 'light' as const },
        h(Button, { state: 'primary', size: 'large' }, 'probe'),
      ) as unknown as VNodeChild,
      root,
    )
    await flush()

    const after = perfHarness.snapshot()

    const delta: Record<string, number> = {}
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      delta[k] = (after[k] ?? 0) - (before[k] ?? 0)
    }

    // Count unique stylesheets — a proxy for "how many distinct CSS rules
    // were inserted by this single Button mount".
    const allStyles = document.querySelectorAll<HTMLStyleElement>('style')
    let totalRules = 0
    for (const s of allStyles) {
      try {
        totalRules += s.sheet?.cssRules.length ?? 0
      } catch {
        // cross-origin or detached sheet — skip
      }
    }

    // oxlint-disable-next-line no-console
    console.warn(
      `[probe] one-button mount counters: ${JSON.stringify(delta, null, 2)}\n` +
        `[probe] total CSS rules in document: ${totalRules}\n` +
        `[probe] resolves per UNIQUE rule: ${
          totalRules > 0 ? (delta['styler.resolve']! / totalRules).toFixed(2) : 'n/a'
        }`,
    )

    dispose()
    root.remove()

    // Smoke: counters fired
    expect(delta['styler.resolve']).toBeGreaterThan(0)
  })

  it('mounts a SECOND Button — same dimensions — and reports counter breakdown', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)

    perfHarness.reset()
    const before = perfHarness.snapshot()

    const dispose = mount(
      h(
        PyreonUI,
        { theme, mode: 'light' as const },
        h(Button, { state: 'primary', size: 'large' }, 'probe-2'),
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
      `[probe] SECOND-button mount counters (everything cached): ${JSON.stringify(delta, null, 2)}`,
    )

    dispose()
    root.remove()
  })

  it('mounts TWO Buttons under ONE PyreonUI — second is dimension-memo HIT (real-app shape)', async () => {
    // The previous tests each mounted their own PyreonUI provider, which
    // produces a fresh enrichedTheme reference per mount. Real apps mount
    // PyreonUI once at boot — every rocketstyle instance shares the same
    // enriched theme reference, which is the case the dimension-prop memo
    // is designed for. This test asserts that on the SECOND identical
    // mount under the same provider, the memo hits and the styler resolve
    // pipeline is skipped entirely.
    const root = document.createElement('div')
    document.body.appendChild(root)

    perfHarness.reset()
    const before = perfHarness.snapshot()

    const dispose = mount(
      h(
        PyreonUI,
        { theme, mode: 'light' as const },
        h('div', null, [
          h(Button, { state: 'primary', size: 'large' }, 'probe-shared-1'),
          h(Button, { state: 'primary', size: 'large' }, 'probe-shared-2'),
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
      `[probe] TWO-buttons-one-provider mount counters: ${JSON.stringify(delta, null, 2)}`,
    )

    // First Button: full pipeline. Second Button: dimension memo (PR #344)
    // hits → rocketstyle layer skipped → styler classCache hits → resolve
    // skipped. Element-bundle interning (this PR) catches the residual
    // styled wrappers below the rocketstyle layer too. Net total drops to
    // ~16 (down from 28 pre-element-intern, 44 pre-memo). The first Button
    // also benefits because Button internally renders multiple Elements
    // that share `$element` bundles via intern.
    expect(delta['rocketstyle.dimensionMemo.hit']).toBeGreaterThanOrEqual(1)
    expect(delta['rocketstyle.getTheme']).toBe(1) // only first Button computes fresh
    expect(delta['styler.resolve']).toBe(16) // ~22 first + 0 second + intra-Button intern savings

    dispose()
    root.remove()
  })
})

// Suppress unused-import warnings for the wrapper-attempt code above
void counts
void origResolve
void totalResolves
