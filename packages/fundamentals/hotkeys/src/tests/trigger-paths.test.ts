/**
 * `trigger()` runs a bound action without a real key event. These are the
 * paths a command palette hits that ordinary key tests do not: an empty
 * shortcut, a scope filter that must EXCLUDE a match, a sequence (whose event
 * carries the LAST combo's key), and a list of nothing but separators.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { _resetHotkeys, enableScope, registerHotkey, splitShortcutList, trigger } from '../index'

afterEach(() => _resetHotkeys())

describe('trigger', () => {
  it('fires nothing for an empty shortcut', () => {
    registerHotkey('k', () => {})
    expect(trigger('')).toBe(0)
    expect(trigger('   ')).toBe(0)
  })

  it('an explicit scope excludes a match registered in another scope', () => {
    const inEditor = vi.fn()
    enableScope('editor')
    registerHotkey('k', inEditor, { scope: 'editor' })
    expect(trigger('k', { scope: 'modal' })).toBe(0)
    expect(inEditor).not.toHaveBeenCalled()
    expect(trigger('k', { scope: 'editor' })).toBe(1)
  })

  it('a sequence fires with the last combo as the event key', () => {
    const seen: string[] = []
    registerHotkey('g t', (e) => seen.push(e.key))
    expect(trigger('g t')).toBe(1)
    expect(seen).toEqual(['t'])
  })
})

describe('splitShortcutList', () => {
  it('hands back the original for a list of nothing but separators', () => {
    expect(splitShortcutList(',,')).toEqual([',,'])
  })
})
