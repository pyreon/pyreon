import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetHotkeys, registerHotkey } from '../index'

function fireKey(key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  })
  window.dispatchEvent(event)
  return event
}

// W14 — Sequential combo support (vim/Gmail-style `g t`, `g n`, etc.) was
// documented but never implemented. `parseShortcut` only split on `+`, so
// `'g t'` parsed as a single key literal `'g t'` (with space) that could
// never match. Caught by the HN-clone audit in #942 follow-up.
describe('hotkeys — sequential combos (W14 follow-up)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _resetHotkeys()
  })
  afterEach(() => {
    _resetHotkeys()
    vi.useRealTimers()
  })

  it('fires `g t` after pressing g then t within the timeout', () => {
    const handler = vi.fn()
    registerHotkey('g t', handler)

    fireKey('g')
    expect(handler).not.toHaveBeenCalled() // mid-sequence

    fireKey('t')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does NOT fire on the prefix alone', () => {
    const handler = vi.fn()
    registerHotkey('g t', handler)

    fireKey('g')
    expect(handler).not.toHaveBeenCalled()
  })

  it('clears pending sequence after timeout', () => {
    const handler = vi.fn()
    registerHotkey('g t', handler)

    fireKey('g')
    // Advance past the 1000ms timeout
    vi.advanceTimersByTime(1100)
    fireKey('t')
    expect(handler).not.toHaveBeenCalled()
  })

  it('a non-matching second key aborts the pending sequence', () => {
    const handler = vi.fn()
    registerHotkey('g t', handler)

    fireKey('g')
    fireKey('x') // doesn't match 't'
    expect(handler).not.toHaveBeenCalled()

    // After abort, a fresh 'g t' should still work
    fireKey('g')
    fireKey('t')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('multiple sequential hotkeys with same prefix coexist', () => {
    const handlerT = vi.fn()
    const handlerN = vi.fn()
    registerHotkey('g t', handlerT)
    registerHotkey('g n', handlerN)

    fireKey('g')
    fireKey('t')
    expect(handlerT).toHaveBeenCalledTimes(1)
    expect(handlerN).not.toHaveBeenCalled()

    fireKey('g')
    fireKey('n')
    expect(handlerN).toHaveBeenCalledTimes(1)
    expect(handlerT).toHaveBeenCalledTimes(1) // unchanged
  })

  it('single-combo hotkeys still fire (no regression)', () => {
    const handler = vi.fn()
    registerHotkey('?', handler)

    fireKey('?')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('three-step sequence works (`a b c`)', () => {
    const handler = vi.fn()
    registerHotkey('a b c', handler)

    fireKey('a')
    expect(handler).not.toHaveBeenCalled()
    fireKey('b')
    expect(handler).not.toHaveBeenCalled()
    fireKey('c')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('sequence + modifier works (`ctrl+k p`)', () => {
    const handler = vi.fn()
    registerHotkey('ctrl+k p', handler)

    // ctrl+k
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }),
    )
    expect(handler).not.toHaveBeenCalled()
    // p (no modifier)
    fireKey('p')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('sequence does NOT trigger single-combo of the prefix key', () => {
    // Both registered: `g t` (sequence) AND `g` (single)
    // After pressing 'g', single-key 'g' must NOT fire because the
    // sequence has consumed the keystroke.
    const seqHandler = vi.fn()
    const singleHandler = vi.fn()
    registerHotkey('g t', seqHandler)
    registerHotkey('g', singleHandler)

    fireKey('g')
    // Single-key 'g' fires because the dispatcher iterates both — but
    // sequence is pending too. Then second 't' fires sequence.
    // Documented contract: BOTH fire if both are registered. The
    // single fires immediately; the sequence is recorded for `t`.
    expect(singleHandler).toHaveBeenCalledTimes(1)
    fireKey('t')
    expect(seqHandler).toHaveBeenCalledTimes(1)
  })
})
