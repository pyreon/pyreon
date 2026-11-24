import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { query } from '@pyreon/test-utils'
import { Transition as _Transition, mount } from '../index'

const Transition = _Transition as unknown as ComponentFn<Record<string, unknown>>

/**
 * `<Transition>` schedules the second half of each enter / leave with
 * `requestAnimationFrame`, and never cancelled that frame. Unmounting between
 * the class swap and the frame (the same tick, or the next few milliseconds)
 * let the frame run on the detached element: it attached `transitionend` /
 * `animationend` listeners and armed the 5s safety timer, which then fired
 * `onAfterEnter` / `onAfterLeave` after the component was gone. The existing
 * unmount tests (`transition-timeout-leak.test.ts`) unmount only AFTER the frame.
 */
describe('Transition — unmount before the animation frame', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test('enter: onAfterEnter never fires and the element gets no listeners', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const show = signal(false)
    const onAfterEnter = vi.fn()
    const dispose = mount(
      h(Transition, { name: 'fade', show: () => show(), onAfterEnter }, h('div', { class: 'target' }, 'x')),
      el,
    )
    show.set(true)
    // Microtasks only: the child mounted and the enter classes are on, the frame is pending.
    await vi.advanceTimersByTimeAsync(0)
    const target = query<HTMLElement>(el, '.target')
    expect(target.classList.contains('fade-enter-from')).toBe(true)
    const added = vi.spyOn(target, 'addEventListener')

    dispose()
    await vi.advanceTimersByTimeAsync(6000)
    expect(onAfterEnter).not.toHaveBeenCalled()
    expect(added).not.toHaveBeenCalled()
    el.remove()
  })

  test('leave: onAfterLeave never fires after an unmount before the frame', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const show = signal(true)
    const onAfterLeave = vi.fn()
    const dispose = mount(
      h(Transition, { name: 'fade', show: () => show(), onAfterLeave }, h('div', { class: 'target' }, 'x')),
      el,
    )
    await vi.advanceTimersByTimeAsync(20)
    const target = query<HTMLElement>(el, '.target')
    show.set(false)
    expect(target.classList.contains('fade-leave-from')).toBe(true)
    const added = vi.spyOn(target, 'addEventListener')

    dispose()
    await vi.advanceTimersByTimeAsync(6000)
    expect(onAfterLeave).not.toHaveBeenCalled()
    expect(added).not.toHaveBeenCalled()
    el.remove()
  })
})
