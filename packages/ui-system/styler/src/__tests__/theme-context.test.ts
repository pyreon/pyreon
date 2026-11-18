import { popContext, provide } from '@pyreon/core'
import { afterEach, describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { ThemeContext, useTheme, useThemeAccessor } from '../theme-context'

describe('ThemeContext', () => {
  it('is a Context object with an id', () => {
    expect(ThemeContext).toBeDefined()
    expect(ThemeContext.id).toBeDefined()
  })

  it('has a symbol id for context identification', () => {
    expect(typeof ThemeContext.id).toBe('symbol')
  })
})

describe('provide(ThemeContext, accessor)', () => {
  afterEach(() => {
    try {
      popContext()
    } catch {
      // Ignore if no context was pushed
    }
  })

  it('useTheme returns the provided theme', () => {
    const theme = { colors: { primary: 'red' }, spacing: 8 }
    provide(ThemeContext, () => theme)
    expect(useTheme()).toEqual(theme)
  })

  it('useThemeAccessor follows a reactive accessor (later changes)', () => {
    const theme = signal<Record<string, unknown>>({ color: 'red' })
    provide(ThemeContext, () => theme())
    const accessor = useThemeAccessor<{ color: string }>()
    expect(accessor().color).toBe('red')
    theme.set({ color: 'blue' })
    expect(accessor().color).toBe('blue')
  })
})

describe('useTheme', () => {
  it('is a function', () => {
    expect(typeof useTheme).toBe('function')
  })

  it('returns the default theme (empty object) when called outside a provider', () => {
    const theme = useTheme()
    expect(theme).toEqual({})
  })

  it('can be called with a type parameter', () => {
    interface MyTheme {
      primary: string
      spacing: number
    }
    const theme = useTheme<MyTheme>()
    expect(theme).toBeDefined()
  })
})
