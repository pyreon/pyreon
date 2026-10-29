// `<Select>` on the web, in real Chromium — the oracle the iOS Picker and the
// Android ExposedDropdownMenuBox are held to (#3980). A real browser, because
// `<select>` selection semantics (what shows when nothing matches, what a
// disabled option does) are exactly what a partial DOM polyfill gets wrong.

import { afterEach, describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { query } from '@pyreon/test-utils'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { Select } from '../index'
import type { SelectOption } from '../index'

const FRUITS: SelectOption[] = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'p', label: 'Pear', disabled: true },
]

let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
})

function mountSelect(props: Record<string, unknown>) {
  const { container, unmount } = mountInBrowser(h(Select, props as never))
  cleanup = unmount
  return query(container, 'select')
}

describe('<Select> — web', () => {
  it('renders the options, the selected value, and a disabled option', async () => {
    const value = signal('b')
    const el = mountSelect({ value, options: FRUITS, onChange: (v: string) => value.set(v) })
    await flush()
    expect([...el.options].map((o) => o.label)).toEqual(['', 'Apple', 'Banana', 'Pear'])
    expect(el.value).toBe('b')
    expect(el.options[3]!.disabled).toBe(true)
  })

  it('a user choice reports the option value through onChange, and the signal drives the control', async () => {
    const value = signal('')
    const seen: string[] = []
    const el = mountSelect({ value, options: FRUITS, onChange: (v: string) => { seen.push(v); value.set(v) } })
    el.value = 'a'
    el.dispatchEvent(new Event('change', { bubbles: true }))
    await flush()
    expect(seen).toEqual(['a'])
    expect(value()).toBe('a')
    value.set('b')
    await flush()
    expect(el.value).toBe('b')
  })

  it('nothing selected shows the placeholder — not the first option, which the signal does not hold', async () => {
    const value = signal('')
    const el = mountSelect({ value, options: FRUITS, placeholder: 'Pick a fruit', onChange: () => {} })
    await flush()
    expect(el.selectedIndex).toBe(0)
    expect(el.options[0]!.label).toBe('Pick a fruit')
    expect(el.options[0]!.disabled).toBe(true)
    expect(el.value).toBe('')
    // A value no option has is "nothing selected" too.
    value.set('zzz')
    await flush()
    expect(el.selectedIndex).toBe(0)
  })

  it('without a placeholder an unset value still selects nothing visible', async () => {
    const el = mountSelect({ value: '', options: FRUITS, onChange: () => {} })
    await flush()
    expect(el.selectedIndex).toBe(0)
    expect(el.options[0]!.label).toBe('')
  })

  it('options that arrive AFTER the value select it — the async-loaded list', async () => {
    const value = signal('b')
    const options = signal<SelectOption[]>([])
    const el = mountSelect({ value, options, onChange: (v: string) => value.set(v) })
    await flush()
    expect(el.value).toBe('')
    options.set(FRUITS)
    await flush()
    expect(el.value).toBe('b')
  })

  it('a relabelled option re-renders instead of freezing', async () => {
    const options = signal<SelectOption[]>([{ value: 'a', label: 'Apple' }])
    const el = mountSelect({ value: 'a', options, onChange: () => {} })
    await flush()
    options.set([{ value: 'a', label: 'Green apple' }])
    await flush()
    expect(el.options[1]!.label).toBe('Green apple')
    expect(el.value).toBe('a')
  })

  it('disabled, and passthrough attributes', async () => {
    const el = mountSelect({ value: 'a', options: FRUITS, onChange: () => {}, disabled: true, 'data-testid': 'fruit', accessibilityLabel: 'Fruit' })
    await flush()
    expect(el.disabled).toBe(true)
    expect(el.getAttribute('data-testid')).toBe('fruit')
    expect(el.getAttribute('aria-label')).toBe('Fruit')
  })
})
