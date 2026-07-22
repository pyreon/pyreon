/**
 * Interaction coverage for the thin native-element primitives `SelectBase`
 * (wraps <select>) and `SliderBase` (wraps <input type=range>) — their
 * change/input handlers, controlled/uncontrolled value flow, placeholder, and
 * disabled/aria surfaces. Driven by real change/input events in real Chromium
 * (also runs in happy-dom for the gated node coverage).
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { query } from '@pyreon/test-utils'
import { SelectBase, SliderBase } from './index'

describe('SelectBase', () => {
  it('change fires onChange with the selected value; renders a disabled placeholder option', async () => {
    const calls: string[] = []
    const { container } = mountInBrowser(
      h(SelectBase as never, {
        id: 'sel',
        placeholder: 'Pick one',
        onChange: (v: string) => calls.push(v),
        children: [
          h('option', { value: 'a' }, 'A'),
          h('option', { value: 'b' }, 'B'),
        ],
      }),
    )
    const sel = query<HTMLSelectElement>(container, '#sel')
    const first = sel.querySelector('option')
    expect(first?.getAttribute('value')).toBe('')
    expect(first?.hasAttribute('disabled')).toBe(true)

    sel.value = 'b'
    sel.dispatchEvent(new Event('change', { bubbles: true }))
    await flush()
    expect(calls).toEqual(['b'])
  })

  it('aria-invalid + disabled reflect the props', () => {
    const { container } = mountInBrowser(
      h(SelectBase as never, { id: 'sel2', disabled: true, 'aria-invalid': true }),
    )
    const sel = query<HTMLSelectElement>(container, '#sel2')
    expect(sel.hasAttribute('disabled')).toBe(true)
    expect(sel.getAttribute('aria-invalid')).toBe('true')
  })
})

describe('SliderBase', () => {
  it('input fires onChange with the numeric value; reflects min/max/step + aria-value*', async () => {
    const calls: number[] = []
    const { container } = mountInBrowser(
      h(SliderBase as never, {
        id: 'sl',
        min: 0,
        max: 50,
        step: 5,
        defaultValue: 10,
        onChange: (v: number) => calls.push(v),
      }),
    )
    const inp = query<HTMLInputElement>(container, '#sl')
    expect(inp.getAttribute('type')).toBe('range')
    expect(inp.getAttribute('min')).toBe('0')
    expect(inp.getAttribute('max')).toBe('50')
    expect(inp.getAttribute('step')).toBe('5')
    expect(inp.getAttribute('aria-valuenow')).toBe('10')

    inp.value = '25'
    inp.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    expect(calls).toEqual([25])
  })

  it('disabled + aria-invalid reflect the props', () => {
    const { container } = mountInBrowser(
      h(SliderBase as never, { id: 'sl2', disabled: true, 'aria-invalid': true }),
    )
    const inp = query<HTMLInputElement>(container, '#sl2')
    expect(inp.hasAttribute('disabled')).toBe(true)
    expect(inp.getAttribute('aria-disabled')).toBe('true')
    expect(inp.getAttribute('aria-invalid')).toBe('true')
  })
})
