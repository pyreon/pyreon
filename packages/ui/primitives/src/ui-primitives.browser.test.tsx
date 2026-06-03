import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { query } from '@pyreon/test-utils'
import { CheckboxBase, RadioBase, RadioGroupBase, SwitchBase } from './index'

/**
 * Real-browser smoke test for `@pyreon/ui-primitives`.
 *
 * Per the test-environment-parity rule (`pyreon/require-browser-smoke-test`),
 * every browser-categorized package must ship at least one
 * `*.browser.test.*` file. This catches regressions that happy-dom tests
 * can hide: importing a representative headless primitive and mounting
 * it through the JSX runtime + `useControllableState` hook chain in a
 * real Chromium browser (the toggle interaction itself is covered by
 * unit tests in `src/__tests__/`).
 *
 * ## Why these assert ARIA roles/state in a REAL browser
 *
 * These are HEADLESS primitives: their accessibility comes from `role` +
 * `aria-*` wiring on the rendered elements (the ARIA-helper-props pattern),
 * which a static linter CANNOT verify — `oxlint`'s `jsx-a11y` interactivity/
 * role rules are scoped off here precisely because they false-positive on the
 * `role`-on-a-custom-element headless idiom. So the real a11y gate for these
 * primitives is THIS test: mount the primitive and assert the rendered
 * `role` + `aria-*` actually land in the DOM. Covers Switch / Checkbox /
 * RadioGroup; extend as new headless primitives ship.
 */
describe('@pyreon/ui-primitives — browser smoke', () => {
  it('mounts SwitchBase with role=switch and ARIA wiring intact', () => {
    const { container, unmount } = mountInBrowser(
      h(SwitchBase as never, {
        defaultChecked: true,
        id: 'smoke-switch',
        children: 'toggle me',
      }),
    )
    const sw = query<HTMLButtonElement>(container, '#smoke-switch')
    expect(sw).not.toBeNull()
    expect(sw.tagName).toBe('BUTTON')
    expect(sw.getAttribute('role')).toBe('switch')
    // `defaultChecked: true` → aria-checked attribute is present in DOM
    // (Pyreon renders boolean-true as empty-string attr). Testing the
    // toggle interaction belongs in unit tests, not the browser smoke.
    expect(sw.hasAttribute('aria-checked')).toBe(true)

    unmount()
    expect(document.getElementById('smoke-switch')).toBeNull()
  })

  it('mounts CheckboxBase with role=checkbox + aria-checked wiring intact', () => {
    const { container, unmount } = mountInBrowser(
      h(CheckboxBase as never, {
        defaultChecked: true,
        id: 'smoke-cb',
        children: 'check me',
      }),
    )
    const cb = query<HTMLElement>(container, '#smoke-cb')
    expect(cb).not.toBeNull()
    expect(cb.getAttribute('role')).toBe('checkbox')
    expect(cb.hasAttribute('aria-checked')).toBe(true)

    unmount()
    expect(document.getElementById('smoke-cb')).toBeNull()
  })

  it('mounts RadioGroupBase with role=radiogroup + role=radio items; the selected radio is aria-checked', () => {
    const { container, unmount } = mountInBrowser(
      h(
        RadioGroupBase as never,
        { defaultValue: 'a', id: 'smoke-rg' },
        h(RadioBase as never, { value: 'a', children: 'A' }),
        h(RadioBase as never, { value: 'b', children: 'B' }),
      ),
    )
    const group = query<HTMLElement>(container, '#smoke-rg')
    expect(group.getAttribute('role')).toBe('radiogroup')

    const radios = container.querySelectorAll('[role="radio"]')
    expect(radios.length).toBe(2)

    // defaultValue 'a' → the value='a' radio carries checked state (aria + data),
    // the value='b' radio does not. This is the keyboard/SR-visible state.
    const selected = container.querySelector<HTMLElement>('[data-value="a"]')!
    const unselected = container.querySelector<HTMLElement>('[data-value="b"]')!
    expect(selected.getAttribute('role')).toBe('radio')
    expect(selected.hasAttribute('aria-checked')).toBe(true)
    expect(unselected.hasAttribute('data-checked')).toBe(false)

    unmount()
    expect(document.getElementById('smoke-rg')).toBeNull()
  })
})
