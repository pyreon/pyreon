import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _resetHotkeys, getHotkeyConflicts, registerHotkey } from '../registry'

// getHotkeyConflicts() reports registered shortcuts that would fire on the SAME
// keystroke within the SAME scope — matched on the PARSED combo, so aliased
// duplicates are caught too. Cross-scope overlaps are intentional layering and
// are NOT reported.
describe('hotkeys — conflict detection', () => {
  beforeEach(() => _resetHotkeys())
  afterEach(() => _resetHotkeys())

  it('reports two identical shortcuts in the same scope', () => {
    registerHotkey('ctrl+s', () => {}, { description: 'Save A' })
    registerHotkey('ctrl+s', () => {}, { description: 'Save B' })
    const conflicts = getHotkeyConflicts()
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toEqual({
      scope: 'global',
      shortcuts: ['ctrl+s', 'ctrl+s'],
      descriptions: ['Save A', 'Save B'],
    })
  })

  it('catches aliased duplicates (ctrl+s vs control+s)', () => {
    registerHotkey('ctrl+s', () => {})
    registerHotkey('control+s', () => {})
    const conflicts = getHotkeyConflicts()
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]!.shortcuts).toEqual(['ctrl+s', 'control+s'])
  })

  it('does NOT report the same shortcut across DIFFERENT scopes (intentional layering)', () => {
    registerHotkey('mod+s', () => {}, { scope: 'global' })
    registerHotkey('mod+s', () => {}, { scope: 'editor' })
    expect(getHotkeyConflicts()).toHaveLength(0)
  })

  it('does NOT report distinct shortcuts', () => {
    registerHotkey('ctrl+s', () => {})
    registerHotkey('ctrl+z', () => {})
    expect(getHotkeyConflicts()).toHaveLength(0)
  })

  it('reports conflicting sequential combos (g t vs g t) but not distinct ones (g t vs g n)', () => {
    registerHotkey('g t', () => {})
    registerHotkey('g t', () => {})
    registerHotkey('g n', () => {})
    const conflicts = getHotkeyConflicts()
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]!.shortcuts).toEqual(['g t', 'g t'])
  })

  it('a single sequence key and a same-prefix single key are NOT the same signature', () => {
    // `g` (single) and `g t` (sequence) fire on different keystroke shapes.
    registerHotkey('g', () => {})
    registerHotkey('g t', () => {})
    expect(getHotkeyConflicts()).toHaveLength(0)
  })

  it('descriptions are undefined where none was set', () => {
    registerHotkey('ctrl+k', () => {})
    registerHotkey('ctrl+k', () => {}, { description: 'Palette' })
    const c = getHotkeyConflicts()[0]!
    expect(c.descriptions).toEqual([undefined, 'Palette'])
  })

  it('returns empty when nothing is registered', () => {
    expect(getHotkeyConflicts()).toEqual([])
  })

  it('signature is order-independent across all four modifiers', () => {
    // ctrl+alt+shift+meta, written in two different orders → same signature.
    registerHotkey('ctrl+alt+shift+meta+x', () => {})
    registerHotkey('meta+shift+alt+ctrl+x', () => {})
    const conflicts = getHotkeyConflicts()
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]!.shortcuts).toEqual(['ctrl+alt+shift+meta+x', 'meta+shift+alt+ctrl+x'])
  })

  it('groups three-way collisions into one entry', () => {
    registerHotkey('ctrl+s', () => {})
    registerHotkey('ctrl+s', () => {})
    registerHotkey('ctrl+s', () => {})
    const conflicts = getHotkeyConflicts()
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]!.shortcuts).toHaveLength(3)
  })
})
