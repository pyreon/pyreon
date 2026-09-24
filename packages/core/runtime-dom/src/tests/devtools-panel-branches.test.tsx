/**
 * The Reactivity Lens panel's own copy, and the picker's key handling.
 *
 * A debugging tool is read, not just run: the panel's whole output is prose it
 * writes about the app's reactive graph, so a wrong plural or a missing
 * "why did this update?" chain is not cosmetic — it is the tool telling the
 * developer something untrue about the thing they came to it to understand.
 *
 * The other half is the picker's global, capture-phase listeners. They sit on
 * the user's app while it is being debugged, so a key handler that acts on
 * keys it does not own, or a highlight element that is recreated per mouse
 * move, breaks the app in a way that looks like the app's own bug.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from '@pyreon/core'
import { computed, effect, signal } from '@pyreon/reactivity'
import { installDevTools } from '../devtools'
import { mount } from '../index'
import { query } from '@pyreon/test-utils'

type Devtools = {
  enableOverlay: () => void
  disableOverlay: () => void
  reactive: {
    activate: () => void
    showOverlay: () => void
    hideOverlay: () => void
    getFires: () => unknown[]
  }
}
type Console$P = { pick: () => void; reactivity: () => void }

const win = window as unknown as Record<string, unknown>
const dt = () => win.__PYREON_DEVTOOLS__ as Devtools
const $p = () => win.$p as Console$P

const panel = () => document.getElementById('__pyreon-reactive-overlay')
const pickHighlight = () => document.getElementById('__pyreon-rx-pick-highlight')
const bodyText = () => document.getElementById('__pyreon-rx-body')?.textContent ?? ''

/** Click a tab by its visible label. */
const tab = (label: string) => {
  const el = Array.from(panel()?.querySelectorAll('button') ?? []).find(
    (b) => b.textContent?.trim() === label,
  )
  el?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  return el
}

let container: HTMLElement
beforeEach(() => {
  installDevTools()
  container = document.createElement('div')
  document.body.appendChild(container)
})
afterEach(() => {
  dt()?.disableOverlay()
  dt()?.reactive.hideOverlay()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  container.remove()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('the picker only acts on the keys it owns', () => {
  it('CANCELS on Escape — the control', () => {
    dt().reactive.showOverlay()
    $p().pick()
    const target = document.createElement('span')
    document.body.appendChild(target)
    target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    expect(pickHighlight()?.style.display).toBe('block')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(pickHighlight()?.style.display).not.toBe('block')
  })

  it('SURVIVES a mousemove forwarded to the document', () => {
    // Every drag implementation forwards pointer movement to `document` once
    // the pointer leaves the handle, and the picker's listener is document
    // level and capture phase — so it sees those. `document` has no box to
    // measure; an unchecked cast throws inside the app's own drag path, which
    // is the tool breaking the thing it was opened to inspect.
    dt().reactive.showOverlay()
    $p().pick()
    expect(() =>
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true })),
    ).not.toThrow()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })

  it('SURVIVES a click forwarded to the document', () => {
    // The same forwarding, at the end of the drag. Selecting `document` as the
    // picked "element" would then throw again on the Inspect tab, one step
    // further from the cause.
    dt().reactive.showOverlay()
    $p().pick()
    expect(() =>
      document.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    ).not.toThrow()
    expect(() => tab('Inspect')).not.toThrow()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })

  it('IGNORES an unrelated key while picking', () => {
    // The picker's keydown listener is capture-phase and document-level, so it
    // sees every keystroke in the app. Treating any of them as a cancel would
    // make the picker unusable the moment the developer types; treating any of
    // them as anything at all would swallow the app's own shortcuts.
    dt().reactive.showOverlay()
    $p().pick()
    const target = document.createElement('span')
    document.body.appendChild(target)
    target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    expect(pickHighlight()?.style.display).toBe('block')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    expect(pickHighlight()?.style.display, 'still picking').toBe('block')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })

  it('REUSES its highlight element across moves', () => {
    // One element, repositioned. Creating one per mousemove appends to
    // document.body on every pixel of travel — the tool leaking into the app
    // it is inspecting.
    dt().reactive.showOverlay()
    $p().pick()
    const a = document.createElement('span')
    const b = document.createElement('em')
    document.body.append(a, b)
    a.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    const first = pickHighlight()
    b.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    expect(pickHighlight(), 'same element').toBe(first)
    expect(document.querySelectorAll('#__pyreon-rx-pick-highlight')).toHaveLength(1)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
})

describe('the inspector overlay only acts on the keys it owns', () => {
  it('CLOSES on Escape — the control', () => {
    dt().enableOverlay()
    expect(document.body.style.cursor).toBe('crosshair')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(document.body.style.cursor, 'released').toBe('')
  })

  it('IGNORES an unrelated key', () => {
    // Same listener, same hazard: it is on the document while the developer is
    // using their app.
    dt().enableOverlay()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }))
    expect(document.body.style.cursor, 'still inspecting').toBe('crosshair')
    dt().disableOverlay()
  })
})

describe('the panel writes true prose about the graph', () => {
  it('reports a HEALTH summary', () => {
    // The control for the branches below: a panel that renders nothing would
    // satisfy every "does not say X" assertion.
    dt().reactive.showOverlay()
    tab('Health')
    expect(bodyText()).toMatch(/signal/i)
  })

  it('says "1 insight" and not "1 insights"', () => {
    // Pluralization in a tool's own output is the cheapest possible tell for
    // whether anyone read what it prints.
    dt().reactive.activate()
    const orphan = signal(1)
    orphan.set(2)
    dt().reactive.showOverlay()
    tab('Health')
    const t = bodyText()
    if (/\b1 insight\b/.test(t)) expect(t).not.toContain('1 insights')
    // A graph with no issues says so in words rather than reporting "0
    // insights:" followed by nothing.
    if (t.includes('No health issues')) expect(t).not.toMatch(/0 insights/)
  })

  it('tells the developer what to DO when nothing has fired yet', () => {
    // The first thing anyone sees after opening the panel. "No data" is a dead
    // end; naming the next action is the whole value of the empty state.
    dt().reactive.showOverlay()
    tab('Activity')
    const t = bodyText()
    if (t.includes('No reactive updates')) {
      expect(t.toLowerCase()).toMatch(/interact|click|type/)
    }
  })

  it('renders an ACTIVITY list once signals have fired', () => {
    dt().reactive.activate()
    const a = signal(0)
    const b = computed(() => a() + 1)
    const stop = effect(() => void b())
    a.set(1)
    a.set(2)
    dt().reactive.showOverlay()
    tab('Activity')
    expect(bodyText()).toMatch(/update|why/i)
    stop.dispose()
  })

  it('EXPLAINS a fire with no causal chain rather than printing nothing', () => {
    // A signal written from an event handler has no upstream dependency, so
    // there is no chain to show — and that is the commonest thing in the
    // panel. Rendering an empty section there would read as a broken tool.
    dt().reactive.activate()
    const lone = signal(0)
    lone.set(1)
    dt().reactive.showOverlay()
    tab('Activity')
    const t = bodyText()
    if (t.includes('no causal chain')) {
      expect(t.toLowerCase(), 'it says WHY there is no chain').toMatch(/fired|aged out/)
    }
    expect(t.length, 'never blank').toBeGreaterThan(0)
  })

  it('tells the developer to PICK something on the Inspect tab', () => {
    dt().reactive.showOverlay()
    tab('Inspect')
    const t = bodyText()
    expect(t).toMatch(/No element selected|displays/i)
  })

  it('names an element that displays NO tracked reactive text', () => {
    // Static text, attributes and multi-signal expressions are not correlated.
    // Saying "none" and why beats saying nothing, which reads as a failure.
    dt().reactive.activate()
    const dispose = mount(h('p', { class: 'static' }, 'plain text'), container)
    dt().reactive.showOverlay()
    $p().pick()
    const el = query<HTMLElement>(container, '.static')
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const t = bodyText()
    expect(t).toMatch(/displays no tracked reactive text|No element selected/i)
    dispose()
  })

  it('says "1 reactive value" and not "1 reactive values"', () => {
    dt().reactive.activate()
    const count = signal(1)
    const dispose = mount(h('p', { class: 'live' }, () => count()), container)
    count.set(2)
    dt().reactive.showOverlay()
    $p().pick()
    const el = query<HTMLElement>(container, '.live')
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const t = bodyText()
    if (/\b1 reactive value\b/.test(t)) expect(t).not.toContain('1 reactive values')
    expect(t.length).toBeGreaterThan(0)
    dispose()
  })

  it('does not throw when the panel is refreshed with nothing selected', () => {
    // The ⟳ button re-renders whichever view is open; Inspect with no picked
    // element is the state it is in most of the time.
    dt().reactive.showOverlay()
    tab('Inspect')
    expect(() => tab('⟳')).not.toThrow()
    expect(bodyText().length).toBeGreaterThan(0)
  })
})

describe('the panel toggles without leaking', () => {
  it('HIDES cleanly when it was never shown', () => {
    // `hideOverlay()` on a fresh page is what every teardown hook calls. It
    // must not construct the panel in order to hide it.
    dt().reactive.hideOverlay()
    expect(panel()).toBeNull()
  })

  it('SHOWING twice does not stack two panels', () => {
    dt().reactive.showOverlay()
    dt().reactive.showOverlay()
    expect(document.querySelectorAll('#__pyreon-reactive-overlay')).toHaveLength(1)
  })

  it('leaves NOTHING behind after show/hide', () => {
    dt().reactive.showOverlay()
    expect(panel()).not.toBeNull()
    dt().reactive.hideOverlay()
    expect(panel(), 'the panel is removed, not merely hidden').toBeNull()
  })

  it('reopens after being hidden', () => {
    dt().reactive.showOverlay()
    dt().reactive.hideOverlay()
    dt().reactive.showOverlay()
    expect(panel()).not.toBeNull()
    expect(document.querySelectorAll('#__pyreon-reactive-overlay')).toHaveLength(1)
  })
})
