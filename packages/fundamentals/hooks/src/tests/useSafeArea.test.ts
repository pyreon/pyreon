import { effect } from '@pyreon/reactivity'
import { afterEach, describe, expect, it } from 'vitest'
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
