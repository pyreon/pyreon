// Verifies the user's three reported issues are FIXED:
//
//   1. `inversed` works on a nested PyreonUI when theme is inherited.
//   2. `theme` is optional — nested `<PyreonUI inversed>` (no theme prop)
//      no longer crashes the ThemeContext getter.
//   3. Nested PyreonUI inherits theme from the parent's ThemeContext
//      out of the box.
//
// PLUS the user's explicit scoping invariant: an INNER inversed PyreonUI
// must NOT leak its flipped mode back to the outer subtree. This holds
// trivially via Pyreon's provide() scoping (each `provide()` push lives
// only inside the providing component's subtree), but worth locking in.
import { describe, expect, it, vi } from 'vitest'
import { PyreonUI } from '../PyreonUI'

// Spy on provide()
const provideSpy = vi.spyOn(await import('@pyreon/core'), 'provide')

describe('PyreonUI — theme/mode inheritance + scope invariants', () => {
  const theme = {
    rootSize: 16,
    breakpoints: { xs: 0, sm: 576, md: 768 },
    colors: { primary: '#228be6' },
  }

  beforeEach(() => {
    provideSpy.mockClear()
  })

  it('ISSUE 2 FIXED: <PyreonUI inversed> with no theme prop returns a non-throwing ThemeContext getter', () => {
    // The previous broken shape: computed wraps enrichTheme(undefined),
    // which throws lazily when a child reads ThemeContext. With the fix,
    // omitted theme inherits from the parent ThemeContext (default `{}`
    // at the root).
    PyreonUI({ inversed: true, children: null })
    const themeGetter = provideSpy.mock.calls[0]![1] as () => unknown
    expect(() => themeGetter()).not.toThrow()
    // At root with no parent theme, falls back to the ReactiveContext
    // default `{}` — no crash, just an empty theme.
    expect(themeGetter()).toEqual({})
  })

  it('ISSUE 3 FIXED: nested PyreonUI inherits theme from parent ThemeContext identity', () => {
    // Drive the outer + inner manually. The inner runs inside the outer's
    // setup frame — useContext(ThemeContext) inside the inner reads the
    // outer's provided getter, returning the outer's enriched theme.
    PyreonUI({ theme, children: null }) // outer
    const outerThemeGetter = provideSpy.mock.calls[0]![1] as () => unknown
    const outerEnriched = outerThemeGetter()

    provideSpy.mockClear()
    PyreonUI({ inversed: true, children: null }) // inner — no theme prop
    const innerThemeGetter = provideSpy.mock.calls[0]![1] as () => unknown
    const innerTheme = innerThemeGetter()

    // The inner provides the PARENT'S theme by REFERENCE — not a fresh
    // enrichTheme() call. Same `__PYREON__` block identity → downstream
    // identity-keyed caches (styler classCache, rocketstyle WeakMaps) hit.
    expect(innerTheme).toBe(outerEnriched)
  })

  it('ISSUE 1 FIXED: inversed flips the mode when theme is inherited from parent', () => {
    // The user's reported shape:
    //   <PyreonUI theme={theme}>          ← provides mode='light'
    //     <PyreonUI inversed>             ← no theme, only `inversed`
    //       <DarkSidebar />               ← reads mode → should be 'dark'
    //     </PyreonUI>
    //   </PyreonUI>
    //
    // Before the fix: enrichTheme(undefined) crashed in the inner's
    // ThemeContext getter and the whole inner subtree fell back to outer's
    // mode (the inversion was effectively invisible because every styled
    // descendant rendered with the wrong theme).
    PyreonUI({ theme, mode: 'light', children: null }) // outer
    provideSpy.mockClear()
    PyreonUI({ inversed: true, children: null }) // inner — no theme
    const innerModeGetter = provideSpy.mock.calls[2]![1] as () => unknown
    expect(innerModeGetter()).toBe('dark')
  })

  it('SCOPE INVARIANT: inner inversed does NOT leak to outer', () => {
    // The outer PyreonUI provided ModeContext BEFORE the inner one ran.
    // Inner's provide() pushed a new frame onto the context stack — that
    // frame is identity-removed on inner unmount, leaving the outer's
    // frame intact. We assert on the outer's mode getter staying 'light'
    // after the inner has also been provided.
    PyreonUI({ theme, mode: 'light', children: null }) // outer
    const outerModeGetter = provideSpy.mock.calls[2]![1] as () => unknown
    provideSpy.mockClear()
    PyreonUI({ inversed: true, children: null }) // inner

    // Outer's mode getter is still the same closure and still returns
    // 'light' — it was never touched by the inner's provide().
    expect(outerModeGetter()).toBe('light')
  })

  it('SCOPE INVARIANT: outer theme is unaffected by inner inheritance', () => {
    PyreonUI({ theme, children: null }) // outer
    const outerThemeGetter = provideSpy.mock.calls[0]![1] as () => unknown
    const outerThemeBefore = outerThemeGetter()
    provideSpy.mockClear()
    PyreonUI({ inversed: true, children: null }) // inner

    // Outer's theme getter still returns the same enriched theme.
    expect(outerThemeGetter()).toBe(outerThemeBefore)
  })
})
