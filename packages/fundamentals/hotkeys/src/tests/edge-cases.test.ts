import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseShortcut } from '../parse'
import { registerHotkey } from '../registry'

describe('parse.ts — mod resolves to ctrl on non-Mac', () => {
  const original = globalThis.navigator
  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: original,
      configurable: true,
    })
  })

  it('mod → ctrl when navigator.userAgent is not Mac (line 46)', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
      configurable: true,
    })
    const combo = parseShortcut('mod+s')
    expect(combo.ctrl).toBe(true)
    expect(combo.meta).toBe(false)
  })

  it('mod → meta when navigator.userAgent contains "mac"', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15' },
      configurable: true,
    })
    const combo = parseShortcut('mod+s')
    expect(combo.meta).toBe(true)
    expect(combo.ctrl).toBe(false)
  })
})

describe('registry.ts — empty shortcut throw paths', () => {
  it('throws on empty-string shortcut (line 194)', () => {
    expect(() => registerHotkey('', () => {})).toThrow(/empty shortcut/)
  })

  it('throws on whitespace-only shortcut', () => {
    expect(() => registerHotkey('   ', () => {})).toThrow(/empty shortcut/)
  })
})
