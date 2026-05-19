/**
 * Real-framework integration proof.
 *
 * The extension's page-hook talks to `window.__PYREON_DEVTOOLS__`, whose
 * shape is declared locally in `../types` (the page-hook runs in the
 * inspected page's world and must not import framework code). Nothing
 * else proves that hand-declared contract still matches what
 * `@pyreon/runtime-dom` actually installs — exactly the
 * test-environment-parity risk (mock data passing while the real
 * framework path silently drifts).
 *
 * This file closes that gap two ways:
 *
 *  1. COMPILE-TIME drift lock — the framework's exported `PyreonDevtools`
 *     / `DevtoolsComponentEntry` are asserted bidirectionally assignable
 *     to the extension's local mirror. A framework add / rename / remove
 *     fails `tsc --noEmit` (run by `bun run typecheck`) instead of the
 *     extension silently missing a capability at runtime.
 *
 *  2. RUNTIME proof — a real Pyreon component tree is mounted via the
 *     real `@pyreon/runtime-dom` `mount()` (which installs the devtools
 *     hook + registers components through the genuine mount pipeline).
 *     The extension's REAL `serialize` + `buildMap` / `getRoots` run
 *     against the live `window.__PYREON_DEVTOOLS__`, proving the whole
 *     page-hook contract — tree shape, parent/child links, live
 *     mount/unmount events, highlight, and the element-picker overlay —
 *     works against the latest framework code.
 */
import { h } from '@pyreon/core'
import type {
  DevtoolsComponentEntry as FrameworkEntry,
  PyreonDevtools as FrameworkDevtools,
} from '@pyreon/runtime-dom'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { serialize } from '../serialize'
import { buildMap, getChildren, getRoots } from '../tree'
import type {
  DevtoolsComponentEntry as ExtEntry,
  PyreonDevtools as ExtDevtools,
} from '../types'

// ── 1 · Compile-time drift lock ──────────────────────────────────────
// Bidirectional assignability: an added/removed/renamed member on either
// side breaks `tsc`. These are type-only — never executed.
type _AssertExtractsFramework = ExtDevtools extends FrameworkDevtools
  ? true
  : never
type _AssertFrameworkSatisfiesExt = FrameworkDevtools extends ExtDevtools
  ? true
  : never
const _driftEntryFwToExt: ExtEntry = null as unknown as FrameworkEntry
const _driftEntryExtToFw: FrameworkEntry = null as unknown as ExtEntry
const _driftFwToExt: ExtDevtools = null as unknown as FrameworkDevtools
const _driftExtToFw: FrameworkDevtools = null as unknown as ExtDevtools
const _t1: _AssertExtractsFramework = true
const _t2: _AssertFrameworkSatisfiesExt = true
void [
  _driftEntryFwToExt,
  _driftEntryExtToFw,
  _driftFwToExt,
  _driftExtToFw,
  _t1,
  _t2,
]

// ── 2 · Runtime proof against the real framework ─────────────────────

const Leaf = () => h('span', { class: 'leaf' }, 'leaf')
const Branch = () => h('div', { class: 'branch' }, h(Leaf, null), h(Leaf, null))
const App = () => h('div', { id: 'app-root' }, h(Branch, null))

let dispose: (() => void) | null = null

afterEach(() => {
  dispose?.()
  dispose = null
  document.body.innerHTML = ''
})

function hook(): ExtDevtools {
  const dt = window.__PYREON_DEVTOOLS__
  if (!dt) throw new Error('window.__PYREON_DEVTOOLS__ was not installed by mount()')
  return dt
}

describe('framework integration — live __PYREON_DEVTOOLS__', () => {
  it('mount() installs the devtools hook and registers the component tree', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    dispose = mount(h(App, null), container)

    const dt = hook()
    expect(typeof dt.version).toBe('string')
    expect(dt.version.length).toBeGreaterThan(0)

    // The extension's REAL serialize + tree helpers over the LIVE hook.
    const entries = dt.getAllComponents().map(serialize)
    expect(entries.length).toBeGreaterThanOrEqual(4) // App, Branch, Leaf, Leaf

    const map = buildMap(entries)
    expect(map.size).toBe(entries.length)

    const roots = getRoots(entries)
    expect(roots).toHaveLength(1)
    expect(roots[0]!.name).toBe('App')

    const branch = entries.find((e) => e.name === 'Branch')
    expect(branch).toBeDefined()
    expect(branch!.parentId).toBe(roots[0]!.id)

    const leaves = entries.filter((e) => e.name === 'Leaf')
    expect(leaves).toHaveLength(2)
    for (const leaf of leaves) {
      expect(leaf.parentId).toBe(branch!.id)
    }

    // Regression lock: the framework registers components POST-ORDER,
    // so the raw `childIds` arrays are empty when children register
    // first. The extension must NOT trust `childIds` — it rebuilds the
    // tree from `parentId` via `getChildren`. This is the exact bug the
    // integration test caught; assert the extension's reconstruction is
    // correct against the real framework registration order.
    const children = getChildren(entries)
    expect(children.get(roots[0]!.id)?.map((c) => c.name)).toEqual(['Branch'])
    expect(children.get(branch!.id)?.map((c) => c.id)).toEqual(
      leaves.map((l) => l.id),
    )
    expect(children.has(leaves[0]!.id)).toBe(false) // leaves have no children
  })

  it('getComponentTree() returns the roots the extension would render', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    dispose = mount(h(App, null), container)

    const tree = hook().getComponentTree()
    expect(tree).toHaveLength(1)
    expect(tree[0]!.name).toBe('App')
    expect(tree[0]!.parentId).toBeNull()
  })

  it('onComponentMount / onComponentUnmount fire on the real lifecycle', () => {
    const mounted: string[] = []
    const unmounted: string[] = []

    const container = document.createElement('div')
    document.body.appendChild(container)
    // Mount a trivial tree first so the hook is installed before we subscribe.
    const seed = mount(h(Leaf, null), container)
    const dt = hook()
    const offMount = dt.onComponentMount((e) => mounted.push(e.name))
    const offUnmount = dt.onComponentUnmount((id) => unmounted.push(id))

    const c2 = document.createElement('div')
    document.body.appendChild(c2)
    const dispose2 = mount(h(App, null), c2)
    expect(mounted).toContain('App')
    expect(mounted).toContain('Branch')
    expect(mounted).toContain('Leaf')

    dispose2()
    expect(unmounted.length).toBeGreaterThan(0)

    offMount()
    offUnmount()
    seed()
  })

  it('highlight(id) is callable against a live registered component', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    dispose = mount(h(App, null), container)

    const dt = hook()
    const appEntry = dt.getAllComponents().find((e) => e.name === 'App')
    expect(appEntry).toBeDefined()
    expect(() => dt.highlight(appEntry!.id)).not.toThrow()
    expect(() => dt.highlight('does-not-exist')).not.toThrow()
  })

  it('the element-picker overlay (enable/disable) drives real page DOM', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    dispose = mount(h(App, null), container)

    const dt = hook()
    expect(document.getElementById('__pyreon-overlay')).toBeNull()

    dt.enableOverlay()
    const overlay = document.getElementById('__pyreon-overlay')
    expect(overlay).not.toBeNull()
    expect(document.body.style.cursor).toBe('crosshair')

    dt.disableOverlay()
    expect(document.body.style.cursor).toBe('')
    expect((overlay as HTMLElement).style.display).toBe('none')
  })

  it('page-hook routes panel messages to the real framework hook', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    dispose = mount(h(App, null), container)

    // The hook is now installed, so importing page-hook detects it
    // synchronously (no polling interval is scheduled). page-hook
    // captures the live `window.__PYREON_DEVTOOLS__` object reference and
    // looks up its methods at call time, so spying on the live object
    // after setup intercepts the real routing path. Asserting the
    // routing (page-hook's actual responsibility) — rather than the
    // framework's overlay DOM, already proven above — keeps this test
    // independent of the framework's overlay module-singleton.
    const dt = hook()
    const enableSpy = vi.spyOn(dt, 'enableOverlay')
    const disableSpy = vi.spyOn(dt, 'disableOverlay')
    const highlightSpy = vi.spyOn(dt, 'highlight')

    const { createContentWire } = await import('../messages')
    await import('../page-hook')

    const send = (payload: Parameters<typeof createContentWire>[0]) =>
      window.dispatchEvent(
        new MessageEvent('message', {
          data: createContentWire(payload),
          source: window,
        }),
      )

    send({ type: 'toggle-overlay', enabled: true })
    expect(enableSpy).toHaveBeenCalledTimes(1)

    send({ type: 'toggle-overlay', enabled: false })
    expect(disableSpy).toHaveBeenCalledTimes(1)

    send({ type: 'highlight', id: 'some-id' })
    expect(highlightSpy).toHaveBeenCalledWith('some-id')

    enableSpy.mockRestore()
    disableSpy.mockRestore()
    highlightSpy.mockRestore()
  })
})
