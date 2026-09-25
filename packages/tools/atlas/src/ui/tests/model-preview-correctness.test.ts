/**
 * Preview-correctness contracts of the workbench model:
 *
 *   - the APPEARANCE (mode, brand) reaches a project wrapper, per render — the
 *     dark workbench used to render every component in its light mode, and the
 *     Theme Lab tiled eight identical cards, because the wrapper got `{}`;
 *   - the Lab can tell whether a wrapper consumed `brand`, so it can SAY that
 *     brands do not apply rather than show copies;
 *   - portaled overlays are adopted into the preview surface (and the Docs
 *     block), and the model reports that one is open;
 *   - DOM interactions inside the preview reach the Actions log;
 *   - choosing a scenario keeps the user's typed content when the scenario
 *     does not vary it.
 *
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { AtlasWrapperProps } from '../../core/extension'
import type { WorkbenchCatalog, WorkbenchComponent, WorkbenchRenderCtx } from '../catalog'
import { createModel } from '../model'

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

beforeEach(() => {
  history.replaceState(null, '', '/')
  document.body.innerHTML = ''
})

/** A component whose render reports the appearance its wrapper would see. */
const appearance = (read: (w: AtlasWrapperProps) => string): WorkbenchComponent => ({
  id: 'probe',
  name: 'probe',
  group: 'G',
  controls: [],
  render: (_v, ctx) => read((ctx as WorkbenchRenderCtx).wrapperProps),
})

const out = (node: unknown): string => String((node as { children?: unknown[] }).children?.[0])

describe('appearance reaches the wrapper', () => {
  it('is the WORKBENCH mode by default, and follows it live', () => {
    const m = createModel({ components: [appearance((w) => `${w.mode!()}/${w.dark!()}`)] }, {})
    m.dark.set(true)
    expect(out(m.preview())).toBe('dark/true')
    m.dark.set(false)
    expect(out(m.preview())).toBe('light/false')
  })

  it('is the TILE appearance when a render asks for one (the Theme Lab)', () => {
    const m = createModel({ components: [appearance((w) => `${w.mode!()}:${w.brand!().id}`)] }, {})
    m.dark.set(true)
    expect(out(m.preview({ dark: false, brandId: 'forest' }))).toBe('light:forest')
    expect(out(m.preview({ brandId: 'nope' }))).toBe('dark:ember')
    expect(out(m.preview())).toBe(`dark:${m.brandId()}`)
  })

  it('records what the wrapper CONSUMED — calling, not being handed, is reading', async () => {
    const m = createModel({ components: [appearance((w) => String(w.mode!()))] }, {})
    out(m.preview())
    await flush()
    expect(m.wrapperReads()).toEqual({ mode: true, brand: false })
    // A read after the flag is set writes nothing (the false→true edge only).
    out(m.preview())
    await flush()
    expect(m.wrapperReads()).toEqual({ mode: true, brand: false })
    const m2 = createModel({ components: [appearance((w) => w.brand!().name)] }, {})
    out(m2.preview())
    out(m2.preview())
    await flush()
    expect(m2.wrapperReads()).toEqual({ mode: false, brand: true })
  })

  it('knows when a catalog is wrapped by a project provider', () => {
    expect(createModel({ components: [], wrapped: true }, {}).wrapped).toBe(true)
    expect(createModel({ components: [] }, {}).wrapped).toBe(false)
  })
})

describe('overlays are adopted into the preview', () => {
  const bracket = () => {
    document.body.append(document.createComment('portal'))
    const d = document.createElement('div')
    d.setAttribute('role', 'dialog')
    document.body.append(d, document.createComment('/portal'))
    return d
  }

  it('the canvas surface adopts a body portal and reports it open', async () => {
    const m = createModel({ components: [appearance(() => 'x')] }, {})
    const surface = document.createElement('div')
    document.body.append(surface)
    const dialog = bracket()
    m.previewRef(surface)
    expect(surface.contains(dialog)).toBe(true)
    expect(m.overlayOpen()).toBe(true)
    m.previewRef(null)
    expect(m.overlayOpen()).toBe(false)
  })

  it('the Docs block adopts too, and tracks the overlay going away', async () => {
    const m = createModel({ components: [appearance(() => 'x')] }, {})
    const block = document.createElement('div')
    document.body.append(block)
    m.overlayHostRef(block)
    expect(m.overlayOpen()).toBe(false)
    const dialog = bracket()
    await flush()
    expect(block.contains(dialog)).toBe(true)
    expect(m.overlayOpen()).toBe(true)
    block.innerHTML = ''
    await flush()
    expect(m.overlayOpen()).toBe(false)
    m.overlayHostRef(null)
    const later = bracket()
    await flush()
    expect(later.parentNode).toBe(document.body)
  })
})

describe('a Docs block without MutationObserver', () => {
  it('still adopts on attach and does not throw', () => {
    const MO = globalThis.MutationObserver
    const m = createModel({ components: [appearance(() => 'x')] }, {})
    const block = document.createElement('div')
    document.body.append(block)
    try {
      ;(globalThis as { MutationObserver?: unknown }).MutationObserver = undefined
      expect(() => m.overlayHostRef(block)).not.toThrow()
    } finally {
      globalThis.MutationObserver = MO
    }
    m.overlayHostRef(null)
  })
})

describe('DOM interactions reach the Actions log', () => {
  it('logs a click on an element the component never declared a handler for', () => {
    const m = createModel({ components: [appearance(() => 'x')] }, {})
    const surface = document.createElement('div')
    const button = document.createElement('button')
    button.textContent = 'Save'
    surface.append(button)
    document.body.append(surface)
    m.previewRef(surface)
    button.click()
    expect(m.actions()[0]).toMatchObject({ name: 'click', detail: '<button> "Save"' })
    m.previewRef(null)
    button.click()
    expect(m.actions()).toHaveLength(1)
  })
})

describe("choosing a scenario keeps the user's own words", () => {
  const button: WorkbenchComponent = {
    id: 'button',
    name: 'Button',
    group: 'G',
    controls: [
      {
        key: 'state',
        label: 'State',
        type: 'enum',
        options: ['primary', 'danger'],
        default: 'primary',
      },
      { key: 'children', label: 'Children', type: 'text', default: 'Button' },
      { key: 'title', label: 'Title', type: 'text', default: '' },
    ],
    scenarios: [
      { id: 'd', name: 'Default', verdict: 'ok', args: { state: 'primary', children: 'Button' } },
      {
        id: 'danger',
        name: 'state=danger',
        verdict: 'ok',
        args: { state: 'danger', children: 'Button' },
      },
      {
        id: 'long',
        name: 'Long content',
        verdict: 'ok',
        args: { state: 'primary', children: 'A very long label' },
      },
    ],
    render: (v) => `${String(v.state)}:${String(v.children)}`,
  }
  const cat: WorkbenchCatalog = { components: [button] }

  it('carries an edited text control through a scenario that only pins the seed', () => {
    const m = createModel(cat, {})
    m.setValue('button', 'children', 'Save changes')
    m.selectScenario('button', 'danger')
    expect(m.vals()).toMatchObject({ state: 'danger', children: 'Save changes' })
    expect(m.actions()).toHaveLength(0)
  })

  it('lets a scenario that VARIES the content win — and says so', () => {
    const m = createModel(cat, {})
    m.setValue('button', 'children', 'Save changes')
    m.selectScenario('button', 'long')
    expect(m.vals()).toMatchObject({ children: 'A very long label' })
    expect(m.actions()[0]!.detail).toContain('replaced your edit to children')
  })

  it('carries an edit the scenario does not mention at all, and ignores untouched ones', () => {
    const m = createModel(cat, {})
    m.setValue('button', 'title', 'tip')
    m.setValue('button', 'state', 'danger')
    m.selectScenario('button', 'long')
    expect(m.vals()).toMatchObject({ title: 'tip', children: 'A very long label' })
    expect(m.actions()).toHaveLength(0)
  })

  it('a fresh selection with no edits is exactly the scenario', () => {
    const m = createModel(cat, {})
    m.selectScenario('button', 'danger')
    expect(m.vals()).toMatchObject({ state: 'danger', children: 'Button' })
  })
})
