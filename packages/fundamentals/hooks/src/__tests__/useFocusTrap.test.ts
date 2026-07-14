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

import { signal } from '@pyreon/reactivity'
import { getFocusable, useFocusTrap } from '../useFocusTrap'

const tick = () => new Promise<void>((r) => queueMicrotask(r))

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
    // Dispose this test's trap so its always-active `document` keydown listener
    // doesn't survive into the next test (the trap closes over the shared
    // `container` let, which beforeEach reassigns — a leftover listener would
    // then act on the NEXT test's container).
    unmountCallbacks.forEach((cb) => {
      cb()
    })
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

  // --- active gating (option-object + positional shorthand) -----------------

  it('does not cycle while inactive, then cycles once active flips true', async () => {
    const active = signal(false)
    useFocusTrap(() => container, () => active())
    mountCallbacks.forEach((cb) => {
      cb()
    })
    await tick()

    // Inactive: the listener is not armed, so a Tab at the edge does nothing.
    btn3.focus()
    const e1 = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    const p1 = vi.spyOn(e1, 'preventDefault')
    document.dispatchEvent(e1)
    expect(p1).not.toHaveBeenCalled()

    // Arm it — the watch re-runs and attaches the listener.
    active.set(true)
    await tick()

    btn3.focus()
    const e2 = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    const p2 = vi.spyOn(e2, 'preventDefault')
    document.dispatchEvent(e2)
    expect(p2).toHaveBeenCalled()
    expect(document.activeElement).toBe(btn1)
  })

  it('accepts a plain boolean active (positional shorthand)', async () => {
    // active: false as a literal boolean → never armed.
    useFocusTrap(() => container, false)
    mountCallbacks.forEach((cb) => {
      cb()
    })
    await tick()

    btn3.focus()
    const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    const prevented = vi.spyOn(e, 'preventDefault')
    document.dispatchEvent(e)
    expect(prevented).not.toHaveBeenCalled()
  })

  it('accepts a plain boolean true active', async () => {
    useFocusTrap(() => container, true)
    mountCallbacks.forEach((cb) => {
      cb()
    })
    await tick()

    btn3.focus()
    const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    const prevented = vi.spyOn(e, 'preventDefault')
    document.dispatchEvent(e)
    expect(prevented).toHaveBeenCalled()
  })

  it('accepts the options-object form for active', async () => {
    const active = signal(true)
    useFocusTrap(() => container, { active: () => active() })
    mountCallbacks.forEach((cb) => {
      cb()
    })
    await tick()

    btn3.focus()
    const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    const prevented = vi.spyOn(e, 'preventDefault')
    document.dispatchEvent(e)
    expect(prevented).toHaveBeenCalled()

    // Deactivate — the listener detaches, edge Tab is a no-op again.
    active.set(false)
    await tick()
    btn3.focus()
    const e2 = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    const p2 = vi.spyOn(e2, 'preventDefault')
    document.dispatchEvent(e2)
    expect(p2).not.toHaveBeenCalled()
  })

  // --- initial focus --------------------------------------------------------

  it('moves focus to the first focusable on activate when initialFocus:true', async () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    expect(document.activeElement).toBe(outside)

    useFocusTrap(() => container, { initialFocus: true })
    mountCallbacks.forEach((cb) => {
      cb()
    })
    await tick()

    expect(document.activeElement).toBe(btn1)
    document.body.removeChild(outside)
  })

  it('focuses a specific node when initialFocus is a selector', async () => {
    btn2.id = 'target'
    useFocusTrap(() => container, { initialFocus: '#target' })
    mountCallbacks.forEach((cb) => {
      cb()
    })
    await tick()
    expect(document.activeElement).toBe(btn2)
  })

  it('focuses the element returned by an initialFocus getter', async () => {
    useFocusTrap(() => container, { initialFocus: () => btn3 })
    mountCallbacks.forEach((cb) => {
      cb()
    })
    await tick()
    expect(document.activeElement).toBe(btn3)
  })

  it('focuses an element passed directly as initialFocus', async () => {
    useFocusTrap(() => container, { initialFocus: btn2 })
    mountCallbacks.forEach((cb) => {
      cb()
    })
    await tick()
    expect(document.activeElement).toBe(btn2)
  })

  it('does not steal focus that is already inside the container', async () => {
    btn2.focus()
    useFocusTrap(() => container, { initialFocus: true })
    mountCallbacks.forEach((cb) => {
      cb()
    })
    await tick()
    // Focus was already on btn2 (inside) → initialFocus is skipped.
    expect(document.activeElement).toBe(btn2)
  })

  it('leaves focus untouched by default (backward-compatible)', async () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()

    useFocusTrap(() => container)
    mountCallbacks.forEach((cb) => {
      cb()
    })
    await tick()

    // No initialFocus → focus stays exactly where it was.
    expect(document.activeElement).toBe(outside)
    document.body.removeChild(outside)
  })
})

// getFocusable is a pure DOM query (no focus / layout dependency for the
// selector + attribute/inline-CSS filters), so it is reliably assertable in
// happy-dom. Real focus semantics (contenteditable / video focusability,
// checkVisibility, zero-size) are covered by the *.browser.test.tsx sibling.
describe('getFocusable — robust query', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  const ids = (els: HTMLElement[]) => els.map((el) => el.id)

  it('includes contenteditable and generic [tabindex] elements', () => {
    container.innerHTML = `
      <button id="b">x</button>
      <div id="ce" contenteditable="true">edit</div>
      <div id="ti" tabindex="0">custom</div>
    `
    expect(ids(getFocusable(container))).toEqual(['b', 'ce', 'ti'])
  })

  it('excludes contenteditable="false"', () => {
    container.innerHTML = `
      <div id="ce" contenteditable="false">not editable</div>
      <button id="b">x</button>
    `
    expect(ids(getFocusable(container))).toEqual(['b'])
  })

  it('skips [hidden], display:none, and visibility:hidden nodes', () => {
    container.innerHTML = `
      <button id="b1">x</button>
      <button id="hidden-attr" hidden>x</button>
      <button id="display-none" style="display:none">x</button>
      <button id="vis-hidden" style="visibility:hidden">x</button>
      <button id="b2">x</button>
    `
    expect(ids(getFocusable(container))).toEqual(['b1', 'b2'])
  })

  it('skips nodes inside an [inert] subtree', () => {
    container.innerHTML = `
      <button id="b1">x</button>
      <div inert><button id="inert-btn">x</button></div>
      <button id="b2">x</button>
    `
    expect(ids(getFocusable(container))).toEqual(['b1', 'b2'])
  })

  it('excludes tabindex="-1" on ANY element (not just generic [tabindex])', () => {
    container.innerHTML = `
      <a id="a" href="#" tabindex="-1">x</a>
      <button id="b" tabindex="-1">x</button>
      <button id="ok">x</button>
    `
    expect(ids(getFocusable(container))).toEqual(['ok'])
  })

  it('orders positive tabindex first (ascending), then natural order', () => {
    container.innerHTML = `
      <button id="natural-a">x</button>
      <button id="pos-2" tabindex="2">x</button>
      <button id="natural-b">x</button>
      <button id="pos-1" tabindex="1">x</button>
    `
    expect(ids(getFocusable(container))).toEqual([
      'pos-1',
      'pos-2',
      'natural-a',
      'natural-b',
    ])
  })

  it('skips form controls disabled by an ancestor <fieldset disabled>', () => {
    container.innerHTML = `
      <fieldset disabled>
        <legend><button id="in-legend">still active</button></legend>
        <input id="disabled-input" />
      </fieldset>
      <button id="ok">x</button>
    `
    expect(ids(getFocusable(container))).toEqual(['in-legend', 'ok'])
  })

  it('skips ALL controls of a legend-less <fieldset disabled>', () => {
    container.innerHTML = `
      <fieldset disabled><input id="a" /><button id="b">x</button></fieldset>
      <button id="ok">x</button>
    `
    expect(ids(getFocusable(container))).toEqual(['ok'])
  })

  it('treats a non-numeric tabindex as natural order (does not throw)', () => {
    container.innerHTML = `
      <button id="pos" tabindex="1">x</button>
      <div id="bad" tabindex="not-a-number">x</div>
      <button id="natural">x</button>
    `
    // "not-a-number" parses to NaN → tabbable, natural-order (after the
    // positive-tabindex group).
    expect(ids(getFocusable(container))).toEqual(['pos', 'bad', 'natural'])
  })
})
