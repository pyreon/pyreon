/**
 * `sealAddonPanels` is idempotent — the guard that keeps `resetAddonPanels`
 * resettable.
 *
 * Isolated in its own file because the registry is module-level: sealing a
 * consumer's panel into the baseline is exactly the state this test creates, and
 * it must not bleed into the sibling suite.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import {
  getAddonPanels,
  registerAddonPanel,
  resetAddonPanels,
  sealAddonPanels,
  unregisterAddonPanel,
} from '../panels'
// Registers AND seals the built-ins (module side effect) — the UI's own call.
import '../views/panels/AddonPanel'

describe('sealAddonPanels — called a second time', () => {
  it('does NOT re-bake the baseline, so a consumer panel stays resettable', () => {
    const before = getAddonPanels().map((p) => p.id)
    registerAddonPanel({ id: 'cov-seal-probe', title: 'P', hint: '', render: () => h('div', {}) })
    expect(getAddonPanels().map((p) => p.id)).toContain('cov-seal-probe')

    // The second seal is the arm under test. If it took, the probe panel would
    // become part of the baseline and `resetAddonPanels` could never remove it.
    sealAddonPanels()
    resetAddonPanels()

    expect(getAddonPanels().map((p) => p.id)).toEqual(before)
    expect(getAddonPanels().map((p) => p.id)).not.toContain('cov-seal-probe')
  })

  it('the baseline it restores is non-empty — a no-op seal must not mean no built-ins', () => {
    resetAddonPanels()
    expect(getAddonPanels().length).toBeGreaterThan(0)
  })

  it('unregister removes a consumer panel without touching the baseline', () => {
    const before = getAddonPanels().map((p) => p.id)
    registerAddonPanel({ id: 'cov-seal-probe-2', title: 'P', hint: '', render: () => h('div', {}) })
    unregisterAddonPanel('cov-seal-probe-2')
    expect(getAddonPanels().map((p) => p.id)).toEqual(before)
  })
})
