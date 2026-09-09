import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _pauseAll, _reset, _resumeAll, _toasts, LEAVE_DURATION, toast } from '../toast'

// The auto-dismiss clock is held by three INDEPENDENT sources (`hover`,
// `focus`, `hidden`) that overlap in ordinary use. These lock the contract that
// makes overlap survivable: a hold is taken and released BY IDENTITY, and the
// clock only restarts when the last holder lets go.

beforeEach(() => {
  _reset()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  _reset()
})

function only() {
  const t = _toasts()[0]
  if (!t) throw new Error('no toast')
  return t
}

describe('pause holds are per-source', () => {
  it('a hover release does NOT resume while focus is still inside', () => {
    // The shipped shape: a keyboard user tabs into the toast, then the mouse
    // sweeps across the stack and off it again. With one shared flag the
    // `mouseleave` cleared the focus hold and the toast dismissed itself out
    // from under the reader.
    toast('being read', { duration: 4000 })
    _pauseAll('focus')
    _pauseAll('hover')
    _resumeAll('hover')

    expect(only().timer, 'clock restarted while focus was still inside').toBeUndefined()
    vi.advanceTimersByTime(10_000)
    expect(_toasts().length).toBe(1)
    expect(only().state).not.toBe('exiting')

    // Releasing the LAST holder restarts it.
    _resumeAll('focus')
    expect(only().timer).toBeDefined()
    vi.advanceTimersByTime(4000 + LEAVE_DURATION)
    expect(_toasts().length).toBe(0)
  })

  it('a focus release does NOT resume while the pointer is still over the stack', () => {
    toast('hovered', { duration: 4000 })
    _pauseAll('hover')
    _pauseAll('focus')
    _resumeAll('focus')

    vi.advanceTimersByTime(10_000)
    expect(_toasts().length).toBe(1)
  })

  it('a repeated hold from the same source still needs only one release', () => {
    // A `mouseenter` with no intervening `mouseleave` (a re-entrant pointer, a
    // synthetic event, a second Toaster) must not deepen the hold — under a
    // depth counter it would, and the single real `mouseleave` would leave the
    // clock suspended with the banked remainder frozen.
    toast('x', { duration: 4000 })
    vi.advanceTimersByTime(3000) // 1000 left
    _pauseAll('hover')
    vi.advanceTimersByTime(5000)
    _pauseAll('hover') // duplicate enter — must change nothing
    _resumeAll('hover')

    vi.advanceTimersByTime(999)
    expect(_toasts().length, 'a duplicate hold consumed the release').toBe(1)
    vi.advanceTimersByTime(1 + LEAVE_DURATION)
    expect(_toasts().length).toBe(0)
  })

  it('one release clears a source that took its hold twice', () => {
    // The reason holds are an identity SET and not a depth counter. Browsers do
    // not guarantee a `focusout` when the focused element is removed — which an
    // auto-dismiss does routinely — so takes and releases are not reliably
    // balanced. Under a counter this sequence leaves the depth stuck above zero
    // and freezes every later toast for the life of the page; under a set the
    // next release of that source recovers.
    _pauseAll('focus')
    _pauseAll('focus') // a second focusin with no focusout in between
    _resumeAll('focus')

    toast('later', { duration: 100 })
    vi.advanceTimersByTime(100 + LEAVE_DURATION)
    expect(_toasts().length, 'an unbalanced hold froze every later toast').toBe(0)
  })

  it('a hidden tab does not burn the auto-dismiss budget', () => {
    toast('raised just before the tab was backgrounded', { duration: 4000 })
    vi.advanceTimersByTime(1000) // 3000 left
    _pauseAll('hidden')

    vi.advanceTimersByTime(60_000) // a minute in another tab
    expect(_toasts().length, 'the toast expired unseen in a hidden tab').toBe(1)

    _resumeAll('hidden')
    vi.advanceTimersByTime(2999)
    expect(_toasts().length).toBe(1)
    vi.advanceTimersByTime(1 + LEAVE_DURATION)
    expect(_toasts().length).toBe(0)
  })

  it('a toast raised while the tab is hidden waits for the reveal', () => {
    _pauseAll('hidden')
    toast('background event', { duration: 100 })
    vi.advanceTimersByTime(10_000)
    expect(_toasts().length).toBe(1)

    _resumeAll('hidden')
    vi.advanceTimersByTime(100 + LEAVE_DURATION)
    expect(_toasts().length).toBe(0)
  })

  it('_reset drops every outstanding hold', () => {
    _pauseAll('focus')
    _pauseAll('hidden')
    _reset()
    toast('x', { duration: 100 })
    vi.advanceTimersByTime(100 + LEAVE_DURATION)
    expect(_toasts().length, 'a hold survived _reset and froze the next test').toBe(0)
  })
})
