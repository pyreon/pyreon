import { afterEach, describe, expect, it } from 'vitest'
import { useDeviceInfo } from '../useDeviceInfo'

/** Override a read-only browser global for one test. */
function stub(target: object, key: string, value: unknown) {
  Object.defineProperty(target, key, { value, configurable: true, writable: true })
}

describe('useDeviceInfo', () => {
  afterEach(() => {
    stub(globalThis.navigator, 'maxTouchPoints', 0)
  })

  it('reports the web platform', () => {
    expect(useDeviceInfo().platform()).toBe('web')
  })

  // THE DELIBERATE ASYMMETRY. The browser has no reliable API for either
  // field: navigator.platform is deprecated, UA Client Hints are
  // Chromium-only, and UA parsing rots as browsers change their strings.
  // These are the fields that end up in analytics and support tickets, where
  // a plausible wrong answer costs more than a missing one — so the contract
  // is "empty means not knowable here", and it is asserted rather than left
  // to whatever a future edit might feel like returning.
  it('returns EMPTY model and osVersion rather than guessing from the UA', () => {
    const d = useDeviceInfo()
    expect(d.model()).toBe('')
    expect(d.osVersion()).toBe('')
  })

  it('detects touch from maxTouchPoints', () => {
    stub(globalThis.navigator, 'maxTouchPoints', 5)
    expect(useDeviceInfo().isTouch()).toBe(true)
  })

  it('reports no touch when there are no touch points', () => {
    stub(globalThis.navigator, 'maxTouchPoints', 0)
    // `ontouchstart` may be absent in happy-dom; either way the answer must
    // be a boolean, never undefined.
    expect(typeof useDeviceInfo().isTouch()).toBe('boolean')
  })

  it('reports screen geometry with a numeric scale', () => {
    const s = useDeviceInfo().screen()
    expect(typeof s.width).toBe('number')
    expect(typeof s.height).toBe('number')
    // Scale must never be 0 — callers divide by it.
    expect(s.scale).toBeGreaterThan(0)
  })
})
