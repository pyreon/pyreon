import { signal } from '@pyreon/reactivity'
import { afterEach, describe, expect, it } from 'vitest'
import { _rsCollapseH } from '../template'

// PR 2 of the partial-collapse build (open-work #1) — happy-dom UNIT
// layer (fast + locally bisect-verifiable). Imports ONLY `../template`
// (template.test.ts style) — NOT `../index`, whose wide cross-package
// re-export graph hits the documented fresh-worktree resolution trap.
//
// Event-path split (honest, per test-environment-parity — both layers):
//   - DELEGATED events (`click`, see `delegate.ts:DELEGATED_EVENTS`)
//     park in a prop-slot that only fires via the root listener
//     `mount()` installs → covered by `rs-collapse-h.browser.test.ts`
//     (real Chromium + real `mount()`, CI-authoritative; can't run in a
//     fresh worktree — `@pyreon/test-utils/browser` needs built lib).
//   - NON-delegated events (`pointerenter`, `mouseenter` — NOT in
//     `DELEGATED_EVENTS`) take `applyEventProp`'s direct
//     `el.addEventListener(name, …)` path → fire on a bare
//     `dispatchEvent` with NO `mount()`. This unit drives the
//     handler-attach delta on THAT path: it still proves `_rsCollapseH`
//     routes residual handlers through the canonical
//     `_bindEvent`→`applyEventProp` path (incl. the exact
//     `onXxx`→lowercase normalization) + composed cleanup — the
//     load-bearing addition vs `_rsCollapse`.
//
// `_rsCollapseH` returns a NativeItem (`{ __isNative, el, cleanup }`);
// `_tpl` runs the bind synchronously at call time, so class + handlers
// are live on `.el` immediately (same direct-NativeItem shape
// `template.test.ts` uses for `_tpl`). Signal writes propagate
// synchronously here (cf. `template.test.ts:_bindText`); a
// `Promise.resolve()` tick covers any microtask-scheduled reactive
// class update defensively.
//
// Bisect-verify (PR body): neutralize the handler loop in
// `_rsCollapseH` (`for (const key in handlers)` body → skip) → the
// handler/normalization/cleanup specs fail with `expected 0 to be 1`
// while every class / mode-flip / no-remount / zero-handler / child
// assertion still passes; restore → 8/8. The asymmetry proves the
// handler re-attach is the load-bearing delta.

const tick = (): Promise<void> => Promise.resolve()

describe('_rsCollapseH (happy-dom unit) — PR 2 partial-collapse runtime', () => {
  const cleanup: Array<() => void> = []
  afterEach(() => {
    for (const u of cleanup.splice(0)) u()
  })

  function place(item: ReturnType<typeof _rsCollapseH>): HTMLElement {
    const el = item.el as HTMLElement
    document.body.appendChild(el)
    cleanup.push(() => {
      item.cleanup?.()
      el.remove()
    })
    return el
  }

  const fire = (el: HTMLElement, type: string): void => {
    el.dispatchEvent(new Event(type, { bubbles: false }))
  }

  it('sets the light class + static children AND fires the peeled handler', () => {
    const isDark = signal(false)
    let enters = 0
    const el = place(
      _rsCollapseH('<button>Save</button>', 'rsh-l', 'rsh-d', () => isDark(), {
        onPointerEnter: () => {
          enters++
        },
      }),
    )
    expect(el.tagName).toBe('BUTTON')
    expect(el.className).toBe('rsh-l')
    expect(el.textContent).toBe('Save')

    fire(el, 'pointerenter')
    expect(enters).toBe(1)
    fire(el, 'pointerenter')
    expect(enters).toBe(2)
  })

  it('normalizes onXxx → lowercase DOM event via the canonical path', () => {
    const isDark = signal(false)
    let enters = 0
    let mouse = 0
    const el = place(
      _rsCollapseH('<button>M</button>', 'rsh-m', 'rsh-m', () => isDark(), {
        // onPointerEnter MUST bind to `pointerenter` (lowercased whole
        // name) — a hand-rolled `addEventListener('pointerEnter', …)`
        // would never fire. onMouseEnter → `mouseenter` likewise.
        onPointerEnter: () => {
          enters++
        },
        onMouseEnter: () => {
          mouse++
        },
      }),
    )
    fire(el, 'pointerenter')
    fire(el, 'mouseenter')
    expect(enters).toBe(1)
    expect(mouse).toBe(1)
    // Wrong-case names must NOT fire (proves real normalization, not luck).
    fire(el, 'pointerEnter')
    fire(el, 'mouseEnter')
    expect(enters).toBe(1)
    expect(mouse).toBe(1)
  })

  it('mode flip swaps the class on the SAME node AND the handler survives the flip', async () => {
    const isDark = signal(false)
    let enters = 0
    const el = place(
      _rsCollapseH('<button>X</button>', 'rsh-l2', 'rsh-d2', () => isDark(), {
        onPointerEnter: () => {
          enters++
        },
      }),
    )
    expect(el.className).toBe('rsh-l2')
    fire(el, 'pointerenter')
    expect(enters).toBe(1)

    isDark.set(true)
    await tick()
    // Same node identity ⇒ reactive class swap, NOT a remount.
    expect(el.className).toBe('rsh-d2')
    // Load-bearing partial-collapse contract: no remount ⇒ the handler
    // bound at construction is still live after the mode flip.
    fire(el, 'pointerenter')
    expect(enters).toBe(2)

    isDark.set(false)
    await tick()
    expect(el.className).toBe('rsh-l2')
  })

  it('cleanup() removes the listener — composed disposer is correct (no leak)', () => {
    const isDark = signal(false)
    let enters = 0
    const item = _rsCollapseH('<button>C</button>', 'rsh-c', 'rsh-c', () => isDark(), {
      onPointerEnter: () => {
        enters++
      },
    })
    const el = item.el as HTMLElement
    document.body.appendChild(el)
    fire(el, 'pointerenter')
    expect(enters).toBe(1)

    item.cleanup?.()
    fire(el, 'pointerenter') // listener removed by the composed disposer
    expect(enters).toBe(1)
    el.remove()
  })

  it('binds MULTIPLE handlers; literal props stay out of the handler set', () => {
    const isDark = signal(false)
    let a = 0
    let b = 0
    const el = place(
      _rsCollapseH('<button>N</button>', 'rsh-n', 'rsh-n', () => isDark(), {
        onPointerEnter: () => {
          a++
        },
        onMouseEnter: () => {
          b++
        },
      }),
    )
    fire(el, 'pointerenter')
    fire(el, 'mouseenter')
    fire(el, 'pointerenter')
    expect(a).toBe(2)
    expect(b).toBe(1)
  })

  it('zero handlers: renders class + children, cleanup is safe (defensive)', async () => {
    const isDark = signal(false)
    const el = place(_rsCollapseH('<button>Z</button>', 'rsh-z', 'rsh-zd', () => isDark(), {}))
    expect(el.className).toBe('rsh-z')
    expect(el.textContent).toBe('Z')
    isDark.set(true)
    await tick()
    expect(el.className).toBe('rsh-zd')
    // cleanup runs via afterEach — must not throw with no handlers.
  })

  it('children bind runs alongside the class + handler binds', () => {
    const isDark = signal(false)
    let enters = 0
    const el = place(
      _rsCollapseH(
        '<button><span></span></button>',
        'rsh-cb',
        'rsh-cbd',
        () => isDark(),
        { onPointerEnter: () => enters++ },
        (root) => {
          ;(root.querySelector('span') as HTMLElement).textContent = 'child'
          return null
        },
      ),
    )
    expect(el.className).toBe('rsh-cb')
    expect((el.querySelector('span') as HTMLElement).textContent).toBe('child')
    fire(el, 'pointerenter')
    expect(enters).toBe(1)
  })

  it('disposes class + handler + child binds together (composition)', () => {
    const isDark = signal(false)
    let enters = 0
    let childDisposed = false
    const item = _rsCollapseH(
      '<button><span></span></button>',
      'rsh-x',
      'rsh-xd',
      () => isDark(),
      { onPointerEnter: () => enters++ },
      () => () => {
        childDisposed = true
      },
    )
    const el = item.el as HTMLElement
    document.body.appendChild(el)
    fire(el, 'pointerenter')
    expect(enters).toBe(1)

    item.cleanup?.()
    expect(childDisposed).toBe(true) // child disposer composed + ran
    fire(el, 'pointerenter')
    expect(enters).toBe(1) // handler disposer ran too
    el.remove()
  })
})
