/**
 * Named bindings against a REAL mounted preview.
 *
 * The model renders the selected component with LIVE values (see
 * ../live-args): a control edit updates the mounted component in place, and
 * its bindings fire. These mount `model.preview()` the way the canvas does —
 * inside a reactive child accessor — record a coverage session, edit a
 * control, and read the rows the panel renders. Before live values, every
 * edit re-mounted the component and every binding read "never fired".
 *
 * @vitest-environment happy-dom
 */
import { h, type VNodeChild } from '@pyreon/core'
import { getReactiveGraph } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { WorkbenchCatalog } from '../catalog'
import { createModel } from '../model'
import { bindingRows } from '../binding-rows'
import { createCoverageSession } from '../reactive-coverage'

/** A button that reads `label` and `loading` inside its bindings — reactively. */
function Btn(props: Record<string, unknown>): VNodeChild {
  return h('button', { 'aria-busy': () => String(props.loading === true) }, () =>
    String(props.label),
  )
}

const catalog = (render?: WorkbenchCatalog['components'][number]['render']): WorkbenchCatalog => ({
  components: [
    {
      id: 'btn',
      name: 'Btn',
      group: 'g',
      controls: [
        { key: 'label', label: 'Label', type: 'text', default: 'Save' },
        { key: 'loading', label: 'Loading', type: 'bool', default: false },
        { key: 'wide', label: 'Wide', type: 'bool', default: false },
      ],
      render: render ?? ((p) => h(Btn, p)),
    },
  ],
})

let stop: (() => void) | null = null
afterEach(() => {
  stop?.()
  stop = null
  document.body.innerHTML = ''
  history.replaceState(null, '', '/')
})

function setup(cat: WorkbenchCatalog) {
  const m = createModel(cat, {})
  const session = createCoverageSession()
  session.start()
  const el = document.createElement('div')
  document.body.appendChild(el)
  const dispose = mount(
    h('div', null, () => m.preview()),
    el,
  )
  stop = () => {
    dispose()
    session.stop()
  }
  const rows = () => bindingRows(getReactiveGraph(), m.previewScope(), cat.components[0]!.controls)
  return { m, el, rows }
}

describe('a control edit updates the preview in place', () => {
  it('lists the bindings uncovered, then covered after the control that drives one changes', () => {
    const { m, el, rows } = setup(catalog())
    const button = el.querySelector('button')!
    expect(button.textContent).toBe('Save')

    const before = rows()
    expect(before.map((r) => [r.name, r.status, r.fires])).toEqual([
      ['aria-busy ← loading', 'never', 0],
      ['text ← label', 'never', 0],
    ])
    expect(before.find((r) => r.name === 'text ← label')?.hint).toBe(
      'Change “Label” in Controls to exercise it.',
    )

    m.setValue('btn', 'label', 'Saved')
    // Same element, new text: updated, not re-mounted.
    expect(el.querySelector('button')).toBe(button)
    expect(button.textContent).toBe('Saved')

    const after = rows()
    expect(after.find((r) => r.name === 'text ← label')).toMatchObject({
      status: 'covered',
      fires: 1,
      mounts: 1,
    })
    // Only the binding that reads `label` fired: `aria-busy` reads `loading`.
    expect(after.find((r) => r.name === 'aria-busy ← loading')).toMatchObject({
      status: 'never',
      fires: 0,
    })

    m.setValue('btn', 'label', 'Saved again')
    expect(rows().find((r) => r.name === 'text ← label')?.fires).toBe(2)
  })

  it('an edit to a value equal to the last one is not an update', () => {
    const { m, rows } = setup(catalog())
    m.setValue('btn', 'label', 'Save')
    expect(rows().every((r) => r.fires === 0)).toBe(true)
  })

  it('the workbench around the preview is not reported as the component', () => {
    const { rows } = setup(catalog())
    // The wrapping <div> accessor (the canvas surface stand-in) is not a row.
    expect(rows().map((r) => r.element)).toEqual(['<button>', '<button>'])
  })
})

describe('a key the catalog render reads itself re-mounts the preview', () => {
  const branching = catalog((p) => h(p.wide ? 'section' : 'div', null, h(Btn, p)))

  it('re-mounts on that key, and the component’s own bindings of it fire first', () => {
    // Btn reads `wide` too (through `label`'s sibling binding below), so the
    // order matters: the watcher that re-mounts subscribes AFTER the mount.
    const reading = catalog((p) =>
      h(p.wide ? 'section' : 'div', null, h('i', { 'data-wide': () => String(p.wide) }), h(Btn, p)),
    )
    const { m, el, rows } = setup(reading)
    expect(el.querySelector('div > i')).not.toBeNull()
    m.setValue('btn', 'wide', true)
    expect(el.querySelector('section > i')).not.toBeNull()
    const wide = rows().find((r) => r.name === 'data-wide ← wide')
    expect(wide).toMatchObject({ status: 'covered', fires: 1, mounts: 2 })
    expect(m.previewScope().remount.has('wide')).toBe(true)
  })

  it('a binding rebuilt by such a re-mount without updating says so', () => {
    const { m, rows } = setup(branching)
    m.setValue('btn', 'wide', true)
    const text = rows().find((r) => r.name === 'text ← label')
    // Rebuilt by the `wide` re-mount, but `label` never changed: still "never".
    expect(text).toMatchObject({ status: 'never', mounts: 2 })
  })
})

describe('restartPreview', () => {
  it('clears the scope at once, and announces the next settled mount', async () => {
    const { m } = setup(catalog())
    await Promise.resolve()
    const mounts = m.previewMounts()
    const [old] = m.previewScope().mounts
    m.restartPreview()
    // The old mount is outside the new recording: never reported again.
    expect(m.previewScope().mounts).not.toContainEqual(old)
    await Promise.resolve()
    expect(m.previewMounts()).toBe(mounts + 1)
  })

  it('re-mounts with fresh values, so a recording that starts after the mount still sees the component', () => {
    const cat = catalog()
    const m = createModel(cat, {})
    const el = document.createElement('div')
    document.body.appendChild(el)
    const dispose = mount(
      h('div', null, () => m.preview()),
      el,
    )
    const session = createCoverageSession()
    session.start() // resets the graph: the mounted preview is now invisible to it
    stop = () => {
      dispose()
      session.stop()
    }
    const rows = () =>
      bindingRows(getReactiveGraph(), m.previewScope(), cat.components[0]!.controls)
    expect(rows()).toEqual([])
    const button = el.querySelector('button')
    m.restartPreview()
    expect(el.querySelector('button')).not.toBe(button)
    expect(
      rows()
        .map((r) => r.name)
        .sort(),
    ).toEqual(['aria-busy ← loading', 'text ← label'])
  })

  it('names the preview theme as a source once the provider re-mounts with it', () => {
    const m = createModel(catalog(), {})
    const cells = m.previewTheme()
    expect(m.previewTheme()).toBe(cells) // stable until a restart
    m.restartPreview()
    const next = m.previewTheme()
    expect(next).not.toBe(cells)
    const first = next.mode()
    m.dark.set(!m.dark.peek())
    expect(next.mode()).toBe(m.dark.peek() ? 'dark' : 'light')
    expect(next.mode()).not.toBe(first)
    expect(next.theme()).toBe(m.theme())
    const names = [...m.previewScope().context.values()].sort()
    // previewScope before any preview mounted: no scope yet, no context.
    expect(names).toEqual([])
  })

  it('theme: false re-mounts the component and keeps the theme provider (verify-browser)', () => {
    const { m, el } = setup(catalog())
    const cells = m.previewTheme()
    const button = el.querySelector('button')
    m.restartPreview({ theme: false })
    expect(m.previewTheme()).toBe(cells)
    expect(el.querySelector('button')).not.toBe(button)
  })

  it('reports the theme cells in the scope once the preview has mounted', () => {
    const { m } = setup(catalog())
    m.previewTheme()
    expect([...m.previewScope().context.values()].sort()).toEqual(['mode', 'theme'])
  })

  it('another component starts a fresh scope', () => {
    const cat: WorkbenchCatalog = {
      components: [
        ...catalog().components,
        { ...catalog().components[0]!, id: 'other', name: 'Other' },
      ],
    }
    const { m } = setup(cat)
    expect(m.previewScope().component).toBe('btn')
    m.selId.set('other')
    expect(m.previewScope()).toMatchObject({ component: 'other' })
    expect(m.previewScope().mounts).toHaveLength(1)
  })
})

describe('a production build', () => {
  // The reactive graph does not exist in production, so there is nothing to
  // scope — but live values must still update the preview in place, and a
  // render-time read must still re-mount it.
  it('updates in place and re-mounts on a render-time key, with an empty scope', () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const cat = catalog((p) => h(p.wide ? 'section' : 'div', null, h(Btn, p)))
      const m = createModel(cat, {})
      const el = document.createElement('div')
      document.body.appendChild(el)
      stop = mount(
        h('div', null, () => m.preview()),
        el,
      )
      const button = el.querySelector('button')!
      m.setValue('btn', 'label', 'Saved')
      expect(el.querySelector('button')).toBe(button)
      expect(button.textContent).toBe('Saved')
      m.setValue('btn', 'wide', true)
      expect(el.querySelector('section > button')).not.toBeNull()
      m.previewTheme()
      const scope = m.previewScope()
      expect(scope.mounts).toEqual([])
      expect(scope.props.size).toBe(0)
      expect(scope.context.size).toBe(0)
    } finally {
      process.env.NODE_ENV = prev
    }
  })
})
