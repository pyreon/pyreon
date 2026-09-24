import { effectScope, setContextOwner, signal } from '@pyreon/reactivity'
import { ColorModeProvider, provideColorMode, systemColorMode, useColorMode, useProvidedColorMode } from '../color-mode'

// The shared light/dark mode. Context resolution is driven through
// `setContextOwner` as in the other context specs; the DOM half (page
// `color-scheme`, `prefers-color-scheme`) is covered where a DOM exists —
// `@pyreon/charts`' theme specs and the PyreonUI integration spec.
function within<T>(fn: () => T, parent?: ReturnType<typeof effectScope>): T {
  const scope = effectScope()
  if (parent) scope._parent = parent
  const prev = setContextOwner(scope)
  try {
    return fn()
  } finally {
    setContextOwner(prev)
  }
}

describe('color mode', () => {
  test('with no provider it is the system mode — light where there is no DOM', () => {
    expect(useColorMode()()).toBe('light')
    expect(systemColorMode()()).toBe('light')
  })

  test('a provider pins it for everything below', () => {
    within(() => {
      provideColorMode('dark')
      expect(useColorMode()()).toBe('dark')
    })
    expect(useColorMode()()).toBe('light')
  })

  test('an accessor makes it reactive, and the returned reader agrees', () => {
    const dark = signal(false)
    within(() => {
      const read = provideColorMode(() => (dark() ? 'dark' : 'light'))
      const mode = useColorMode()
      expect(mode()).toBe('light')
      dark.set(true)
      expect(mode()).toBe('dark')
      expect(read()).toBe('dark')
    })
  })

  test("'system' resolves to the system mode", () => {
    within(() => {
      provideColorMode('system')
      expect(useColorMode()()).toBe(systemColorMode()())
    })
  })

  test('<ColorModeProvider> provides a value or an accessor, and renders its children', () => {
    within(() => {
      expect(ColorModeProvider({ mode: 'dark', children: 'kids' })).toBe('kids')
      expect(useColorMode()()).toBe('dark')
    })
    const m = signal<'light' | 'dark' | 'system'>('light')
    within(() => {
      ColorModeProvider({ mode: () => m() })
      const mode = useColorMode()
      expect(mode()).toBe('light')
      m.set('dark')
      expect(mode()).toBe('dark')
      m.set('system')
      expect(mode()).toBe(systemColorMode()())
    })
  })

  test('useProvidedColorMode tells an explicit choice from the system default', () => {
    expect(useProvidedColorMode()).toBeUndefined()
    within(() => {
      provideColorMode('dark')
      expect(useProvidedColorMode()?.()).toBe('dark')
    })
    within(() => {
      provideColorMode('system')
      expect(useProvidedColorMode()?.(), "'system' is still an explicit choice").toBe(systemColorMode()())
    })
  })

  test('the nearest provider wins', () => {
    const outer = effectScope()
    const prev = setContextOwner(outer)
    try {
      provideColorMode('dark')
      within(() => {
        expect(useColorMode()()).toBe('dark')
        provideColorMode('light')
        expect(useColorMode()()).toBe('light')
      }, outer)
      expect(useColorMode()()).toBe('dark')
    } finally {
      setContextOwner(prev)
    }
  })
})
