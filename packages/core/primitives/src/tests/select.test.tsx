// `<Select>` under happy-dom — the STRUCTURE the web impl renders. The
// browser's own `<select>` semantics (what is shown when nothing matches,
// `selectedIndex`, option labels) are asserted in real Chromium in
// `select.browser.test.tsx`: happy-dom does not model them faithfully, which is
// why these read each `<option>`'s own `selected` / text / `disabled` rather
// than the `<select>`'s derived state.

import { afterEach, describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { signal } from '@pyreon/reactivity'
import { Select } from '../index'
import type { SelectOption } from '../index'

const FRUITS: SelectOption[] = [
  { value: 'a', label: 'Apple' },
  { value: 'p', label: 'Pear', disabled: true },
]

let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
})

function mountSelect(props: Record<string, unknown>): HTMLSelectElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const unmount = mount(h(Select, props as never), container)
  cleanup = () => {
    unmount()
    container.remove()
  }
  return container.querySelector('select') as HTMLSelectElement
}

const opts = (el: HTMLSelectElement) => [...el.querySelectorAll('option')]

describe('<Select> — happy-dom structure', () => {
  it('a disabled empty option first, then one option per entry', () => {
    const el = mountSelect({ value: 'a', options: FRUITS, onChange: () => {}, placeholder: 'Pick' })
    const o = opts(el)
    expect(o.map((x) => x.textContent)).toEqual(['Pick', 'Apple', 'Pear'])
    expect(o.map((x) => x.getAttribute('value'))).toEqual(['', 'a', 'p'])
    expect(o[0]!.disabled).toBe(true)
    expect(o[2]!.disabled).toBe(true)
    expect(o[1]!.disabled).toBe(false)
  })

  it('the selection is carried by each option and follows the signal', () => {
    const value = signal('a')
    const el = mountSelect({ value, options: FRUITS, onChange: (v: string) => value.set(v) })
    expect(opts(el).map((x) => x.selected)).toEqual([false, true, false])
    value.set('zzz')
    expect(opts(el)[0]!.selected).toBe(true)
    expect(opts(el)[0]!.textContent).toBe('')
  })

  it('change reports the chosen value', () => {
    const seen: string[] = []
    const el = mountSelect({ value: '', options: FRUITS, onChange: (v: string) => seen.push(v) })
    el.value = 'a'
    el.dispatchEvent(new Event('change', { bubbles: true }))
    expect(seen).toEqual(['a'])
  })

  it('a reactive options list re-renders, and a relabelled option is replaced', () => {
    const options = signal<SelectOption[]>([])
    const el = mountSelect({ value: 'a', options, onChange: () => {} })
    expect(opts(el)).toHaveLength(1)
    options.set([{ value: 'a', label: 'Apple' }])
    expect(opts(el)[1]!.textContent).toBe('Apple')
    expect(opts(el)[1]!.selected).toBe(true)
    options.set([{ value: 'a', label: 'Green apple' }])
    expect(opts(el)[1]!.textContent).toBe('Green apple')
  })

  it('disabled dims and disables the control; passthrough attrs reach it', () => {
    const el = mountSelect({ value: '', options: FRUITS, onChange: () => {}, disabled: true, 'data-testid': 'f', accessibilityLabel: 'Fruit' })
    expect(el.disabled).toBe(true)
    expect(el.style.opacity).toBe('0.5')
    expect(el.getAttribute('data-testid')).toBe('f')
    expect(el.getAttribute('aria-label')).toBe('Fruit')
  })
})
