import { mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { _applyProps } from '../index'

// Real-Chromium lock for the spread-ref fix. The compiled `<button {...props}>`
// path lowers to `_applyProps(el, props)` (verified in ref-in-dom-spread.test.tsx
// through the real transform). This drives that exact runtime call in a real
// browser and asserts the DOWNSTREAM behavior the fix enables — a focus
// registry populated from a spread ref can move REAL DOM focus. happy-dom's
// focus model is unreliable, and the browser harness's auto-JSX runtime would
// route through h() (masking the bug), so this calls `_applyProps` directly.
describe('spread ref on a bare element enables real focus (real browser)', () => {
  it('a ref inside the spread registers the element and .focus() moves activeElement', () => {
    const { container } = mountInBrowser(h('div', null, ''))
    const host = container.querySelector('div')!
    // Mirror CalendarBase.getDayProps: a registry populated via a spread ref.
    const registry = new Map<string, HTMLElement>()
    const btn = document.createElement('button')
    btn.textContent = '15'
    host.appendChild(btn)
    // The exact call the compiler emits for `<button {...getDayProps(day)}>`:
    _applyProps(btn, {
      'data-day': '2026-07-15',
      tabIndex: 0,
      ref: (el: Element | null) => {
        if (el) registry.set('2026-07-15', el as HTMLElement)
        else registry.delete('2026-07-15')
      },
    })
    // The ref fired → registry populated (pre-fix it stayed empty).
    expect(registry.get('2026-07-15')).toBe(btn)
    // Real focus moves — the roving-focus behavior CalendarBase needs.
    registry.get('2026-07-15')!.focus()
    expect(document.activeElement).toBe(btn)
    expect(btn.getAttribute('data-day')).toBe('2026-07-15')
  })
})
