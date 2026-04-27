import type { VNodeChild } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { jsx } from './jsx-runtime'
import { useState } from './index'

/**
 * Real-browser smoke test for `@pyreon/react-compat`.
 *
 * Per the test-environment-parity rule (`pyreon/require-browser-smoke-test`),
 * every browser-categorized package must ship at least one `*.browser.test.*`
 * file. This catches regressions that happy-dom / hook-runner unit tests
 * can hide: importing the public API, mounting through the JSX runtime
 * wrapper, and exercising the React-style hook entry point in a real
 * browser DOM (not a Node DOM polyfill).
 *
 * Companion unit tests in `src/tests/*.test.ts` test the hook semantics
 * via `withHookCtx` runners. This smoke proves the integration: the
 * package can be imported and mounted end-to-end in real Chromium.
 */
describe('@pyreon/react-compat — browser smoke', () => {
  it('renders a component using useState in real browser', () => {
    function Greeting(): VNodeChild {
      const [name] = useState('Pyreon')
      return jsx('div', { id: 'greeting', children: `hello, ${name}` })
    }

    const { container, unmount } = mountInBrowser(jsx(Greeting, {}))
    const greeting = container.querySelector('#greeting')!
    expect(greeting.textContent).toBe('hello, Pyreon')
    unmount()
    expect(document.getElementById('greeting')).toBeNull()
  })
})
