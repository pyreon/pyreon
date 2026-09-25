/**
 * Overlays a previewed component PORTALS to `document.body` are adopted into
 * the preview host, so a modal renders on the canvas rather than over the
 * whole workbench (a fixed layer that swallowed the sidebar's clicks and
 * rendered in the browser's default font).
 *
 * @vitest-environment happy-dom
 */
import { h, Portal } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { _adoptHostCount, adoptBodyPortals, adoptInto } from '../portal-adopt'

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

const bracket = (body: HTMLElement, inner: string) => {
  body.append(document.createComment('portal'))
  const el = document.createElement('div')
  el.setAttribute('role', 'dialog')
  el.textContent = inner
  body.append(el)
  body.append(document.createComment('/portal'))
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('adoptInto', () => {
  it('moves a whole body-level bracket into the host, markers included', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const dialog = bracket(document.body, 'hi')
    expect(adoptInto(host, document.body)).toBe(1)
    expect(host.contains(dialog)).toBe(true)
    const nodes = [...host.childNodes].map((n) =>
      n.nodeType === 8 ? `<!--${(n as Comment).data}-->` : (n as Element).tagName,
    )
    expect(nodes).toEqual(['<!--portal-->', 'DIV', '<!--/portal-->'])
    expect([...document.body.childNodes].some((n) => n.nodeType === 8)).toBe(false)
  })

  it('moves several brackets and closes each at ITS own marker', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const a = bracket(document.body, 'a')
    const b = bracket(document.body, 'b')
    expect(adoptInto(host, document.body)).toBe(2)
    expect(host.contains(a) && host.contains(b)).toBe(true)
  })

  it('leaves an element-wrapped portal (a tooltip positioned from viewport coords) alone', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const wrapper = document.createElement('div')
    wrapper.append(
      document.createComment('portal'),
      document.createElement('span'),
      document.createComment('/portal'),
    )
    document.body.append(wrapper)
    expect(adoptInto(host, document.body)).toBe(0)
    expect(wrapper.parentNode).toBe(document.body)
  })

  it('moves a bracket that CONTAINS a bracket as one unit', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const inner = document.createElement('p')
    document.body.append(
      document.createComment('portal'),
      document.createComment('portal'),
      inner,
      document.createComment('/portal'),
      document.createComment('/portal'),
    )
    expect(adoptInto(host, document.body)).toBe(1)
    expect(host.childNodes).toHaveLength(5)
    expect(host.contains(inner)).toBe(true)
  })

  it('leaves an unclosed bracket where it is', () => {
    const host = document.createElement('div')
    document.body.append(host, document.createComment('portal'), document.createElement('p'))
    expect(adoptInto(host, document.body)).toBe(0)
  })

  it('keeps focus on an element that had it — a dialog stays keyboard-operable', () => {
    const host = document.createElement('div')
    document.body.append(host)
    document.body.append(document.createComment('portal'))
    const button = document.createElement('button')
    document.body.append(button, document.createComment('/portal'))
    button.focus()
    expect(document.activeElement).toBe(button)
    adoptInto(host, document.body)
    expect(host.contains(button)).toBe(true)
    expect(document.activeElement).toBe(button)
  })
})

describe('adoptBodyPortals', () => {
  it('adopts a portal already on the body AND one mounted later, then stops on dispose', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const early = bracket(document.body, 'early')
    const stop = adoptBodyPortals(host)
    expect(host.contains(early)).toBe(true)
    const late = bracket(document.body, 'late')
    await flush()
    expect(host.contains(late)).toBe(true)
    stop()
    expect(_adoptHostCount()).toBe(0)
    const after = bracket(document.body, 'after')
    await flush()
    expect(after.parentNode).toBe(document.body)
  })

  it('catches up once a host attached while DETACHED lands in the document', async () => {
    // A `ref` fires while the preview surface is still in a detached fragment,
    // and the surface lands DEEP in the tree — no body-level mutation announces
    // it, so only the scheduled catch-up sweep can adopt the dialog.
    const app = document.createElement('div')
    document.body.append(app)
    const host = document.createElement('div')
    const dialog = bracket(document.body, 'x')
    const stop = adoptBodyPortals(host)
    expect(host.contains(dialog)).toBe(false)
    app.append(host)
    await flush()
    expect(host.contains(dialog)).toBe(true)
    stop()
  })

  it('adopts into the NEWEST host, and removes a host by identity (out of order)', async () => {
    const a = document.createElement('div')
    const b = document.createElement('div')
    document.body.append(a, b)
    const stopA = adoptBodyPortals(a)
    const stopB = adoptBodyPortals(b)
    expect(_adoptHostCount()).toBe(2)
    // Detach A FIRST — a position-based pop would have dropped B's frame.
    stopA()
    const d = bracket(document.body, 'd')
    await flush()
    expect(b.contains(d)).toBe(true)
    stopB()
    expect(_adoptHostCount()).toBe(0)
    // A disposer is idempotent — a second call must not remove anyone else.
    stopB()
    expect(_adoptHostCount()).toBe(0)
  })

  it('an adopted REAL Portal is still torn down by the runtime — no stranded dialog', async () => {
    const host = document.createElement('div')
    const root = document.createElement('div')
    document.body.append(host, root)
    const stop = adoptBodyPortals(host)
    const dispose = mount(
      h(Portal, { target: document.body, children: h('div', { role: 'dialog' }, 'Modal body') }),
      root,
    )
    await flush()
    expect(host.querySelector('[role="dialog"]')?.textContent).toBe('Modal body')
    dispose()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect([...host.childNodes].some((n) => n.nodeType === 8)).toBe(false)
    stop()
  })
})
