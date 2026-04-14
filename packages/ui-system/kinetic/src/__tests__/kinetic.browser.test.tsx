/** @jsxImportSource @pyreon/core */
import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { nextFrame, mergeClassNames } from '../utils'
import Transition from '../Transition'

describe('@pyreon/kinetic browser smoke', () => {
  it('Transition mounts a visible child into real DOM', async () => {
    const show = signal(true)
    const { container, unmount } = mountInBrowser(
      <Transition show={show}>
        <div data-id="t">hello</div>
      </Transition>,
    )
    const el = container.querySelector('[data-id="t"]')
    expect(el?.textContent).toBe('hello')
    unmount()
  })

  it('Transition fires onLeave when show signal goes true → false', async () => {
    let onLeaveCalls = 0
    const show = signal(true)
    const { unmount } = mountInBrowser(
      <Transition show={show} onLeave={() => { onLeaveCalls++ }}>
        <div data-id="t">hi</div>
      </Transition>,
    )
    expect(onLeaveCalls).toBe(0)
    show.set(false)
    await flush()
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))
    // onLeave fires once the leave transition starts — asserts the
    // signal → stage machine → lifecycle callback path ran end-to-end.
    expect(onLeaveCalls).toBe(1)
    unmount()
  })

  it('nextFrame schedules a callback via requestAnimationFrame', async () => {
    let fired = false
    nextFrame(() => {
      fired = true
    })
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))
    expect(fired).toBe(true)
  })

  it('mergeClassNames filters empty + joins', () => {
    expect(mergeClassNames('a', 'b')).toBe('a b')
    expect(mergeClassNames('a', undefined)).toBe('a')
    expect(mergeClassNames(undefined, undefined)).toBe(undefined)
  })

  it('runs in a real browser — `typeof process` is undefined, `import.meta.env.DEV` is true', () => {
    expect(typeof process).toBe('undefined')
    expect(import.meta.env.DEV).toBe(true)
  })
})
