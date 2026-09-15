/**
 * The model under SSR — no DOM, no `location`, no `history`.
 *
 * The workbench renders on the server too (`atlas build` prerenders every
 * component page), and every URL-touching path in the model is guarded for it.
 * A guard nothing ever runs is a guard nobody knows is wrong, so this file is
 * the one that actually takes those arms: `isClient` false, and the
 * `location`/`history` pair absent.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import type { WorkbenchCatalog, WorkbenchComponent } from '../catalog'
import { createModel } from '../model'

const comp = (id: string): WorkbenchComponent => ({
  id,
  name: id,
  group: 'G',
  controls: [{ key: 'label', label: 'Label', type: 'text', default: id }],
  render: (props) => `${id}:${String(props.label ?? '')}`,
})

const CATALOG: WorkbenchCatalog = { components: [comp('button'), comp('badge')] }

describe('the environment this file asserts against', () => {
  it('really has no DOM — otherwise every case below is vacuous', () => {
    expect(typeof document).toBe('undefined')
    expect(typeof history).toBe('undefined')
  })
})

describe('createModel with no DOM', () => {
  it('builds without reading a URL, and starts on the first component', () => {
    const m = createModel(CATALOG, { title: 't' })
    expect(m.selId()).toBe('button')
    expect(m.vals()).toEqual({ label: 'button' })
    expect(m.title).toBe('t')
  })

  it('uses the shipped defaults rather than restoring link state it cannot read', () => {
    const m = createModel(CATALOG, {})
    expect(m.brandId()).toBe('ember')
    expect(m.dark()).toBe(true)
    expect(m.addon()).toBe('controls')
  })

  it('keeps the query-string behaviour — a path cannot be read with no location', () => {
    ;(globalThis as { __ATLAS_ROUTES__?: boolean }).__ATLAS_ROUTES__ = true
    try {
      expect(createModel(CATALOG, {}).selId()).toBe('button')
    } finally {
      delete (globalThis as { __ATLAS_ROUTES__?: boolean }).__ATLAS_ROUTES__
    }
  })

  it('a state change does not throw where there is nothing to write it to', () => {
    const m = createModel(CATALOG, {})
    expect(() => {
      m.selId.set('badge')
      m.setValue('badge', 'label', 'Edited')
      m.dark.set(false)
    }).not.toThrow()
    expect(m.vals()).toEqual({ label: 'Edited' })
  })

  it('renders a preview server-side', () => {
    const m = createModel(CATALOG, {})
    expect(m.preview()).not.toBeNull()
  })

  it('reports a11y as UNKNOWN, never as passing, with nothing rendered to inspect', () => {
    const report = createModel(CATALOG, {}).a11y()
    expect(report.unknowns).toBeGreaterThan(0)
    expect(report.passes).toBe(0)
  })
})

describe('runPlay with no requestAnimationFrame', () => {
  it('falls back to a timer and bails without a preview element, rather than throwing', async () => {
    // The frame wait exists so the canvas has re-rendered before a script
    // queries it. Server-side there is neither a frame nor an element, and the
    // script must simply not run — not crash the render.
    let ran = false
    const catalog: WorkbenchCatalog = {
      components: [
        {
          ...comp('button'),
          scenarios: [
            {
              id: 'sc',
              name: 'Scenario',
              args: { label: 'From scenario' },
              verdict: 'ok' as const,
              play: async () => {
                ran = true
              },
            },
          ],
        },
      ],
    }
    const m = createModel(catalog, {})
    await expect(m.runPlay('button', 'sc')).resolves.toBeUndefined()
    expect(ran).toBe(false)
    // It DID apply the scenario's args first — selection is not conditional on
    // a DOM being there.
    expect(m.vals()).toEqual({ label: 'From scenario' })
  })
})
