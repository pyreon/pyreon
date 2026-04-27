import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { SwitchBase } from './index'

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
 * `SwitchBase` is the canonical primitive — exercises
 * `useControllableState`, ARIA role/state wiring, and the standard
 * Pyreon JSX → DOM compile pipeline.
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
    const sw = container.querySelector('#smoke-switch') as HTMLButtonElement
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
})
