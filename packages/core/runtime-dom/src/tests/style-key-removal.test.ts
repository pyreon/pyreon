import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { query } from '@pyreon/test-utils'
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

    const el = query(container, 'div')
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

    const el = query(container, 'div')
    expect(el.style.color).toBe('blue')
    expect(el.style.padding).toBe('10px')

    style.set(null)

    expect(el.style.color).toBe('')
    expect(el.style.padding).toBe('')
  })

  it('clears every tracked key when reactive style shrinks to an empty object', () => {
    // Empty-object edge flagged on PR #233: if the new value is `{}`, the
    // `value == null` branch in applyStyleProp is skipped, but the key-diff
    // loop still iterates the prior tracked set and removes each one.
    const style = signal<Record<string, string>>({ color: 'green', margin: '2px' })

    mount(h('div', { style: () => style() }), container)

    const el = query(container, 'div')
    expect(el.style.color).toBe('green')
    expect(el.style.margin).toBe('2px')

    style.set({})

    expect(el.style.color).toBe('')
    expect(el.style.margin).toBe('')
  })

  it('clears a property whose VALUE becomes null/undefined (the toggle idiom)', () => {
    // The `{ background: active ? 'x' : null }` toggle: when the value flips to
    // null the property must be UNSET, not set to the string "null" (an invalid
    // CSS value the browser ignores, leaving the previous value in place — the
    // "multiple toggles stay active" bug in the coolgrid docs preset selector).
    const active = signal(true)
    mount(
      h('div', {
        style: () => ({
          fontWeight: active() ? '700' : '400',
          background: active() ? 'orange' : null,
          color: active() ? 'black' : undefined,
        }),
      }),
      container,
    )

    const el = query(container, 'div')
    expect(el.style.background).toBe('orange')
    expect(el.style.color).toBe('black')
    expect(el.style.fontWeight).toBe('700')

    // Deactivate — the null/undefined values must clear, not persist.
    active.set(false)
    expect(el.style.background).toBe('')
    expect(el.style.color).toBe('')
    expect(el.style.fontWeight).toBe('400')

    // Re-activate — the properties come back (tracking recovered correctly).
    active.set(true)
    expect(el.style.background).toBe('orange')
    expect(el.style.color).toBe('black')
  })

  it('handles object → string → object transitions without leaking keys', () => {
    const style = signal<string | Record<string, string>>({ color: 'red' })

    mount(h('div', { style: () => style() }), container)

    const el = query(container, 'div')
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
