/**
 * Coverage-restoring tests for the #2451 sweep's thin arms (the Coverage
 * (Full) main gate caught the drift): the `ctrl+,` comma-KEY re-attach in
 * the comma-list splitter, the all-separator pathological input, the
 * pressed-keys tracking handlers (down dedupe / up missing-key / blur
 * clear), and `isKeyPressed` with bare modifier names.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPressedKeys, isKeyPressed, registerHotkey } from '../index'

const key = (type: 'keydown' | 'keyup', k: string, rest: KeyboardEventInit = {}) => {
  window.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true, ...rest }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('comma-list splitter — comma-as-KEY re-attach', () => {
  it("'ctrl+,' fires on Ctrl+comma (the trailing '+' segment re-attaches the comma)", () => {
    const fn = vi.fn()
    const un = registerHotkey('ctrl+,', fn)
    key('keydown', ',', { ctrlKey: true })
    expect(fn).toHaveBeenCalledTimes(1)
    un()
  })

  it("a comma-LIST with a comma key ('ctrl+,, mod+p') registers both", () => {
    const fn = vi.fn()
    const un = registerHotkey('ctrl+,, ctrl+p', fn)
    key('keydown', ',', { ctrlKey: true })
    key('keydown', 'p', { ctrlKey: true })
    expect(fn).toHaveBeenCalledTimes(2)
    un()
  })

  it("a bare ',' registers the comma key — the all-separator fallback hands the ORIGINAL through", () => {
    // ',' splits into ['', ''] (all-empty) → the splitter's fallback returns
    // the original input, which parses as the comma KEY — deliberate: the
    // fallback exists so downstream errors (or valid parses, as here) name
    // what the caller actually passed.
    const fn = vi.fn()
    const un = registerHotkey(',', fn)
    key('keydown', ',')
    expect(fn).toHaveBeenCalledTimes(1)
    un()
  })
})

describe('pressed-keys tracking', () => {
  it('getPressedKeys tracks down/up incl. the dedupe + missing-key guards', () => {
    const pressed = getPressedKeys()
    key('keydown', 'a')
    expect(pressed().has('a')).toBe(true)
    // Repeat down for a held key — the has() dedupe arm (no new Set churn).
    key('keydown', 'a')
    expect(pressed().has('a')).toBe(true)
    key('keyup', 'a')
    expect(pressed().has('a')).toBe(false)
    // keyup for a key never tracked — the !has() guard arm.
    key('keyup', 'q')
    expect(pressed().has('q')).toBe(false)
  })

  it('window blur clears held keys (and is a no-op when already empty)', () => {
    const pressed = getPressedKeys()
    key('keydown', 'x')
    expect(pressed().size).toBeGreaterThan(0)
    window.dispatchEvent(new Event('blur'))
    expect(pressed().size).toBe(0)
    // Second blur with empty set — the early-return arm.
    window.dispatchEvent(new Event('blur'))
    expect(pressed().size).toBe(0)
  })

  it('isKeyPressed accepts bare modifier names (ctrl/shift/alt/meta → event key names)', () => {
    key('keydown', 'Control')
    expect(isKeyPressed('ctrl')).toBe(true)
    key('keyup', 'Control')
    expect(isKeyPressed('ctrl')).toBe(false)

    key('keydown', 'Shift')
    expect(isKeyPressed('shift')).toBe(true)
    key('keyup', 'Shift')

    key('keydown', 'Alt')
    expect(isKeyPressed('alt')).toBe(true)
    key('keyup', 'Alt')

    key('keydown', 'Meta')
    expect(isKeyPressed('meta')).toBe(true)
    key('keyup', 'Meta')
  })

  it('isKeyPressed with a plain key reads the tracked set', () => {
    key('keydown', 'z')
    expect(isKeyPressed('z')).toBe(true)
    key('keyup', 'z')
    expect(isKeyPressed('z')).toBe(false)
  })
})

describe('trigger() remaining arms', () => {
  it('fires a keyup-registered hotkey and unregisters a once entry mid-loop', async () => {
    const { registerHotkey: reg, trigger } = await import('../index')
    const fn = vi.fn()
    const un = reg('ctrl+u', fn, { event: 'keyup', once: true })
    expect(trigger('ctrl+u')).toBe(1)
    // once → auto-unregistered; a second trigger fires nothing.
    expect(trigger('ctrl+u')).toBe(0)
    un()
  })

  it('sequence mismatch: a registered "g x" does not fire for trigger("g t")', async () => {
    const { registerHotkey: reg, trigger } = await import('../index')
    const fn = vi.fn()
    const un = reg('g x', fn)
    expect(trigger('g t')).toBe(0)
    // Same last-key different sequence length exercises sameSequence's
    // length arm; same length different combo exercises the combo arm.
    const fn2 = vi.fn()
    const un2 = reg('h t', fn2)
    expect(trigger('g t')).toBe(0)
    un()
    un2()
  })

  it("isKeyPressed('') returns false (no key, no modifier — the empty fallback)", () => {
    expect(isKeyPressed('')).toBe(false)
  })
})

describe('trigger() bucket/combo miss arms', () => {
  it('same-key bucket, different modifiers → sameCombo miss (0 fired)', async () => {
    const { registerHotkey: reg, trigger } = await import('../index')
    const fn = vi.fn()
    const un = reg('ctrl+x', fn)
    expect(trigger('alt+x')).toBe(0)
    un()
  })

  it('no bucket for the key at all → 0 fired', async () => {
    const { trigger } = await import('../index')
    expect(trigger('alt+f9')).toBe(0)
  })
})
