import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '../index'

describe('reactive style object — stale keys are removed', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('removes a property that disappears from a reactive style object', () => {
    const style = signal<Record<string, string>>({ color: 'red', fontSize: '14px' })

    mount(h('div', { style: () => style() }), container)

    const el = container.querySelector('div') as HTMLDivElement
    expect(el.style.color).toBe('red')
    expect(el.style.fontSize).toBe('14px')

    // Drop fontSize — previous behavior left it on the element.
    style.set({ color: 'red' })

    expect(el.style.color).toBe('red')
    expect(el.style.fontSize).toBe('')
  })

  it('clears all object-mode keys when reactive style becomes null', () => {
    const style = signal<Record<string, string> | null>({ color: 'blue', padding: '10px' })

    mount(h('div', { style: () => style() }), container)

    const el = container.querySelector('div') as HTMLDivElement
    expect(el.style.color).toBe('blue')
    expect(el.style.padding).toBe('10px')

    style.set(null)

    expect(el.style.color).toBe('')
    expect(el.style.padding).toBe('')
  })

  it('handles object → string → object transitions without leaking keys', () => {
    const style = signal<string | Record<string, string>>({ color: 'red' })

    mount(h('div', { style: () => style() }), container)

    const el = container.querySelector('div') as HTMLDivElement
    expect(el.style.color).toBe('red')

    // Swap to string form — cssText replaces everything.
    style.set('background: yellow;')
    expect(el.style.color).toBe('')
    expect(el.style.background).toContain('yellow')

    // Swap back to object form. The previous object-mode tracking was
    // reset by the string assignment, so we start fresh and must not
    // carry forward stale keys from the initial object.
    style.set({ margin: '5px' })
    expect(el.style.margin).toBe('5px')
    // Previously-set `background` from the string form stays put because
    // cssText can't round-trip through key-level tracking — this is
    // identical to React/Solid/Vue behavior; document it.
  })
})
