// `useAppState` — the shared app-lifecycle phase.
//
// This hook had no test at all. Two things are worth pinning:
//
//  1. **The phase mapping.** `'active' | 'inactive' | 'background'` mirrors
//     SwiftUI `ScenePhase` and Android `ProcessLifecycleOwner`, so ONE shared
//     source reads the same value on three targets. `inactive` in particular
//     is easy to lose in a refactor — it is the visible-but-unfocused state,
//     and collapsing it into `active` would silently change native behaviour.
//
//  2. **The listener cleanup.** Three global listeners are registered per
//     call and removed in `onCleanup`. That removal is leak class D in this
//     repo's catalog (event-listener pile-up) — a hook mounted per route or
//     per row leaks one set per mount if it regresses, and nothing observable
//     fails until memory does.

import { effect, signal } from '@pyreon/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppState } from '../useAppState'

/** Drive the two globals `computeAppPhase` reads. */
function setEnv(visibility: 'visible' | 'hidden', focused: boolean) {
  Object.defineProperty(document, 'visibilityState', {
    value: visibility,
    configurable: true,
  })
  vi.spyOn(document, 'hasFocus').mockReturnValue(focused)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useAppState', () => {
  it('reports `active` when visible AND focused', () => {
    setEnv('visible', true)
    expect(useAppState()()).toBe('active')
  })

  it('reports `inactive` when visible but NOT focused', () => {
    // The transitional state. Folding this into `active` would diverge from
    // ScenePhase, where it is a distinct case apps legitimately branch on.
    setEnv('visible', false)
    expect(useAppState()()).toBe('inactive')
  })

  it('reports `background` when hidden, regardless of focus', () => {
    setEnv('hidden', true)
    expect(useAppState()()).toBe('background')
  })

  it('updates reactively when visibility changes', () => {
    setEnv('visible', true)
    const phase = useAppState()
    expect(phase()).toBe('active')

    setEnv('hidden', false)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(phase()).toBe('background')
  })

  it('updates reactively on focus and blur', () => {
    setEnv('visible', false)
    const phase = useAppState()
    expect(phase()).toBe('inactive')

    setEnv('visible', true)
    window.dispatchEvent(new Event('focus'))
    expect(phase()).toBe('active')

    setEnv('visible', false)
    window.dispatchEvent(new Event('blur'))
    expect(phase()).toBe('inactive')
  })

  it('removes ALL THREE listeners on scope disposal (leak class D)', () => {
    setEnv('visible', true)
    const docRemove = vi.spyOn(document, 'removeEventListener')
    const winRemove = vi.spyOn(window, 'removeEventListener')

    // `onCleanup` is collected by the enclosing effect, which is how a
    // component's setup frame registers it — so disposing the effect is the
    // faithful analogue of unmounting.
    const e = effect(() => {
      useAppState()
    })
    e.dispose()

    expect(docRemove).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    expect(winRemove).toHaveBeenCalledWith('focus', expect.any(Function))
    expect(winRemove).toHaveBeenCalledWith('blur', expect.any(Function))
  })

  it('stops updating after disposal — the listeners are really gone', () => {
    // Asserting removeEventListener was CALLED is not the same as asserting
    // the handler is inert: a mismatched function reference would satisfy the
    // spy and still leak. This checks the observable consequence.
    setEnv('visible', true)
    let phase!: () => string
    const e = effect(() => {
      phase = useAppState()
    })
    expect(phase()).toBe('active')

    e.dispose()
    setEnv('hidden', false)
    document.dispatchEvent(new Event('visibilitychange'))

    expect(phase()).toBe('active')
  })

  it('does not accumulate listeners across independent scopes', () => {
    setEnv('visible', true)
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')

    for (let i = 0; i < 3; i++) {
      const e = effect(() => {
        useAppState()
      })
      e.dispose()
    }

    // Every registration is matched by a removal — the balance is the point,
    // not the absolute count.
    const added = add.mock.calls.filter(([e]) => e === 'focus' || e === 'blur').length
    const removed = remove.mock.calls.filter(([e]) => e === 'focus' || e === 'blur').length
    expect(removed).toBe(added)
  })

  it('is unaffected by an unrelated signal write', () => {
    setEnv('visible', true)
    const other = signal(0)
    const phase = useAppState()
    other.set(1)
    expect(phase()).toBe('active')
  })
})
