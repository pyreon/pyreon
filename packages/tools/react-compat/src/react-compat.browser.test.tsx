import type { VNodeChild } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { jsx } from './jsx-runtime'
import { useState } from './index'
import { createPortal, hydrateRoot } from './dom'

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

describe('react-dom entry in real Chromium', () => {
  it('hydrateRoot takes over server markup; createPortal renders elsewhere', async () => {
    const target = document.body.appendChild(document.createElement('div'))
    function Counter() {
      const [n, setN] = useState(0)
      return jsx('div', {
        children: [
          jsx('button', { onClick: () => setN(n + 1), children: `count ${n}` }),
          createPortal(jsx('b', { children: 'portaled' }), target),
        ],
      })
    }
    const el = document.body.appendChild(document.createElement('div'))
    el.innerHTML = '<div><button>count 0</button></div>'
    const root = hydrateRoot(el, jsx(Counter, {}))
    expect(el.querySelectorAll('button')).toHaveLength(1)
    el.querySelector('button')!.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(el.querySelector('button')!.textContent).toBe('count 1')
    expect(target.textContent).toBe('portaled')
    root.unmount()
    el.remove()
    target.remove()
  })
})
