/**
 * The registry caches parsed shortcuts (registration repeats the same strings
 * on every remount). These specs lock what the cache must not change:
 * `mod` still resolves per platform, the public `parseShortcut` still returns
 * a fresh object, the registered list keeps registration order, and
 * registration keeps working past the cache bound.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { parseShortcut } from '../parse'
import { _resetHotkeys, getRegisteredHotkeys, registerHotkey } from '../registry'

const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15'
const original = globalThis.navigator
const setUA = (userAgent: string) =>
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent }, configurable: true })
const press = (init: KeyboardEventInit) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }))

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', { value: original, configurable: true })
  _resetHotkeys()
})

describe('registry parse cache', () => {
  it('resolves `mod` for the platform current at registration, not the first one cached', () => {
    let hits = 0
    setUA(LINUX)
    const off = registerHotkey('mod+k', () => hits++)
    press({ key: 'k', ctrlKey: true })
    expect(hits).toBe(1)
    off()

    setUA(MAC)
    registerHotkey('mod+k', () => hits++)
    press({ key: 'k', metaKey: true })
    expect(hits).toBe(2)
    press({ key: 'k', ctrlKey: true })
    expect(hits).toBe(2)
  })

  it('parseShortcut still returns a fresh, mutable object after a cached registration', () => {
    registerHotkey('ctrl+s', () => {})
    const a = parseShortcut('ctrl+s')
    const b = parseShortcut('ctrl+s')
    expect(a).not.toBe(b)
    expect(Object.isFrozen(a)).toBe(false)
    a.key = 'x'
    expect(parseShortcut('ctrl+s').key).toBe('s')
  })

  it('keeps registration order in the registered list after removing a middle entry', () => {
    registerHotkey('ctrl+a', () => {})
    const offB = registerHotkey('ctrl+b', () => {})
    registerHotkey('ctrl+c', () => {})
    offB()
    registerHotkey('ctrl+d', () => {})
    expect(getRegisteredHotkeys().map((h) => h.shortcut)).toEqual(['ctrl+a', 'ctrl+c', 'ctrl+d'])
  })

  it('keeps firing the right handler past the cache bound', () => {
    const fired: string[] = []
    for (let i = 0; i < 300; i++) registerHotkey(`ctrl+shift+f${(i % 12) + 1}x${i}`, () => {})
    registerHotkey('ctrl+q', () => fired.push('q'))
    press({ key: 'q', ctrlKey: true })
    expect(fired).toEqual(['q'])
  })
})
