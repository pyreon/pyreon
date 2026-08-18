/**
 * Real-Chromium companion to `readonly-idl-prop.test.ts`.
 *
 * The node suite is load-bearing on its own (happy-dom models these accessors as
 * getter-only and throws in strict mode, verified before relying on it), but the
 * crash was MEASURED in Chromium and `@pyreon/runtime-dom` is a browser package,
 * so the end-to-end mount is re-proved against the real engine — the
 * `select-value.browser.test.tsx` precedent.
 *
 * `<input list>` is the reachable case: `list` is an advertised JSX prop, and its
 * IDL property is read-only precisely because it returns the RESOLVED
 * `<datalist>`. So the attribute fallback is the CORRECT destination, not just
 * crash-avoidance — asserted below by wiring a real datalist and reading
 * `input.list` back as the element it resolves to.
 *
 * NOTE: this package's tests author DOM with `h()`, never JSX — runtime-dom has
 * no JSX transform configured (`jsx: preserve` reaches vite as invalid syntax).
 */
import { h } from '@pyreon/core'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'

describe('read-only IDL accessors in real Chromium', () => {
  it('mounts <input list="dl"> and the attribute RESOLVES to the datalist', () => {
    const { container } = mountInBrowser(
      h('div', null, [
        h('datalist', { id: 'dl' }, h('option', { value: 'a' })),
        h('input', { list: 'dl', 'data-testid': 'i' }),
      ]),
    )
    const input = container.querySelector<HTMLInputElement>('[data-testid="i"]')!
    expect(input.getAttribute('list')).toBe('dl')
    // The payoff: the read-only IDL getter now returns the linked element, which
    // is only possible because the value went to the ATTRIBUTE.
    expect(input.list).toBe(container.querySelector('datalist'))
  })

  it('a read-only key inside a DOM-element spread does not crash the mount', () => {
    const rest = { list: 'dl2', placeholder: 'p', 'data-testid': 's' }
    const { container } = mountInBrowser(h('input', { ...rest }))
    const input = container.querySelector<HTMLInputElement>('[data-testid="s"]')!
    expect(input.getAttribute('list')).toBe('dl2')
    expect(input.placeholder).toBe('p')
  })

  it('writable properties are NOT demoted to attributes by the guard', () => {
    const { container } = mountInBrowser(
      h('input', { value: 'v', placeholder: 'p', 'data-testid': 'w' }),
    )
    const input = container.querySelector<HTMLInputElement>('[data-testid="w"]')!
    // `value` is non-reflecting: proving the PROPERTY was written (and no
    // `value` attribute appeared) is what shows the guard did not over-reach.
    expect(input.value).toBe('v')
    expect(input.hasAttribute('value')).toBe(false)
    expect(input.placeholder).toBe('p')
  })
})
