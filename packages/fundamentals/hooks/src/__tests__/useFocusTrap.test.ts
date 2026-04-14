import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let mountCallbacks: Array<() => void> = []
let unmountCallbacks: Array<() => void> = []

vi.mock('@pyreon/core', () => ({
  onMount: (fn: () => unknown) => {
    mountCallbacks.push(() => {
      const ret = fn()
      if (typeof ret === 'function') unmountCallbacks.push(ret as () => void)
    })
  },
  onUnmount: (fn: () => void) => {
    unmountCallbacks.push(fn)
  },
}))

import { useFocusTrap } from '../useFocusTrap'

describe('useFocusTrap', () => {
  let container: HTMLDivElement
  let btn1: HTMLButtonElement
  let btn2: HTMLButtonElement
  let btn3: HTMLButtonElement

  beforeEach(() => {
    mountCallbacks = []
    unmountCallbacks = []
    container = document.createElement('div')
    btn1 = document.createElement('button')
    btn2 = document.createElement('button')
    btn3 = document.createElement('button')
    container.append(btn1, btn2, btn3)
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  it('wraps focus from last to first on Tab', () => {
    useFocusTrap(() => container)
    mountCallbacks.forEach((cb) => {
      cb()
    })

    btn3.focus()
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    const prevented = vi.spyOn(event, 'preventDefault')
    document.dispatchEvent(event)

    expect(prevented).toHaveBeenCalled()
    expect(document.activeElement).toBe(btn1)
  })

  it('wraps focus from first to last on Shift+Tab', () => {
    useFocusTrap(() => container)
    mountCallbacks.forEach((cb) => {
      cb()
    })

    btn1.focus()
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
    })
    const prevented = vi.spyOn(event, 'preventDefault')
    document.dispatchEvent(event)

    expect(prevented).toHaveBeenCalled()
    expect(document.activeElement).toBe(btn3)
  })

  it('does not wrap when Tab on middle element', () => {
    useFocusTrap(() => container)
    mountCallbacks.forEach((cb) => {
      cb()
    })

    btn2.focus()
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    const prevented = vi.spyOn(event, 'preventDefault')
    document.dispatchEvent(event)

    expect(prevented).not.toHaveBeenCalled()
  })

  it('ignores non-Tab keys', () => {
    useFocusTrap(() => container)
    mountCallbacks.forEach((cb) => {
      cb()
    })

    btn3.focus()
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    const prevented = vi.spyOn(event, 'preventDefault')
    document.dispatchEvent(event)

    expect(prevented).not.toHaveBeenCalled()
  })

  it('does nothing when element is null', () => {
    useFocusTrap(() => null)
    mountCallbacks.forEach((cb) => {
      cb()
    })

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    const prevented = vi.spyOn(event, 'preventDefault')
    document.dispatchEvent(event)

    expect(prevented).not.toHaveBeenCalled()
  })

  it('does nothing when container has no focusable children', () => {
    const emptyContainer = document.createElement('div')
    emptyContainer.appendChild(document.createElement('div'))
    document.body.appendChild(emptyContainer)

    useFocusTrap(() => emptyContainer)
    mountCallbacks.forEach((cb) => {
      cb()
    })

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    const prevented = vi.spyOn(event, 'preventDefault')
    document.dispatchEvent(event)

    expect(prevented).not.toHaveBeenCalled()
    document.body.removeChild(emptyContainer)
  })

  it('cleans up event listener on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    useFocusTrap(() => container)
    mountCallbacks.forEach((cb) => {
      cb()
    })
    unmountCallbacks.forEach((cb) => {
      cb()
    })

    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    removeSpy.mockRestore()
  })

  it('does not prevent default when Shift+Tab on non-first element', () => {
    useFocusTrap(() => container)
    mountCallbacks.forEach((cb) => {
      cb()
    })

    btn2.focus()
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
    })
    const prevented = vi.spyOn(event, 'preventDefault')
    document.dispatchEvent(event)

    expect(prevented).not.toHaveBeenCalled()
  })
})
