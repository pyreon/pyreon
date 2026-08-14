import { effect } from '@pyreon/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSafeArea } from '../useSafeArea'

/**
 * Create the hook in a real reactive scope, the way a component's setup frame
 * does — otherwise `onCleanup` is a no-op and each test's probe element and
 * resize listener survive into the next.
 */
const scopes: Array<{ dispose: () => void }> = []
function mountHook() {
  let r!: ReturnType<typeof useSafeArea>
  const e = effect(() => {
    r = useSafeArea()
  })
  scopes.push(e)
  return r
}

describe('useSafeArea', () => {
  afterEach(() => {
    for (const s of scopes.splice(0)) s.dispose()
  })

  it('returns ONE accessor over all four insets', () => {
    const safe = mountHook()
    const v = safe()
    // One accessor, not four: the values move together on rotation, and
    // separate accessors would let a consumer read a torn pair.
    expect(Object.keys(v).sort()).toEqual(['bottom', 'left', 'right', 'top'])
  })

  it('reports numbers, defaulting to zero where nothing is obscured', () => {
    const v = mountHook()()
    for (const k of ['top', 'right', 'bottom', 'left'] as const) {
      expect(typeof v[k]).toBe('number')
      expect(Number.isFinite(v[k])).toBe(true)
    }
  })

  it('UPDATES when the insets change — a rotation moves the notch', () => {
    // The write path was untested: the hook read once at mount and nothing
    // proved it ever reported a change. A safe area that never updates is
    // exactly as broken as one that reads zero, and looks identical at rest.
    const padding = { top: '0px', right: '0px', bottom: '0px', left: '0px' }
    const real = globalThis.getComputedStyle.bind(globalThis)
    vi.spyOn(globalThis, 'getComputedStyle').mockImplementation(((el: Element) => {
      const base = real(el)
      return new Proxy(base, {
        get: (t, k) =>
          k === 'paddingTop' ? padding.top
          : k === 'paddingRight' ? padding.right
          : k === 'paddingBottom' ? padding.bottom
          : k === 'paddingLeft' ? padding.left
          : Reflect.get(t, k),
      })
    }) as typeof globalThis.getComputedStyle)

    const safe = mountHook()
    expect(safe().top).toBe(0)

    padding.top = '47px'
    padding.bottom = '34px'
    window.dispatchEvent(new Event('resize'))

    expect(safe().top).toBe(47)
    expect(safe().bottom).toBe(34)
    vi.restoreAllMocks()
  })

  it('a resize that moved NO inset does not re-notify', () => {
    // Resize fires continuously during a drag; an unconditional write would
    // wake every consumer for a change that never happened.
    const safe = mountHook()
    let fires = 0
    const e = effect(() => {
      safe()
      fires += 1
    })
    scopes.push(e)
    const before = fires

    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('resize'))
    expect(fires).toBe(before)
  })

  it('removes its probe element and listeners on scope disposal', () => {
    const before = document.body.childElementCount
    const e = effect(() => {
      useSafeArea()
    })
    // The probe is appended to body while mounted...
    expect(document.body.childElementCount).toBe(before + 1)
    e.dispose()
    // ...and must not outlive the scope: a probe per mount would accumulate
    // one inert element per component for the life of the page.
    expect(document.body.childElementCount).toBe(before)
  })
})
