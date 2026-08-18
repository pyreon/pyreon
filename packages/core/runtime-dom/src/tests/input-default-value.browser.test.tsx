/**
 * `<input value>` / `<textarea value>` must establish `defaultValue` on a CLIENT
 * mount, so `form.reset()` behaves identically to the hydrated page.
 *
 * SSR serializes `value` as a content ATTRIBUTE (it must — pre-JS the box has to
 * show text), and the attribute IS the reset target (`input.defaultValue`
 * reflects it). The client set only the PROPERTY, which never creates the
 * attribute — so the same form cleared its fields on a client-side navigation
 * and restored them on a fresh load.
 *
 * REAL CHROMIUM ONLY, deliberately. happy-dom does model `defaultValue`, but the
 * load-bearing halves here are (a) the DIRTY-VALUE FLAG — a real user edit must
 * survive a later `defaultValue` assignment — and (b) `form.reset()` semantics,
 * neither of which is worth trusting to a partial DOM.
 */
import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { hydrateRoot, mount } from '../index'

function host(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

/** Type into a focused field the way a user does — this is what sets the DIRTY flag. */
function userType(el: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  el.focus()
  document.execCommand('selectAll', false, undefined)
  document.execCommand('insertText', false, text)
}

describe('input/textarea defaultValue reflection', () => {
  it('client mount establishes defaultValue, so form.reset() restores the initial value', () => {
    const root = host()
    mount(h('form', null, h('input', { value: 'hello', name: 'greeting' })),
      root,
    )
    const form = root.querySelector('form')!
    const input = root.querySelector('input')!

    expect(input.value).toBe('hello')
    userType(input, 'edited')
    expect(input.value).toBe('edited')

    form.reset()
    // Pre-fix this was '' — the property-only set left defaultValue empty.
    expect(input.value).toBe('hello')
  })

  it('client mount and hydration agree on the serialized attribute', () => {
    const root = host()
    mount(h('input', { value: 'hello' }), root)
    // The reflected attribute is what makes the client DOM byte-match the SSR
    // markup — the reason the parity fuzzer can compare these shapes at all.
    expect(root.innerHTML).toBe('<input value="hello">')
  })

  it('textarea client mount establishes defaultValue (its default lives in text content)', () => {
    const root = host()
    mount(h('form', null, h('textarea', { value: 'hello' })),
      root,
    )
    const form = root.querySelector('form')!
    const ta = root.querySelector('textarea')!

    expect(ta.value).toBe('hello')
    expect(ta.defaultValue).toBe('hello')

    userType(ta, 'edited')
    form.reset()
    expect(ta.value).toBe('hello')
  })

  it('a CONTROLLED input does NOT move defaultValue as the user types', () => {
    // The load-bearing case. A controlled input writes its signal on every
    // keystroke, which re-runs the value binding — so a naive "assign
    // defaultValue alongside value in the same updater" would drag the reset
    // target along with the typing and make form.reset() a no-op.
    // defaultValue is established ONCE, at mount, exactly like React's initInput.
    const root = host()
    const text = signal('initial')
    mount(
      () =>
        h('form', null, [
          h('input', {
            value: () => text(),
            onInput: (e: Event) => text.set((e.currentTarget as HTMLInputElement).value),
          }),
        ]),
      root,
    )
    const form = root.querySelector('form')!
    const input = root.querySelector('input')!

    expect(input.defaultValue).toBe('initial')

    userType(input, 'typed by the user')
    // The signal really did follow the keystrokes...
    expect(text()).toBe('typed by the user')
    expect(input.value).toBe('typed by the user')
    // ...and the reset target really did NOT.
    expect(input.defaultValue).toBe('initial')

    form.reset()
    expect(input.value).toBe('initial')
  })

  it('a reactive value change does not move defaultValue either', () => {
    const root = host()
    const text = signal('first')
    mount(h('input', { value: () => text() }), root)
    const input = root.querySelector('input')!

    expect(input.defaultValue).toBe('first')
    text.set('second')
    expect(input.value).toBe('second')
    expect(input.defaultValue).toBe('first')
  })

  it('assigning defaultValue never clobbers a value the user already typed', () => {
    const root = host()
    const text = signal('a')
    mount(h('input', { value: () => text() }), root)
    const input = root.querySelector('input')!

    userType(input, 'typed-by-user')
    // A later reactive pass re-asserts the property (that is the point of a
    // controlled input) but must not resurrect a stale default.
    text.set('b')
    expect(input.value).toBe('b')
    expect(input.defaultValue).toBe('a')
  })

  it('hydration keeps the server-rendered default (unchanged behaviour)', () => {
    const root = host()
    root.innerHTML = '<form><input value="hello"></form>'
    hydrateRoot(root, h('form', null, h('input', { value: 'hello' })))

    const form = root.querySelector('form')!
    const input = root.querySelector('input')!
    expect(input.defaultValue).toBe('hello')

    userType(input, 'edited')
    form.reset()
    expect(input.value).toBe('hello')
  })

  it('an explicit defaultValue prop still wins over the value prop', () => {
    const root = host()
    mount(h('input', { value: 'live', defaultValue: 'the-default' }), root)
    const input = root.querySelector('input')!
    expect(input.value).toBe('live')
    expect(input.defaultValue).toBe('the-default')
  })

  it('a null value neither sets a default nor serializes an attribute', () => {
    // SSR omits the attribute entirely for a nullish value, so the client must
    // not invent `value=""` — that would be a fresh hydration mismatch.
    const root = host()
    mount(h('input', { value: null }), root)
    const input = root.querySelector('input')!
    expect(input.hasAttribute('value')).toBe(false)
    expect(input.defaultValue).toBe('')
  })

  it('leaves non-input elements that own a `value` property alone', () => {
    const root = host()
    mount(h('progress', { value: 0.5, max: 1 }), root)
    const p = root.querySelector('progress')!
    expect(p.value).toBe(0.5)
    // `<progress>` has no defaultValue; the reflection must be scoped to
    // input/textarea only.
    expect('defaultValue' in p).toBe(false)
  })
})
