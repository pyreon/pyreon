import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatCombo, parseShortcut } from '../parse'
import { _resetHotkeys, registerHotkey } from '../registry'

// ─── parse.ts — formatCombo Mac (⌘) arm + navigator-undefined guard ──────────

describe('parse.ts — formatCombo / isMac coverage', () => {
  const originalNavigator = globalThis.navigator

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
    })
  })

  it('formatCombo shows ⌘ for meta on Mac (cond-expr@L79 Mac arm)', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15' },
      configurable: true,
    })
    const result = formatCombo(parseShortcut('meta+k'))
    expect(result).toContain('⌘')
    expect(result).not.toContain('Meta')
  })

  it('isMac returns false when navigator is undefined (if@L89 true arm)', () => {
    // formatCombo with meta calls isMac(); with navigator undefined, isMac
    // takes its `typeof navigator === 'undefined' → return false` guard, so
    // the non-Mac branch renders "Meta".
    Object.defineProperty(globalThis, 'navigator', {
      value: undefined,
      configurable: true,
    })
    const result = formatCombo(parseShortcut('meta+k'))
    expect(result).toContain('Meta')
    expect(result).not.toContain('⌘')
  })
})

// ─── registry.ts — isInputFocused null target (if@L62 true arm) ──────────────

describe('registry.ts — isInputFocused null-target guard', () => {
  beforeEach(() => _resetHotkeys())
  afterEach(() => _resetHotkeys())

  it('treats a null event.target as not-input-focused (if@L62 true arm)', () => {
    let fired = false
    // enableOnInputs defaults to false, so the handler ONLY fires if
    // isInputFocused returns false. We force event.target = null so the
    // `if (!target) return false` guard is exercised.
    registerHotkey('ctrl+s', () => {
      fired = true
    })

    const event = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    // happy-dom assigns window as the target on dispatch; override the getter
    // so the dispatched event reports a null target.
    Object.defineProperty(event, 'target', { value: null, configurable: true })
    window.dispatchEvent(event)

    expect(fired).toBe(true)
  })
})

// ─── registry.ts — sequence preventDefault / stopPropagation arms ────────────

describe('registry.ts — sequence option branches', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _resetHotkeys()
  })
  afterEach(() => {
    _resetHotkeys()
    vi.useRealTimers()
  })

  function dispatch(key: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    window.dispatchEvent(event)
    return event
  }

  it('sequence with preventDefault:false skips preventDefault on BOTH stages (if@L143 + if@L96 false arms)', () => {
    const handler = vi.fn()
    registerHotkey('g t', handler, { preventDefault: false })

    // Stage 2 prefix keystroke: if@L143 false arm — preventDefault NOT called.
    const first = dispatch('g')
    expect(first.defaultPrevented).toBe(false)
    expect(handler).not.toHaveBeenCalled()

    // Stage 1 advance to full match: if@L96 false arm — preventDefault NOT called.
    const second = dispatch('t')
    expect(second.defaultPrevented).toBe(false)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('sequence with stopPropagation:true calls stopPropagation on full match (if@L97 true arm)', () => {
    const handler = vi.fn()
    registerHotkey('g t', handler, { stopPropagation: true })

    dispatch('g')
    expect(handler).not.toHaveBeenCalled()

    // Build the second event ourselves so we can spy on stopPropagation
    // BEFORE dispatch, then assert the if@L97 true arm actually called it.
    const second = new KeyboardEvent('keydown', { key: 't', bubbles: true, cancelable: true })
    const spy = vi.spyOn(second, 'stopPropagation')
    window.dispatchEvent(second)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
