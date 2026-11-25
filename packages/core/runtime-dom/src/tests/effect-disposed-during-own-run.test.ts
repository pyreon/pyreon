/**
 * A component effect whose own run unmounts the component synchronously (a
 * self-closing imperatively mounted root: a modal calling the `mount()`
 * disposer it was handed) is disposed while that run is still on the stack.
 * What the run registers afterwards — an `onCleanup`, an inner effect, later
 * reads — must not outlive the component. See `@pyreon/reactivity`'s
 * `dispose-during-own-run.test.ts`.
 *
 * (A signal WRITE that hides the component does not reach this shape: writes
 * made inside a run are flushed after it.)
 */
import { h } from '@pyreon/core'
import { effect, onCleanup, signal } from '@pyreon/reactivity'
import { mount } from '../index'

describe('component effect disposed during its own run', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  test('an effect that unmounts its own root releases what it registers afterwards', () => {
    const close = signal(false)
    const s = signal(0)
    let innerRuns = 0
    let cleanups = 0

    const Child = () => {
      effect(() => {
        if (close()) unmount() // unmounts this component mid-run
        onCleanup(() => cleanups++)
        effect(() => {
          s()
          innerRuns++
        })
      })

      return h('span', null, 'child')
    }

    const unmount = mount(h('div', null, h(Child, null)), container)
    expect(container.querySelector('span')).not.toBeNull()

    close.set(true)
    expect(container.querySelector('span')).toBeNull()

    innerRuns = 0
    cleanups = 0
    s.set(1)
    expect(innerRuns).toBe(0) // the inner effect did not outlive the component
    expect(cleanups).toBe(0)
    expect(s.debug().subscriberCount).toBe(0)
    expect(close.debug().subscriberCount).toBe(0)
  })
})
