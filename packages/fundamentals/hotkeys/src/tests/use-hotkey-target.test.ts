// useHotkey's `target` is resolved at MOUNT (a ref is still null during
// setup) and tracked afterwards. It used to be passed straight to
// registerHotkey at setup, so a ref getter could not be used at all and an
// element reference had to already exist when the component body ran.
import { signal } from '@pyreon/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'

let mountCallbacks: Array<() => unknown> = []
let unmountCallbacks: Array<() => void> = []
vi.mock('@pyreon/core', () => ({
  onMount: (fn: () => unknown) => {
    mountCallbacks.push(fn)
  },
  onUnmount: (fn: () => void) => {
    unmountCallbacks.push(fn)
  },
}))

import { _resetHotkeys } from '../registry'
import { useHotkey } from '../use-hotkey'

afterEach(() => {
  _resetHotkeys()
  mountCallbacks = []
  unmountCallbacks = []
})

const press = (target: EventTarget) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true }))

describe('useHotkey target getter', () => {
  it('binds to the element a ref points at after mount — never to window', () => {
    const handler = vi.fn()
    let panel: HTMLDivElement | null = null
    useHotkey('k', handler, { target: () => panel })
    panel = document.createElement('div') // the ref is wired during mount
    for (const cb of mountCallbacks) cb()
    press(window)
    expect(handler).not.toHaveBeenCalled()
    press(panel)
    expect(handler).toHaveBeenCalledTimes(1)
    for (const cb of unmountCallbacks) cb()
    press(panel)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('a signal-backed getter re-binds when the element changes', () => {
    const handler = vi.fn()
    const target = signal<HTMLElement | null>(null)
    useHotkey('k', handler, { target: () => target() })
    for (const cb of mountCallbacks) cb()
    const a = document.createElement('div')
    const b = document.createElement('div')
    target.set(a)
    press(a)
    target.set(b)
    press(a) // old element no longer bound
    press(b)
    expect(handler).toHaveBeenCalledTimes(2)
    for (const cb of unmountCallbacks) cb()
  })
})
