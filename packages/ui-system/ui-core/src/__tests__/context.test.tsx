import { popContext, useContext } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Provider, { context } from '../context'

describe('Provider', () => {
  afterEach(() => {
    // Clean up any pushed context frames
    try {
      popContext()
    } catch {
      // Ignore if no context was pushed
    }
  })

  it('returns children when no theme is provided', () => {
    const children = 'Hello'
    const result = Provider({ children })
    expect(result).toBe('Hello')
  })

  it('returns children with empty theme', () => {
    const children = 'Hello'
    const result = Provider({ theme: {}, children })
    expect(result).toBe('Hello')
  })

  it('returns children with null theme', () => {
    const children = 'Hello'
    // @ts-expect-error testing null theme
    const result = Provider({ theme: null, children })
    expect(result).toBe('Hello')
  })

  it('returns children when theme is provided and pushes context', () => {
    const theme = { rootSize: 16, breakpoints: { xs: 0 } }
    const children = 'Styled'
    const result = Provider({ theme, children })
    expect(result).toBe('Styled')
  })

  it('pushes context with theme and extra props', () => {
    const theme = { rootSize: 16 }
    const children = 'Content'
    Provider({ theme, children, custom: 'value' })
    // After Provider runs, context should have been pushed
    // Context is ReactiveContext — useContext returns () => value
    const getCtx = useContext(context)
    const ctx = getCtx() as any
    expect(ctx.theme).toEqual({ rootSize: 16 })
    expect(ctx.custom).toBe('value')
  })

  it('returns null when no children and no theme', () => {
    const result = Provider({})
    expect(result).toBeNull()
  })

  it('returns null when theme is provided but no children', () => {
    const theme = { rootSize: 16 }
    const result = Provider({ theme })
    expect(result).toBeNull()
  })

  it('does NOT log a "CoreProvider is internal" warning (it is the public rocketstyle path)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      Provider({ theme: { rootSize: 16 }, children: 'x' })
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('exposes getter-backed props LAZILY in the provided value', () => {
    const mode = signal<'light' | 'dark'>('light')
    const theme = signal<Record<string, unknown>>({ rootSize: 16 })
    Provider({
      get theme() {
        return theme()
      },
      get mode() {
        return mode()
      },
      get isDark() {
        return mode() === 'dark'
      },
      extra: 'kept',
      children: 'x',
    })
    const read = useContext(context) as unknown as () => Record<string, unknown>
    expect(read().mode).toBe('light')
    expect(read().isDark).toBe(false)
    expect(read().extra).toBe('kept')
    mode.set('dark')
    theme.set({ rootSize: 20 })
    expect(read().mode).toBe('dark')
    expect(read().isDark).toBe(true)
    expect(read().theme).toEqual({ rootSize: 20 })
  })
})

describe('context', () => {
  it('exports context object with an id', () => {
    expect(context).toBeDefined()
    expect(context.id).toBeDefined()
    expect(typeof context.id).toBe('symbol')
  })
})
