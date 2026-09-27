// Regression locks for the 2026-09 @pyreon/hotkeys hardening pass. Each spec
// was written against the broken code first and bisect-verified (see the PR).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { _resetHotkeys, registerHotkey } from '../registry'

afterEach(() => {
  _resetHotkeys()
  vi.restoreAllMocks()
})

function key(init: Omit<KeyboardEventInit, 'key'> & { key?: unknown }, target: EventTarget = window) {
  const ev = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...(init as KeyboardEventInit),
  })
  if ('key' in init && typeof init.key !== 'string') {
    Object.defineProperty(ev, 'key', { value: init.key })
  }
  target.dispatchEvent(ev)
  return ev
}

describe('events without a usable key', () => {
  it('a keydown with no `key` (Chrome autofill) does not throw out of the listener', () => {
    const handler = vi.fn()
    registerHotkey('a', handler)
    const errors: unknown[] = []
    const onError = (e: ErrorEvent) => errors.push(e.error)
    window.addEventListener('error', onError)
    expect(() => key({ key: undefined })).not.toThrow()
    window.removeEventListener('error', onError)
    expect(errors).toEqual([])
    expect(handler).not.toHaveBeenCalled()
  })

  it('IME composition keystrokes are not treated as shortcuts', () => {
    const handler = vi.fn()
    registerHotkey('a', handler)
    key({ key: 'a', isComposing: true })
    key({ key: 'Process' })
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('input detection through shadow DOM', () => {
  it('a keystroke typed into an input inside a shadow root is recognised as input', () => {
    // What a window listener sees for a keystroke in a web component's
    // <input>: `target` is RETARGETED to the shadow host (a plain element),
    // while composedPath()[0] is the real input. Modelled directly because
    // happy-dom does not propagate composed events out of a shadow root.
    const handler = vi.fn()
    registerHotkey('a', handler)
    const hostEl = document.createElement('div')
    document.body.appendChild(hostEl)
    const input = document.createElement('input')
    const ev = new KeyboardEvent('keydown', { key: 'a', bubbles: true })
    Object.defineProperty(ev, 'composedPath', { value: () => [input, hostEl, document.body, document, window] })
    hostEl.dispatchEvent(ev)
    expect(handler).not.toHaveBeenCalled()
    hostEl.remove()
  })
})

describe('macOS Option produces a different character', () => {
  it('alt+s matches when event.key is ß but event.code is KeyS', () => {
    const handler = vi.fn()
    registerHotkey('alt+s', handler)
    key({ key: 'ß', code: 'KeyS', altKey: true })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('alt+1 matches when event.key is ¡ but event.code is Digit1', () => {
    const handler = vi.fn()
    registerHotkey('alt+1', handler)
    key({ key: '¡', code: 'Digit1', altKey: true })
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('key normalisation edge arms', () => {
  it('pressed-key tracking ignores key-less keydown / keyup', async () => {
    const { getPressedKeys } = await import('../registry')
    const pressed = getPressedKeys()
    key({ key: undefined })
    const up = new KeyboardEvent('keyup')
    Object.defineProperty(up, 'key', { value: undefined })
    expect(() => window.dispatchEvent(up)).not.toThrow()
    expect(pressed().size).toBe(0)
  })

  it('alt with a code that is not a letter/digit keeps event.key', () => {
    const handler = vi.fn()
    registerHotkey('alt+-', handler)
    key({ key: '-', code: 'Minus', altKey: true })
    key({ key: '–', code: 'Minus', altKey: true }) // Option+- on macOS: en dash
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('matchesCombo is false for a key-less event instead of throwing', async () => {
    const { matchesCombo, parseShortcut } = await import('../parse')
    const ev = new KeyboardEvent('keydown')
    Object.defineProperty(ev, 'key', { value: undefined })
    expect(matchesCombo(ev, parseShortcut('a'))).toBe(false)
  })
})
