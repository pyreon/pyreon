import { popContext, useContext } from '@pyreon/core'
import { effect, effectScope, runWithContextOwner, signal } from '@pyreon/reactivity'
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

describe('Provider — reactive value contract', () => {
  type Read = () => Record<string, unknown>

  it('falls back to light-mode defaults when mode / isDark / isLight are not passed', () => {
    const owner = effectScope()
    runWithContextOwner(owner, () => Provider({ theme: { rootSize: 16 }, children: 'x' }))
    const read = runWithContextOwner(owner, () => useContext(context)) as unknown as Read
    expect(read().mode).toBe('light')
    expect(read().isDark).toBe(false)
    expect(read().isLight).toBe(true)
    owner.stop()
  })

  it('reports an explicit plain isLight=false / isDark=true / mode=dark as given (not the defaults)', () => {
    const owner = effectScope()
    runWithContextOwner(owner, () =>
      Provider({ theme: { rootSize: 16 }, mode: 'dark', isDark: true, isLight: false, children: 'x' }),
    )
    const read = runWithContextOwner(owner, () => useContext(context)) as unknown as Read
    expect(read().mode).toBe('dark')
    expect(read().isDark).toBe(true)
    expect(read().isLight).toBe(false)
    owner.stop()
  })

  it('keeps the reserved keys (children, provider) OUT of the provided value; extras are live getters', () => {
    const extra = signal('a')
    const owner = effectScope()
    runWithContextOwner(owner, () =>
      Provider({
        theme: { rootSize: 16 },
        provider: () => null,
        get extra() {
          return extra()
        },
        children: 'x',
      }),
    )
    const value = (runWithContextOwner(owner, () => useContext(context)) as unknown as Read)()
    expect(Object.keys(value)).toEqual(['theme', 'mode', 'isDark', 'isLight', 'extra'])
    expect('children' in value).toBe(false)
    expect('provider' in value).toBe(false)
    expect(value.extra).toBe('a')
    extra.set('b')
    expect(value.extra).toBe('b')
    owner.stop()
  })

  it('a descendant effect re-runs on an accessor-backed isLight flip, and reading theme alone does NOT subscribe to mode', () => {
    const isLight = signal(true)
    const mode = signal<'light' | 'dark'>('light')
    const parent = effectScope()
    runWithContextOwner(parent, () =>
      Provider({
        theme: { rootSize: 16 },
        get mode() {
          return mode()
        },
        get isLight() {
          return isLight()
        },
        children: 'x',
      }),
    )
    const child = effectScope()
    child._parent = parent
    const seenLight: unknown[] = []
    let themeRuns = 0
    child.runInScope(() =>
      runWithContextOwner(child, () => {
        const read = useContext(context) as unknown as Read
        effect(() => {
          seenLight.push(read().isLight)
        })
        effect(() => {
          void read().theme
          themeRuns++
        })
      }),
    )
    isLight.set(false)
    expect(seenLight).toEqual([true, false])
    mode.set('dark')
    expect(themeRuns).toBe(1)

    // Disposal: once the consumer's scope stops, a later flip reaches nobody.
    child.stop()
    isLight.set(true)
    expect(seenLight).toEqual([true, false])
    parent.stop()
  })

  it('isDark is NOT derived from mode — it is its own prop and defaults to false', () => {
    const owner = effectScope()
    const props: Record<string, unknown> = { theme: { rootSize: 16 }, mode: 'dark', children: 'x' }
    runWithContextOwner(owner, () => Provider(props))
    const read = runWithContextOwner(owner, () => useContext(context)) as unknown as Read
    expect(read().mode).toBe('dark')
    expect(read().isDark).toBe(false)
    owner.stop()
  })
})

describe('context', () => {
  it('exports context object with an id', () => {
    expect(context).toBeDefined()
    expect(context.id).toBeDefined()
    expect(typeof context.id).toBe('symbol')
  })
})
