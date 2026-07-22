/**
 * Unit coverage for useFocusTrap's trap SCOPE STACK + focusin containment
 * (the real-browser contract lives in useFocusTrap.browser.test.ts — this
 * file drives the same code paths under happy-dom with synthetic events for
 * the node/coverage suite).
 */
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
import { useFocusTrap } from '../useFocusTrap'

const tick = () => new Promise<void>((r) => queueMicrotask(r))

/** Arm a trap and return ITS disposer (so single traps can be popped). */
function armTrap(
  ...args: Parameters<typeof useFocusTrap>
): () => void {
  useFocusTrap(...args)
  mountCallbacks.splice(0).forEach((cb) => {
    cb()
  })
  const own = unmountCallbacks.splice(0)
  return () => {
    own.forEach((cb) => {
      cb()
    })
  }
}

function makeContainer(ids: string[]): HTMLDivElement {
  const c = document.createElement('div')
  for (const id of ids) {
    const b = document.createElement('button')
    b.id = id
    c.appendChild(b)
  }
  document.body.appendChild(c)
  return c
}

function pressTab(shift = false): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true })
  document.dispatchEvent(e)
  return e
}

function fireFocusIn(target: Element): void {
  target.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
}

const disposers: Array<() => void> = []

afterEach(() => {
  disposers.splice(0).forEach((d) => {
    d()
  })
  // Anything the mocks queued but a spec didn't arm.
  unmountCallbacks.splice(0).forEach((cb) => {
    cb()
  })
  document.body.innerHTML = ''
})

beforeEach(() => {
  mountCallbacks = []
  unmountCallbacks = []
})

describe('useFocusTrap — trap scope stack', () => {
  it('only the TOP trap handles Tab; disposing it reactivates the one beneath', async () => {
    const a = makeContainer(['a1', 'a2'])
    const b = makeContainer(['b1', 'b2'])
    disposers.push(armTrap(() => a))
    const disposeB = armTrap(() => b)

    // Top trap (B) wraps within B.
    const b2 = b.querySelector<HTMLButtonElement>('#b2')!
    b2.focus()
    pressTab()
    expect(document.activeElement).toBe(b.querySelector('#b1'))

    // Pop B → A owns focus again.
    disposeB()
    const a2 = a.querySelector<HTMLButtonElement>('#a2')!
    a2.focus()
    await tick() // drain any queued recapture before asserting the wrap
    pressTab()
    expect(document.activeElement).toBe(a.querySelector('#a1'))
  })

  it('skips a stacked frame whose container is unmounted (getEl → null)', () => {
    const a = makeContainer(['a1', 'a2'])
    disposers.push(armTrap(() => a))
    // A lifetime-armed trap over a CLOSED dialog sits on top with a null el.
    disposers.push(armTrap(() => null))

    const a2 = a.querySelector<HTMLButtonElement>('#a2')!
    a2.focus()
    pressTab()
    expect(document.activeElement).toBe(a.querySelector('#a1'))
  })

  it('skips a stacked frame whose non-reactive active getter flipped false', () => {
    const a = makeContainer(['a1', 'a2'])
    const b = makeContainer(['b1', 'b2'])
    disposers.push(armTrap(() => a))
    let on = true
    disposers.push(armTrap(() => b, () => on))

    on = false // untracked flip — frame stays pushed, isActive() re-check skips it
    const a2 = a.querySelector<HTMLButtonElement>('#a2')!
    a2.focus()
    pressTab()
    expect(document.activeElement).toBe(a.querySelector('#a1'))
  })
})

describe('useFocusTrap — focusin containment', () => {
  it('recaptures focus that lands outside the container', async () => {
    const outside = document.createElement('button')
    outside.id = 'outside'
    document.body.appendChild(outside)
    const c = makeContainer(['c1', 'c2'])
    disposers.push(armTrap(() => c))

    outside.focus()
    fireFocusIn(outside)
    await tick()
    expect(document.activeElement).toBe(c.querySelector('#c1'))
  })

  it('recaptures to [data-autofocus] when present', async () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    const c = makeContainer(['c1', 'c2'])
    c.querySelector('#c2')!.setAttribute('data-autofocus', '')
    disposers.push(armTrap(() => c))

    outside.focus()
    fireFocusIn(outside)
    await tick()
    expect(document.activeElement).toBe(c.querySelector('#c2'))
  })

  it('falls back to the container itself when nothing is tabbable', async () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    const c = document.createElement('div')
    c.setAttribute('tabindex', '-1')
    document.body.appendChild(c)
    disposers.push(armTrap(() => c))

    outside.focus()
    fireFocusIn(outside)
    await tick()
    expect(document.activeElement).toBe(c)
  })

  it('does not recapture when the focusin target is inside the container', async () => {
    const c = makeContainer(['c1', 'c2'])
    disposers.push(armTrap(() => c))

    const c2 = c.querySelector<HTMLButtonElement>('#c2')!
    c2.focus()
    fireFocusIn(c2)
    await tick()
    expect(document.activeElement).toBe(c2)
  })

  it('dedupes a burst of focusin events into one queued recapture', async () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    const c = makeContainer(['c1'])
    disposers.push(armTrap(() => c))
    const focusSpy = vi.spyOn(c.querySelector<HTMLButtonElement>('#c1')!, 'focus')

    outside.focus()
    fireFocusIn(outside)
    fireFocusIn(outside)
    fireFocusIn(outside)
    await tick()
    expect(focusSpy).toHaveBeenCalledTimes(1)
  })

  it('aborts a queued recapture when the trap was disposed before it ran', async () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    const c = makeContainer(['c1'])
    const dispose = armTrap(() => c)

    outside.focus()
    fireFocusIn(outside)
    dispose() // same-flush close: by microtask time the stack is empty
    await tick()
    expect(document.activeElement).toBe(outside)
  })

  it('aborts a queued recapture when focus moved back inside before it ran', async () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    const c = makeContainer(['c1', 'c2'])
    disposers.push(armTrap(() => c))
    const c1 = c.querySelector<HTMLButtonElement>('#c1')!
    const focusSpy = vi.spyOn(c1, 'focus')

    outside.focus()
    fireFocusIn(outside)
    c.querySelector<HTMLButtonElement>('#c2')!.focus() // back inside pre-microtask
    await tick()
    expect(focusSpy).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(c.querySelector('#c2'))
  })

  it('recaptures when the reactive `active` arms a trap with focus already outside', async () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    const c = makeContainer(['c1'])
    const active = signal(false)
    disposers.push(armTrap(() => c, () => active()))

    outside.focus()
    fireFocusIn(outside)
    await tick()
    // Inactive: no frame in the stack, nothing recaptures.
    expect(document.activeElement).toBe(outside)

    active.set(true)
    await tick()
    fireFocusIn(outside)
    await tick()
    expect(document.activeElement).toBe(c.querySelector('#c1'))
  })
})

describe('useFocusTrap — initialFocus [data-autofocus]', () => {
  it('initialFocus:true prefers a [data-autofocus] descendant over the first tabbable', () => {
    const c = makeContainer(['d1', 'd2'])
    c.querySelector('#d2')!.setAttribute('data-autofocus', '')
    disposers.push(armTrap(() => c, { initialFocus: true }))
    expect(document.activeElement).toBe(c.querySelector('#d2'))
  })
})
