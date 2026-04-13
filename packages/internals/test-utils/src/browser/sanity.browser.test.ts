import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from './index'

describe('browser harness sanity', () => {
  it('mounts a static element into real DOM', () => {
    const { container, unmount } = mountInBrowser(h('div', { id: 'hi' }, 'hello'))
    expect(container.querySelector('#hi')?.textContent).toBe('hello')
    unmount()
    expect(document.getElementById('hi')).toBeNull()
  })

  it('reacts to a signal update — catches reactivity regressions in real browser', async () => {
    const count = signal(0)
    const { container, unmount } = mountInBrowser(h('span', { id: 'n' }, () => String(count())))
    expect(container.querySelector('#n')?.textContent).toBe('0')
    count.set(5)
    await flush()
    expect(container.querySelector('#n')?.textContent).toBe('5')
    unmount()
  })

  it('runs in a real browser — `typeof process` is undefined, `import.meta.env.DEV` is true', () => {
    expect(typeof process).toBe('undefined')
    expect(import.meta.env.DEV).toBe(true)
  })
})
