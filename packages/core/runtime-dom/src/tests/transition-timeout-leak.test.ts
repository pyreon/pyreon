import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { Transition as _Transition, mount } from '../index'

const Transition = _Transition as unknown as ComponentFn<Record<string, unknown>>

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

// Regression for the 5s safety-timer leak in applyEnter / applyLeave.
// Before the fix, when transitionend fired normally the 5s setTimeout was
// never cleared and would re-invoke `done()` later, firing onAfterEnter /
// onAfterLeave twice and leaking closures over the element.
describe('Transition — safety-timer leak (regression)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test('onAfterEnter fires exactly once when transitionend fires before 5s safety timeout', async () => {
    const el = container()
    const show = signal(false)
    const onAfterEnter = vi.fn()

    mount(
      h(
        Transition,
        { name: 'fade', show: () => show(), onAfterEnter },
        h('div', { class: 'enter-leak' }, 'x'),
      ),
      el,
    )

    show.set(true)
    await vi.advanceTimersByTimeAsync(20)

    const target = el.querySelector('.enter-leak') as HTMLElement
    expect(target).not.toBeNull()

    target.dispatchEvent(new Event('transitionend'))
    expect(onAfterEnter).toHaveBeenCalledTimes(1)

    // Advance past the safety timeout. With the leak, done() would fire again.
    await vi.advanceTimersByTimeAsync(6000)
    expect(onAfterEnter).toHaveBeenCalledTimes(1)
  })

  test('onAfterLeave fires exactly once when transitionend fires before 5s safety timeout', async () => {
    const el = container()
    const show = signal(true)
    const onAfterLeave = vi.fn()

    mount(
      h(
        Transition,
        { name: 'fade', show: () => show(), onAfterLeave },
        h('div', { class: 'leave-leak' }, 'x'),
      ),
      el,
    )
    await vi.advanceTimersByTimeAsync(20)

    show.set(false)
    await vi.advanceTimersByTimeAsync(20)

    const target = el.querySelector('.leave-leak') as HTMLElement
    expect(target).not.toBeNull()

    target.dispatchEvent(new Event('transitionend'))
    expect(onAfterLeave).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(6000)
    expect(onAfterLeave).toHaveBeenCalledTimes(1)
  })
})
