/**
 * happy-dom UNIT coverage for the `_rsCollapse` / `_rsCollapseDyn` /
 * `_rsCollapseDynH` runtime helpers.
 *
 * The CI-authoritative behavior specs live in the real-Chromium browser
 * suites (`rs-collapse*.browser.test.ts`) — but `.browser.test.*` files
 * are excluded from the node coverage run, so these functions read as
 * UNCOVERED to the `Coverage (Full)` gate (template.ts measured 65.68%
 * statements, dragging the package below its 95% threshold). The helpers
 * are happy-dom-compatible (cloneNode template + renderEffect className
 * + addEventListener), so this unit layer drives the same contracts the
 * browser suites verify — following the `rs-collapse-h.test.ts` pattern
 * (direct NativeItem usage, no `mount()`, non-delegated events only).
 */
import { signal } from '@pyreon/reactivity'
import { afterEach, describe, expect, it } from 'vitest'
import { _rsCollapse, _rsCollapseDyn, _rsCollapseDynH } from '../template'

const tick = (): Promise<void> => Promise.resolve()

type Item = ReturnType<typeof _rsCollapse>

describe('_rsCollapse (happy-dom unit) — full-collapse class flip', () => {
  const cleanup: Array<() => void> = []
  afterEach(() => {
    for (const u of cleanup.splice(0)) u()
  })

  function place(item: Item): HTMLElement {
    const el = item.el as HTMLElement
    document.body.appendChild(el)
    cleanup.push(() => {
      item.cleanup?.()
      el.remove()
    })
    return el
  }

  it('applies the light class initially and flips to dark IN PLACE', async () => {
    const mode = signal(false)
    const item = _rsCollapse('<button>Save</button>', 'btn-light', 'btn-dark', () => mode())
    const el = place(item)
    expect(el.className).toBe('btn-light')
    mode.set(true)
    await tick()
    expect(el.className).toBe('btn-dark')
    // No remount: same node identity after the flip.
    expect(item.el).toBe(el)
  })

  it('composes a bind disposer with the class disposer', async () => {
    const mode = signal(false)
    let bindDisposed = 0
    const item = _rsCollapse('<button>Go</button>', 'a', 'b', () => mode(), (el) => {
      el.setAttribute('data-bound', '1')
      return () => {
        bindDisposed++
      }
    })
    const el = place(item)
    expect(el.getAttribute('data-bound')).toBe('1')
    item.cleanup?.()
    expect(bindDisposed).toBe(1)
    // Post-cleanup mode flips must NOT patch the class anymore.
    const before = el.className
    mode.set(true)
    await tick()
    expect(el.className).toBe(before)
  })
})

describe('_rsCollapseDyn (happy-dom unit) — stride-2 value-major dispatch', () => {
  const cleanup: Array<() => void> = []
  afterEach(() => {
    for (const u of cleanup.splice(0)) u()
  })

  function place(item: Item): HTMLElement {
    const el = item.el as HTMLElement
    document.body.appendChild(el)
    cleanup.push(() => {
      item.cleanup?.()
      el.remove()
    })
    return el
  }

  // classes layout: [v0-light, v0-dark, v1-light, v1-dark]
  const CLASSES = ['primary-l', 'primary-d', 'secondary-l', 'secondary-d'] as const

  it('indexes classes as 2*value + dark and patches on EITHER accessor flip', async () => {
    const value = signal(0)
    const dark = signal(false)
    const item = _rsCollapseDyn('<button>X</button>', CLASSES, () => value(), () => dark())
    const el = place(item)
    expect(el.className).toBe('primary-l')
    value.set(1)
    await tick()
    expect(el.className).toBe('secondary-l')
    dark.set(true)
    await tick()
    expect(el.className).toBe('secondary-d')
    value.set(0)
    await tick()
    expect(el.className).toBe('primary-d')
    expect(item.el).toBe(el) // never remounts
  })

  it('coerces an out-of-range valueIndex to an empty className (graceful)', () => {
    const item = _rsCollapseDyn('<button>X</button>', CLASSES, () => 7, () => false)
    const el = place(item)
    expect(el.className).toBe('')
  })

  it('composes bind disposer + stops patching after cleanup', async () => {
    const value = signal(0)
    let disposed = 0
    const item = _rsCollapseDyn(
      '<button>X</button>',
      CLASSES,
      () => value(),
      () => false,
      (el) => {
        el.setAttribute('data-b', 'y')
        return () => {
          disposed++
        }
      },
    )
    const el = place(item)
    expect(el.getAttribute('data-b')).toBe('y')
    item.cleanup?.()
    expect(disposed).toBe(1)
    value.set(1)
    await tick()
    expect(el.className).toBe('primary-l') // frozen post-cleanup
  })
})

describe('_rsCollapseDynH (happy-dom unit) — dyn dispatch + handler attach', () => {
  const cleanup: Array<() => void> = []
  afterEach(() => {
    for (const u of cleanup.splice(0)) u()
  })

  function place(item: Item): HTMLElement {
    const el = item.el as HTMLElement
    document.body.appendChild(el)
    cleanup.push(() => {
      item.cleanup?.()
      el.remove()
    })
    return el
  }

  const fire = (el: HTMLElement, type: string): void => {
    el.dispatchEvent(new Event(type, { bubbles: true }))
  }

  const CLASSES = ['a-l', 'a-d', 'b-l', 'b-d'] as const

  it('attaches non-delegated handlers AND keeps the dyn class dispatch live', async () => {
    const value = signal(0)
    const dark = signal(false)
    let entered = 0
    const item = _rsCollapseDynH(
      '<button>X</button>',
      CLASSES,
      () => value(),
      () => dark(),
      {
        // pointerenter is NOT in DELEGATED_EVENTS — fires without mount()
        onPointerEnter: () => {
          entered++
        },
      },
    )
    const el = place(item)
    expect(el.className).toBe('a-l')
    fire(el, 'pointerenter')
    expect(entered).toBe(1)
    value.set(1)
    dark.set(true)
    await tick()
    expect(el.className).toBe('b-d')
    // Handler survives class flips (same node, no remount).
    fire(el, 'pointerenter')
    expect(entered).toBe(2)
  })

  it('cleanup detaches handlers and freezes the class', async () => {
    const value = signal(0)
    let entered = 0
    const item = _rsCollapseDynH(
      '<button>X</button>',
      CLASSES,
      () => value(),
      () => false,
      {
        onPointerEnter: () => {
          entered++
        },
      },
    )
    const el = place(item)
    item.cleanup?.()
    fire(el, 'pointerenter')
    expect(entered).toBe(0)
    value.set(1)
    await tick()
    expect(el.className).toBe('a-l')
  })

  it('composes a bind disposer alongside handlers + class', () => {
    let disposed = 0
    const item = _rsCollapseDynH(
      '<span>Y</span>',
      CLASSES,
      () => 0,
      () => false,
      {},
      (el) => {
        el.setAttribute('data-c', 'z')
        return () => {
          disposed++
        }
      },
    )
    const el = place(item)
    expect(el.getAttribute('data-c')).toBe('z')
    item.cleanup?.()
    expect(disposed).toBe(1)
  })
})
