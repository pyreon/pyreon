// Regression: event delegation must not double-invoke a handler when delegation
// roots are NESTED. Islands hydrate via `hydrateRoot(islandMarker)`, which
// installs a second delegation root INSIDE the app's mount root — a click on
// the island's button is then walked by BOTH roots' listeners. Before the
// cross-root dedup (delegate.ts), the handler fired once per overlapping root:
// the "+2 per click" islands double-fire bug reported against v0.35.0.
//
// Bisect-verify: remove the `DELEGATED_ELEMENTS` dedup → the nested-root specs
// fail with `expected 2 to be 1`.
import { afterEach, describe, expect, it } from 'vitest'
import { setupDelegation } from '../delegate'

function mkBtn(onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  ;(btn as unknown as Record<string, unknown>).__ev_click = onClick
  return btn
}
const fire = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }))

afterEach(() => {
  document.body.innerHTML = ''
})

describe('event delegation — nested roots', () => {
  it('a single delegation root still fires a handler exactly once', () => {
    const app = document.createElement('div')
    document.body.appendChild(app)
    setupDelegation(app)
    let n = 0
    const btn = mkBtn(() => n++)
    app.appendChild(btn)
    fire(btn)
    expect(n).toBe(1)
  })

  it('TWO nested delegation roots fire a handler exactly once (islands +2 bug)', () => {
    const app = document.createElement('div')
    document.body.appendChild(app)
    setupDelegation(app) // app mount root (zero startClient)
    const island = document.createElement('pyreon-island')
    app.appendChild(island)
    setupDelegation(island) // island hydrateRoot — nested inside the app root
    let n = 0
    const btn = mkBtn(() => n++)
    island.appendChild(btn)
    fire(btn)
    expect(n).toBe(1)
  })

  it('THREE nested roots still fire exactly once', () => {
    const app = document.createElement('div')
    document.body.appendChild(app)
    setupDelegation(app)
    const mid = document.createElement('section')
    app.appendChild(mid)
    setupDelegation(mid)
    const island = document.createElement('pyreon-island')
    mid.appendChild(island)
    setupDelegation(island)
    let n = 0
    const btn = mkBtn(() => n++)
    island.appendChild(btn)
    fire(btn)
    expect(n).toBe(1)
  })

  it('distinct child+ancestor handlers BOTH fire once across nested roots', () => {
    const app = document.createElement('div')
    document.body.appendChild(app)
    setupDelegation(app)
    const island = document.createElement('pyreon-island')
    app.appendChild(island)
    setupDelegation(island)
    let parent = 0
    const wrap = document.createElement('div')
    ;(wrap as unknown as Record<string, unknown>).__ev_click = () => parent++
    let child = 0
    const btn = mkBtn(() => child++)
    wrap.appendChild(btn)
    island.appendChild(wrap)
    fire(btn)
    expect(child).toBe(1)
    expect(parent).toBe(1)
  })

  it('stopPropagation in a nested-root handler still halts ancestor handlers', () => {
    const app = document.createElement('div')
    document.body.appendChild(app)
    setupDelegation(app)
    const island = document.createElement('pyreon-island')
    app.appendChild(island)
    setupDelegation(island)
    let parent = 0
    const wrap = document.createElement('div')
    ;(wrap as unknown as Record<string, unknown>).__ev_click = () => parent++
    let child = 0
    const btn = mkBtn(() => { child++; /* stopPropagation */ })
    ;(btn as unknown as Record<string, unknown>).__ev_click = (e: Event) => {
      child++
      e.stopPropagation()
    }
    wrap.appendChild(btn)
    island.appendChild(wrap)
    fire(btn)
    expect(child).toBe(1)
    expect(parent).toBe(0) // ancestor suppressed
  })
})
