import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '../index'

it('updates live checked state without moving the reset default', () => {
  const checked = signal<boolean | null | undefined>(true)
  const container = document.createElement('div')
  const unmount = mount(h('input', { type: 'checkbox', checked: () => checked() }), container)
  try {
    const input = container.querySelector('input')!
    input.click()
    expect(input.checked).toBe(false)
    checked.set(false)
    checked.set(true)
    expect(input.checked).toBe(true)
    checked.set(null)
    expect(input.checked).toBe(false)
    expect(input.defaultChecked).toBe(true)
    checked.set(true)
    checked.set(undefined)
    expect(input.checked).toBe(false)
    expect(input.defaultChecked).toBe(true)
  } finally {
    unmount()
  }
})

it.each([false, true])(
  'preserves explicit defaultChecked=%s regardless of prop order',
  (defaultChecked) => {
    for (const props of [
      { defaultChecked, checked: !defaultChecked },
      { checked: !defaultChecked, defaultChecked },
    ]) {
      const container = document.createElement('div')
      const unmount = mount(h('input', { type: 'checkbox', ...props }), container)
      try {
        const input = container.querySelector('input')!
        expect(input.checked).toBe(!defaultChecked)
        expect(input.defaultChecked).toBe(defaultChecked)
      } finally {
        unmount()
      }
    }
  },
)
