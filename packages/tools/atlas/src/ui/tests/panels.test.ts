/**
 * The panel registry — the seam that lets a pipeline plugin contribute UI.
 *
 * The pipeline plugins run under `atlas scan` in Node and must stay DOM-free,
 * so they cannot carry a renderer. This registry is the other half: a plugin
 * declares THAT it has a panel by name, and the UI package registers a renderer
 * under the same name. These tests hold that contract, because the previous
 * shape (a hand-written `<Show>` chain over a closed union) made a third-party
 * panel impossible while looking, from the outside, like it was supported.
 */
import { h } from '@pyreon/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ADDON_TABS } from '../addons'
import {
  getAddonPanel,
  getAddonPanels,
  registerAddonPanel,
  resetAddonPanels,
  unregisterAddonPanel,
} from '../panels'
// Importing the view registers + seals the built-ins (module side effect).
import '../views/AddonPanel'

const panel = (id: string) => ({
  id,
  title: id,
  hint: `${id} hint`,
  render: () => h('div', { 'data-panel': id }),
})

afterEach(() => {
  resetAddonPanels()
  vi.restoreAllMocks()
})

describe('built-ins', () => {
  it('registers the ADDON_TABS entries FIRST, in order', () => {
    // Not exact equality: `reactivity` ships with Atlas but registers THROUGH
    // the seam rather than being a built-in, which is the point — it is the
    // proof that a non-built-in panel can join the strip. The built-ins must
    // still lead, and in their declared order.
    const ids = getAddonPanels().map((p) => p.id)
    expect(ids.slice(0, ADDON_TABS.length)).toEqual(ADDON_TABS.map((t) => t.id))
  })

  it('includes the Reactivity panel, registered through the seam', () => {
    const ids = getAddonPanels().map((p) => p.id)
    expect(ids).toContain('reactivity')
    // It is NOT an ADDON_TABS entry — if it were, this would prove nothing
    // about third-party panels.
    expect(ADDON_TABS.map((t) => t.id)).not.toContain('reactivity')
  })

  it('keeps the Reactivity panel across a reset', () => {
    // The seal used to run inside `registerBuiltinPanels`, i.e. BEFORE the
    // reactivity panel registered — so a reset silently dropped the tab.
    resetAddonPanels()
    expect(getAddonPanels().map((p) => p.id)).toContain('reactivity')
  })

  it('takes each panel title and hint from ADDON_TABS, not a second copy', () => {
    for (const t of ADDON_TABS) {
      const found = getAddonPanel(t.id)
      expect(found?.title, `title for ${t.id}`).toBe(t.title)
      expect(found?.hint, `hint for ${t.id}`).toBe(t.hint)
    }
  })

  it('gives every built-in a renderer', () => {
    for (const p of getAddonPanels()) expect(typeof p.render).toBe('function')
  })
})

describe('third-party panels', () => {
  it('appends a registered panel after the built-ins', () => {
    const before = getAddonPanels().length
    registerAddonPanel(panel('atlas:reactive-coverage'))
    const ids = getAddonPanels().map((p) => p.id)
    expect(ids).toHaveLength(before + 1)
    expect(ids.at(-1)).toBe('atlas:reactive-coverage')
  })

  it('renders through the registered renderer', () => {
    registerAddonPanel(panel('custom'))
    const vnode = getAddonPanel('custom')!.render({})
    expect((vnode as { props: Record<string, unknown> }).props['data-panel']).toBe('custom')
  })

  it('unregisters, idempotently', () => {
    registerAddonPanel(panel('temp'))
    expect(unregisterAddonPanel('temp')).toBe(true)
    expect(unregisterAddonPanel('temp')).toBe(false)
    expect(getAddonPanel('temp')).toBeUndefined()
  })

  it('lets a later registration override an earlier one, but warns', () => {
    // Override is a real use (a consumer replacing a built-in panel), so it is
    // allowed — but the far likelier cause is two panels sharing a name by
    // accident, and that must not fail silently.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    registerAddonPanel(panel('dupe'))
    registerAddonPanel({ ...panel('dupe'), title: 'second' })
    expect(getAddonPanel('dupe')?.title).toBe('second')
    expect(getAddonPanels().filter((p) => p.id === 'dupe')).toHaveLength(1)
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0]?.[0])).toContain('already registered')
  })
})

describe('reset', () => {
  it('restores exactly the built-ins — the registry cannot leak between mounts', () => {
    const baseline = getAddonPanels().map((p) => p.id)
    registerAddonPanel(panel('leaky'))
    resetAddonPanels()
    expect(getAddonPanels().map((p) => p.id)).toEqual(baseline)
  })
})
