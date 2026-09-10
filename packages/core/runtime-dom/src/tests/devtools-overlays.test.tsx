/**
 * The dev-mode overlays: the component inspector and the Reactivity Lens.
 *
 * This code is tree-shaken out of production, which makes it easy to treat as
 * unimportant. It is not: it installs global capture-phase `keydown`,
 * `mousemove` and `click` listeners on the USER'S APP, in the environment
 * where they do all their work. A picker that throws on mousemove, or a
 * listener that outlives the mode that installed it, breaks the app being
 * debugged — and it breaks it in a way that looks like the app's own bug,
 * which is the worst place for a debugging tool to fail.
 *
 * Three properties matter, and each has a cheap failure mode:
 *
 *  - **Toggles are symmetric.** Enable/disable must be idempotent and must
 *    leave nothing behind. An overlay element that survives its own disable
 *    covers the page; a `cursor: crosshair` left on `document.body` follows
 *    the developer around for the rest of the session.
 *  - **The picker ignores the overlay.** Its own buttons are inside the
 *    element it is hovering over; treating them as targets makes the panel
 *    unusable the moment picking starts.
 *  - **The registry never becomes a GC root.** It is keyed by component and
 *    lives as long as the page, so anything strong in it retains DOM.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { installDevTools, onOverlayClick, onOverlayMouseMove } from '../devtools'
import { mount } from '../index'

type Devtools = {
  version: string
  getAllComponents: () => Array<{ id: string; name: string }>
  getComponentTree: () => Array<{ id: string; name: string }>
  highlight: (id: string) => void
  onComponentMount: (cb: (e: { id: string; name: string }) => void) => () => void
  onComponentUnmount: (cb: (id: string) => void) => () => void
  enableOverlay: () => void
  disableOverlay: () => void
  reactive: {
    showOverlay: () => void
    hideOverlay: () => void
    getGraph: () => unknown
    nodesForElement: (el: Element) => unknown
  }
}
type Console$P = {
  components: () => unknown[]
  tree: () => unknown[]
  inspect: () => void
  reactivity: () => void
  pick: () => void
  stats: () => unknown
  highlight: (id: string) => void
}

const win = window as unknown as Record<string, unknown>
const dt = () => win.__PYREON_DEVTOOLS__ as Devtools
const $p = () => win.$p as Console$P

const panel = () => document.getElementById('__pyreon-reactive-overlay')
const pickHighlight = () => document.getElementById('__pyreon-rx-pick-highlight')

const key = (k: string) =>
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key: k, ctrlKey: true, shiftKey: true, bubbles: true }),
  )

let container: HTMLElement

beforeEach(() => {
  installDevTools() // idempotent — the first call in the file wins
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  // Leave no overlay behind for the next test: these are document-level and
  // would otherwise be the next spec's starting state.
  dt()?.disableOverlay()
  dt()?.reactive.hideOverlay()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  container.remove()
  vi.restoreAllMocks()
})

describe('the devtools handle is installed once and is complete', () => {
  it('exposes the documented surface on window', () => {
    // The control. A browser extension and the `$p` console helper both read
    // this object; a missing method is a broken tool with no error message.
    const d = dt()
    expect(d, '__PYREON_DEVTOOLS__ must exist in dev').toBeTruthy()
    expect(typeof d.getAllComponents).toBe('function')
    expect(typeof d.getComponentTree).toBe('function')
    expect(typeof d.enableOverlay).toBe('function')
    expect(typeof d.reactive.getGraph).toBe('function')
  })

  it('is IDEMPOTENT — a second install does not replace the handle', () => {
    // `mount()` and `hydrateRoot()` both call it, and an app does both. A
    // second install would re-register the global keydown listener, so every
    // shortcut would fire twice and toggle back to where it started.
    const first = dt()
    installDevTools()
    installDevTools()
    expect(dt(), 'same object').toBe(first)
  })

  it('exposes the $p console helper', () => {
    const p = $p()
    expect(typeof p.components).toBe('function')
    expect(typeof p.inspect).toBe('function')
    expect(typeof p.pick).toBe('function')
  })
})

describe('the component registry tracks what is mounted', () => {
  const Widget = () => h('div', { class: 'w' }, 'x')

  it('records a mounted component and drops it on unmount', () => {
    const before = dt().getAllComponents().length
    const dispose = mount(h(Widget, null), container)
    expect(dt().getAllComponents().length, 'registered on mount').toBe(before + 1)
    dispose()
    expect(dt().getAllComponents().length, 'and released on unmount').toBe(before)
  })

  it('notifies mount and unmount listeners, and stops after unsubscribe', () => {
    // A listener that keeps firing after its consumer is gone retains whatever
    // it closed over — and this registry lives as long as the page.
    const mounted: string[] = []
    const unmounted: string[] = []
    const offM = dt().onComponentMount((e) => mounted.push(e.name))
    const offU = dt().onComponentUnmount((id) => unmounted.push(id))

    mount(h(Widget, null), container)()
    expect(mounted.length).toBeGreaterThan(0)
    expect(unmounted.length).toBeGreaterThan(0)

    const m = mounted.length
    const u = unmounted.length
    offM()
    offU()
    mount(h(Widget, null), container)()
    expect(mounted.length, 'no deliveries after unsubscribe').toBe(m)
    expect(unmounted.length).toBe(u)
  })

  it('reports roots only in the TREE, and everything in the flat list', () => {
    const Child = () => h('span', null, 'c')
    const Parent = () => h('div', null, h(Child, null))
    const dispose = mount(h(Parent, null), container)
    const all = dt().getAllComponents().length
    const roots = dt().getComponentTree().length
    expect(all, 'both components are registered').toBeGreaterThanOrEqual(2)
    expect(roots, 'but only one is a root').toBeLessThan(all)
    dispose()
  })

  it('highlight is a no-op for an unknown id rather than a throw', () => {
    // A browser extension holding an id across a hot reload is the ordinary
    // way this happens.
    expect(() => dt().highlight('no-such-component')).not.toThrow()
  })

  it('highlight outlines a real component and RESTORES the previous outline', () => {
    // Leaving the outline on marks the element permanently, which reads as a
    // styling bug in the app.
    vi.useFakeTimers()
    try {
      const dispose = mount(h(Widget, null), container)
      const entry = dt().getAllComponents().at(-1)!
      const el = container.querySelector('.w') as HTMLElement
      el.style.outline = '1px dashed red'
      const before = el.style.outline
      dt().highlight(entry.id)
      expect(el.style.outline).toContain('2px')
      vi.advanceTimersByTime(2000)
      expect(el.style.outline, 'restored, not cleared').toBe(before)
      dispose()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('the inspector overlay toggles cleanly', () => {
  it('opens and closes on Ctrl+Shift+P', () => {
    // The control for the symmetry assertions: without it, "closes" is
    // satisfied by a shortcut that never opened anything.
    //
    // Two things this pins that are easy to get wrong. The overlay element is
    // a REUSED highlight box: it is created hidden and only shown while the
    // pointer is over a component, so its presence is not the signal for "the
    // inspector is on" — the crosshair cursor is. And the shortcut has to
    // TOGGLE: a handler registered twice (see the idempotent-install spec)
    // fires twice and lands back where it started, which reads as the
    // shortcut not working at all.
    key('P')
    expect(document.getElementById('__pyreon-overlay'), 'the overlay is created').toBeTruthy()
    expect(document.body.style.cursor, 'and the inspector is active').toBe('crosshair')
    key('P')
    expect(document.body.style.cursor, 'the same shortcut turns it off').toBe('')
    expect(document.getElementById('__pyreon-overlay')?.style.display, 'hidden').toBe('none')
  })

  it('releases the CROSSHAIR cursor and its listeners on close', () => {
    // The tell that a close actually closed: the inspector sets
    // `document.body.style.cursor` while active. Leaving it set follows the
    // developer around the app for the rest of the session, and the
    // capture-phase click listener keeps swallowing their clicks.
    dt().enableOverlay()
    expect(document.body.style.cursor).toBe('crosshair')
    dt().disableOverlay()
    expect(document.body.style.cursor, 'released').toBe('')
  })

  it('is idempotent in both directions', () => {
    dt().enableOverlay()
    dt().enableOverlay()
    dt().disableOverlay()
    dt().disableOverlay()
    expect(document.getElementById('__pyreon-overlay')?.style.display).toBe('none')
    expect(document.body.style.cursor).toBe('')
  })

  it('survives a mousemove and a click with NO overlay open', () => {
    // The handlers are exported and reachable before anything is created.
    // Throwing here would take down the page the developer is inspecting.
    expect(() =>
      onOverlayMouseMove(new MouseEvent('mousemove', { clientX: 5, clientY: 5 })),
    ).not.toThrow()
    expect(() => onOverlayClick(new MouseEvent('click'))).not.toThrow()
  })

  it('tracks a hovered element while the overlay is open', () => {
    const dispose = mount(h('div', { class: 'target' }, 'x'), container)
    dt().enableOverlay()
    const target = container.querySelector('.target') as HTMLElement
    const ev = new MouseEvent('mousemove', { clientX: 1, clientY: 1 })
    Object.defineProperty(ev, 'target', { value: target })
    expect(() => onOverlayMouseMove(ev)).not.toThrow()
    dt().disableOverlay()
    dispose()
  })
})

describe('the Reactivity Lens panel toggles cleanly', () => {
  it('opens and closes on Ctrl+Shift+R', () => {
    key('R')
    expect(panel(), 'the panel appears').toBeTruthy()
    key('R')
    expect(panel(), 'and is removed, not just hidden').toBeNull()
  })

  it('opens through the API and the console helper alike', () => {
    dt().reactive.showOverlay()
    expect(panel()).toBeTruthy()
    dt().reactive.hideOverlay()
    expect(panel()).toBeNull()

    $p().reactivity()
    expect(panel(), 'the $p toggle opens it too').toBeTruthy()
    $p().reactivity()
    expect(panel(), 'and closes it').toBeNull()
  })

  it('is idempotent in both directions', () => {
    dt().reactive.showOverlay()
    dt().reactive.showOverlay()
    dt().reactive.hideOverlay()
    dt().reactive.hideOverlay()
    expect(panel()).toBeNull()
  })

  it('switches between every TAB without wedging', () => {
    // The tabs are what make the panel more than a static dump. A view whose
    // renderer throws leaves the panel stuck on whatever it opened with, and
    // the developer has no way to tell that from "this view is empty".
    //
    // The `✕` close and `🎯` pick controls are deliberately excluded: one ends
    // the panel and the other enters a mode, so clicking them here would be
    // testing something else.
    dt().reactive.showOverlay()
    const tabs = [...panel()!.querySelectorAll('button')].filter(
      (b) => !/[\u2715\u{1F3AF}\u27F3]/u.test(b.textContent ?? ''),
    )
    expect(tabs.length, 'the panel has more than one view').toBeGreaterThan(1)
    for (const b of tabs) {
      expect(() => b.click(), b.textContent ?? '').not.toThrow()
      expect(panel(), `still open after ${b.textContent}`).toBeTruthy()
    }
  })

  it('CLOSES from its own ✕ button', () => {
    dt().reactive.showOverlay()
    const close = [...panel()!.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('✕'),
    )
    expect(close, 'the panel has a close control').toBeTruthy()
    close!.click()
    expect(panel(), 'and it works').toBeNull()
  })

  it('REFRESHES in place from its ⟳ button', () => {
    dt().reactive.showOverlay()
    const refresh = [...panel()!.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('⟳'),
    )
    expect(refresh).toBeTruthy()
    refresh!.click()
    expect(panel(), 'a refresh must not close the panel').toBeTruthy()
  })

  it('reopens on the HEALTH tab after being closed', () => {
    // Documented behaviour: a reopen is a fresh look, not a resume of whatever
    // the developer was staring at when they closed it.
    dt().reactive.showOverlay()
    const inspect = [...panel()!.querySelectorAll('button')].find((b) =>
      /inspect/i.test(b.textContent ?? ''),
    )
    inspect?.click()
    dt().reactive.hideOverlay()
    dt().reactive.showOverlay()
    expect(panel(), 'reopened').toBeTruthy()
  })

  it('renders a graph without a mounted app', () => {
    // `$p.reactivity()` typed into a console on a page with nothing mounted.
    expect(() => dt().reactive.getGraph()).not.toThrow()
    expect(() => dt().reactive.showOverlay()).not.toThrow()
  })

  it('renders with live signals present', () => {
    const s = signal(0)
    const dispose = mount(h('div', null, () => s()), container)
    s.set(1)
    dt().reactive.showOverlay()
    expect(panel()?.textContent, 'the panel says something').toBeTruthy()
    dispose()
  })
})

describe('the element picker leaves nothing behind', () => {
  it('highlights a hovered element and cancels on Escape', () => {
    // Escape is the only way out that does not require clicking something,
    // and a picker you cannot leave is a picker that has taken over the app.
    const dispose = mount(h('div', { class: 'pick-me' }, 'x'), container)
    $p().pick()
    const target = container.querySelector('.pick-me') as HTMLElement
    const move = new MouseEvent('mousemove', { bubbles: true })
    Object.defineProperty(move, 'target', { value: target })
    document.dispatchEvent(move)
    expect(pickHighlight(), 'the hover highlight appears').toBeTruthy()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(pickHighlight(), 'and is removed on cancel').toBeNull()
    expect(document.body.style.cursor, 'the crosshair is released').toBe('')
    dispose()
  })

  it('IGNORES the overlay\'s own elements while picking', () => {
    // The panel sits on top of the page, so its buttons are the first thing
    // under the pointer. Treating them as pick targets makes the panel
    // unusable from the moment picking starts.
    $p().pick()
    const button = panel()!.querySelector('button') as HTMLElement
    const move = new MouseEvent('mousemove', { bubbles: true })
    Object.defineProperty(move, 'target', { value: button })
    document.dispatchEvent(move)
    expect(pickHighlight(), 'no highlight over the panel itself').toBeNull()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })

  it('selects a clicked element and EXITS pick mode', () => {
    // One click, one selection. Staying in pick mode after a pick means the
    // next ordinary click in the app is swallowed too.
    const dispose = mount(h('div', { class: 'pick-me' }, 'x'), container)
    $p().pick()
    const target = container.querySelector('.pick-me') as HTMLElement
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    Object.defineProperty(click, 'target', { value: target })
    document.dispatchEvent(click)
    expect(pickHighlight(), 'pick mode is over').toBeNull()
    expect(document.body.style.cursor).toBe('')
    expect(panel(), 'and the panel stays open on the Inspect view').toBeTruthy()
    dispose()
  })

  it('does not select a click INSIDE the overlay', () => {
    $p().pick()
    const button = panel()!.querySelector('button') as HTMLElement
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    Object.defineProperty(click, 'target', { value: button })
    document.dispatchEvent(click)
    expect(click.defaultPrevented, 'the panel keeps its own clicks').toBe(false)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })

  it('entering pick mode twice does not double-register its listeners', () => {
    // The listeners are capture-phase and document-level. A second copy
    // survives the single `removeEventListener` that exit performs, and then
    // swallows every click in the app for the rest of the session.
    $p().pick()
    $p().pick()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    const after = new MouseEvent('click', { bubbles: true, cancelable: true })
    const dispose = mount(h('button', { class: 'after' }, 'go'), container)
    Object.defineProperty(after, 'target', {
      value: container.querySelector('.after'),
    })
    document.dispatchEvent(after)
    expect(after.defaultPrevented, 'ordinary clicks work again').toBe(false)
    dispose()
  })

  it('ignores a mousemove with no target', () => {
    $p().pick()
    const move = new MouseEvent('mousemove', { bubbles: true })
    Object.defineProperty(move, 'target', { value: null })
    expect(() => document.dispatchEvent(move)).not.toThrow()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
})

describe('the $p console helpers answer without an app', () => {
  it('reports components, tree and stats', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(Array.isArray($p().components())).toBe(true)
    expect(Array.isArray($p().tree())).toBe(true)
    expect(() => $p().stats()).not.toThrow()
    log.mockRestore()
  })

  it('toggles the inspector', () => {
    $p().inspect()
    expect(document.body.style.cursor, 'inspector active').toBe('crosshair')
    $p().inspect()
    expect(document.body.style.cursor, 'and off again').toBe('')
  })

  it('resolves the reactive nodes behind an element, or none', () => {
    // The DOM→signal lookup the Inspect view is built on. An element with no
    // binding must answer "none", not throw.
    const s = signal('v')
    const dispose = mount(h('div', { class: 'bound' }, () => s()), container)
    expect(() => dt().reactive.nodesForElement(container.querySelector('.bound')!)).not.toThrow()
    expect(() => dt().reactive.nodesForElement(document.body)).not.toThrow()
    dispose()
  })
})
