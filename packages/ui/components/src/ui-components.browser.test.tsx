import { h } from '@pyreon/core'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { Button } from './index'

/**
 * Real-browser smoke test for `@pyreon/ui-components`.
 *
 * Per the test-environment-parity rule (`pyreon/require-browser-smoke-test`),
 * every browser-categorized package must ship at least one
 * `*.browser.test.*` file. This catches regressions that happy-dom
 * tests can hide: importing a representative rocketstyle component,
 * mounting it in real Chromium, and verifying it produces real DOM.
 *
 * `Button` is the canonical component — exercises rocketstyle
 * (.attrs/.theme/.states/.sizes), styler (CSS-in-JS), elements (`el`
 * base), and unistyle (responsive props) all in one mount. Wrapped
 * in `<PyreonUI theme={theme}>` because rocketstyle's theme chain
 * resolver throws without a theme context — that's the design.
 */
describe('@pyreon/ui-components — browser smoke', () => {
  it('mounts a Button into real DOM with text content', () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(Button as never, { id: 'smoke-btn' }, 'Click me'),
      ),
    )
    const btn = container.querySelector('#smoke-btn')!
    expect(btn).not.toBeNull()
    expect(btn.textContent).toContain('Click me')
    unmount()
    expect(document.getElementById('smoke-btn')).toBeNull()
  })
})
