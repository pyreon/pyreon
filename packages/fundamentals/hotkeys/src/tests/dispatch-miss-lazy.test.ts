/**
 * A keystroke with no bound entries is the common case, so dispatch must
 * reject it before any per-event work the matching loop needs — in particular
 * `composedPath()`, which builds an array and is most of a miss's cost.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { _resetHotkeys, registerHotkey } from '../registry'

afterEach(() => _resetHotkeys())

const keydown = (key: string, init: KeyboardEventInit = {}) => {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, ...init })
  let calls = 0
  const real = ev.composedPath.bind(ev)
  // happy-dom's own dispatch also calls composedPath; count only the calls
  // made after it has started the listener phase, i.e. ours.
  let dispatching = false
  Object.defineProperty(ev, 'composedPath', {
    value: () => {
      if (dispatching) calls++
      return real()
    },
  })
  window.addEventListener('keydown', () => (dispatching = true), { capture: true, once: true })
  window.dispatchEvent(ev)
  return calls
}

describe('dispatch miss', () => {
  it('does not read composedPath for a key with no bound entries', () => {
    registerHotkey('ctrl+k', () => {})
    expect(keydown('z', { ctrlKey: true })).toBe(0)
  })

  it('still reads it when a bucket matches, so input focus is honoured', () => {
    let hits = 0
    registerHotkey('ctrl+k', () => hits++)
    expect(keydown('k', { ctrlKey: true })).toBeGreaterThan(0)
    expect(hits).toBe(1)
  })
})
