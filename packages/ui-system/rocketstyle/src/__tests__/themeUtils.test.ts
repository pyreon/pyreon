import {
  calculateChainOptions,
  getDimensionThemes,
  getTheme,
  getThemeByMode,
  getThemeFromChain,
  themeModeCallback,
} from '../utils/theme'

describe('themeModeCallback', () => {
  it('returns light value for light mode', () => {
    const cb = themeModeCallback('lightVal', 'darkVal')
    expect(cb('light')).toBe('lightVal')
  })

  it('returns light value when mode is falsy', () => {
    const cb = themeModeCallback('lightVal', 'darkVal')
    expect(cb(undefined as any)).toBe('lightVal')
    expect(cb('' as any)).toBe('lightVal')
  })

  it('returns dark value for dark mode', () => {
    const cb = themeModeCallback('lightVal', 'darkVal')
    expect(cb('dark')).toBe('darkVal')
  })
})

describe('getThemeFromChain', () => {
  it('returns empty for empty array', () => {
    expect(getThemeFromChain([], {})).toEqual({})
  })

  it('returns empty for null', () => {
    expect(getThemeFromChain(null, {})).toEqual({})
  })

  it('returns empty for undefined', () => {
    expect(getThemeFromChain(undefined, {})).toEqual({})
  })

  it('evaluates chain of callbacks and deep-merges results', () => {
    const fn1 = (_theme: any) => ({ color: 'blue' })
    const fn2 = (theme: any) => ({ bg: theme.primary })
    const result = getThemeFromChain([fn1, fn2], { primary: 'red' })
    expect(result).toEqual({ color: 'blue', bg: 'red' })
  })

  it('later callbacks override earlier ones', () => {
    const fn1 = () => ({ color: 'blue' })
    const fn2 = () => ({ color: 'red' })
    const result = getThemeFromChain([fn1, fn2], {})
    expect(result).toEqual({ color: 'red' })
  })

  it('passes themeModeCallback and config.css to each callback', () => {
    const fn = vi.fn(() => ({}))
    getThemeFromChain([fn], { rootSize: 16 })
    expect(fn).toHaveBeenCalledWith({ rootSize: 16 }, expect.any(Function), expect.anything())
  })
})

describe('getDimensionThemes', () => {
  it('returns empty for empty dimensions', () => {
    expect(getDimensionThemes({}, { dimensions: {} })).toEqual({})
  })

  it('returns empty when dimensions is falsy', () => {
    expect(getDimensionThemes({}, { dimensions: undefined })).toEqual({})
  })

  it('processes dimension theme chains', () => {
    const theme = { primaryColor: 'blue' }
    const options = {
      dimensions: { states: 'state' },
      states: [
        (t: any) => ({
          primary: { color: t.primaryColor },
          secondary: { color: 'green' },
        }),
      ],
    }
    const result = getDimensionThemes(theme, options)
    expect(result.state).toEqual({
      primary: { color: 'blue' },
      secondary: { color: 'green' },
    })
  })

  it('skips dimensions without callback arrays', () => {
    const options = {
      dimensions: { states: 'state', sizes: 'size' },
      states: [() => ({ primary: { color: 'red' } })],
    }
    const result = getDimensionThemes({}, options)
    expect(result.state).toEqual({ primary: { color: 'red' } })
    expect(result.size).toBeUndefined()
  })

  it('strips nullable values from results', () => {
    const options = {
      dimensions: { states: 'state' },
      states: [() => ({ primary: { color: 'red' }, secondary: null })],
    }
    const result = getDimensionThemes({}, options)
    expect(result.state.primary).toEqual({ color: 'red' })
    expect(result.state.secondary).toBeUndefined()
  })

  it('handles multi-key dimensions', () => {
    const options = {
      dimensions: { multiple: { propName: 'multiple', multi: true } },
      multiple: [() => ({ a: { weight: 'bold' } })],
    }
    const result = getDimensionThemes({}, options)
    expect(result.multiple).toEqual({ a: { weight: 'bold' } })
  })

  it('skips empty callback arrays', () => {
    const options = {
      dimensions: { states: 'state' },
      states: [],
    }
    const result = getDimensionThemes({}, options)
    expect(result.state).toBeUndefined()
  })
})

describe('calculateChainOptions (theme)', () => {
  it('returns empty for null', () => {
    expect(calculateChainOptions(null, [])).toEqual({})
  })

  it('returns empty for undefined', () => {
    expect(calculateChainOptions(undefined, [])).toEqual({})
  })

  it('returns empty for empty array', () => {
    expect(calculateChainOptions([], [])).toEqual({})
  })

  it('evaluates chain and deep-merges results', () => {
    const fn1 = () => ({ nested: { a: 1 } })
    const fn2 = () => ({ nested: { b: 2 } })
    const result = calculateChainOptions([fn1, fn2], [])
    expect(result).toEqual({ nested: { a: 1, b: 2 } })
  })

  it('passes args to each function', () => {
    const fn = vi.fn(() => ({}))
    calculateChainOptions([fn], ['arg1', 'arg2'])
    expect(fn).toHaveBeenCalledWith('arg1', 'arg2')
  })
})

describe('getTheme', () => {
  it('returns baseTheme when rocketstate has no matching dimension themes', () => {
    const result = getTheme({
      rocketstate: { state: 'unknown' },
      themes: { state: {} },
      baseTheme: { color: 'blue' },
    })
    expect(result.color).toBe('blue')
  })

  it('merges dimension theme into baseTheme', () => {
    const result = getTheme({
      rocketstate: { state: 'primary' },
      themes: { state: { primary: { color: 'red' } } },
      baseTheme: { color: 'blue', bg: 'white' },
    })
    expect(result.color).toBe('red')
    expect(result.bg).toBe('white')
  })

  it('handles array values for multi-key dimensions', () => {
    const result = getTheme({
      rocketstate: { multiple: ['a', 'b'] },
      themes: {
        multiple: { a: { weight: 'bold' }, b: { style: 'italic' } },
      },
      baseTheme: {},
    })
    expect(result.weight).toBe('bold')
    expect(result.style).toBe('italic')
  })

  it('later dimensions override earlier ones', () => {
    const result = getTheme({
      rocketstate: { state: 'primary', size: 'large' },
      themes: {
        state: { primary: { fontSize: 14 } },
        size: { large: { fontSize: 20 } },
      },
      baseTheme: {},
    })
    expect(result.fontSize).toBe(20)
  })

  it('does not mutate baseTheme', () => {
    const baseTheme = { color: 'blue' }
    getTheme({
      rocketstate: { state: 'primary' },
      themes: { state: { primary: { color: 'red' } } },
      baseTheme,
    })
    expect(baseTheme.color).toBe('blue')
  })
})

describe('getTheme with transform dimensions', () => {
  it('applies transform function values after all static dimensions', () => {
    const result = getTheme({
      rocketstate: { state: 'primary', modifier: 'outlined' },
      themes: {
        state: { primary: { backgroundColor: 'blue', color: 'white' } },
        modifier: {
          outlined: (theme: any) => ({
            color: theme.backgroundColor,
            backgroundColor: 'transparent',
          }),
        },
      },
      baseTheme: { border: 'none' },
      transformKeys: { modifier: true },
    })
    expect(result.color).toBe('blue')
    expect(result.backgroundColor).toBe('transparent')
    expect(result.border).toBe('none')
  })

  it('transform receives accumulated theme, appTheme, mode, and css', () => {
    const transformFn = vi.fn((theme: any) => ({ derived: theme.color }))
    const appTheme = { colors: { primary: 'blue' } }
    getTheme({
      rocketstate: { state: 'primary', modifier: 'test' },
      themes: {
        state: { primary: { color: 'red' } },
        modifier: { test: transformFn },
      },
      baseTheme: { bg: 'white' },
      transformKeys: { modifier: true },
      appTheme,
    })
    expect(transformFn).toHaveBeenCalledWith(
      expect.objectContaining({ bg: 'white', color: 'red' }),
      appTheme,
      expect.any(Function),
      expect.anything(),
    )
  })

  it('transform can use appTheme values', () => {
    const appTheme = { spacing: { lg: '2rem' } }
    const result = getTheme({
      rocketstate: { modifier: 'withSpacing' },
      themes: {
        modifier: {
          withSpacing: (_theme: any, app: any) => ({
            padding: app.spacing.lg,
          }),
        },
      },
      baseTheme: { color: 'red' },
      transformKeys: { modifier: true },
      appTheme,
    })
    expect(result.padding).toBe('2rem')
    expect(result.color).toBe('red')
  })

  it('supports multiple transform values (multi dimension)', () => {
    const result = getTheme({
      rocketstate: { modifier: ['outlined', 'rounded'] },
      themes: {
        modifier: {
          outlined: (theme: any) => ({
            color: theme.backgroundColor,
            backgroundColor: 'transparent',
          }),
          rounded: () => ({ borderRadius: '999px' }),
        },
      },
      baseTheme: { backgroundColor: 'blue', color: 'white' },
      transformKeys: { modifier: true },
    })
    expect(result.color).toBe('blue')
    expect(result.backgroundColor).toBe('transparent')
    expect(result.borderRadius).toBe('999px')
  })

  it('transforms compose — later transform sees earlier transform results', () => {
    const result = getTheme({
      rocketstate: { modifier: ['first', 'second'] },
      themes: {
        modifier: {
          first: () => ({ step: 'one' }),
          second: (theme: any) => ({ sawStep: theme.step }),
        },
      },
      baseTheme: {},
      transformKeys: { modifier: true },
    })
    expect(result.step).toBe('one')
    expect(result.sawStep).toBe('one')
  })

  it('works without transformKeys (backward compatible)', () => {
    const result = getTheme({
      rocketstate: { state: 'primary' },
      themes: { state: { primary: { color: 'red' } } },
      baseTheme: { bg: 'white' },
    })
    expect(result.color).toBe('red')
    expect(result.bg).toBe('white')
  })

  it('non-transform dimension treats function values as regular merge (not called as transform)', () => {
    const fn = vi.fn(() => ({ color: 'red' }))
    getTheme({
      rocketstate: { state: 'primary' },
      themes: { state: { primary: fn } },
      baseTheme: {},
      transformKeys: {},
    })
    expect(fn).not.toHaveBeenCalled()
  })

  it('transform dimension not in rocketstate is ignored', () => {
    const transformFn = vi.fn(() => ({ color: 'red' }))
    const result = getTheme({
      rocketstate: { state: 'primary' },
      themes: {
        state: { primary: { color: 'blue' } },
        modifier: { outlined: transformFn },
      },
      baseTheme: {},
      transformKeys: { modifier: true },
    })
    expect(transformFn).not.toHaveBeenCalled()
    expect(result.color).toBe('blue')
  })

  it('transform does not mutate baseTheme', () => {
    const baseTheme = { color: 'blue', bg: 'white' }
    getTheme({
      rocketstate: { modifier: 'flip' },
      themes: {
        modifier: {
          flip: (theme: any) => ({ color: theme.bg, bg: theme.color }),
        },
      },
      baseTheme,
      transformKeys: { modifier: true },
    })
    expect(baseTheme.color).toBe('blue')
    expect(baseTheme.bg).toBe('white')
  })

  it('transform with deep nested theme values', () => {
    const result = getTheme({
      rocketstate: { state: 'primary', modifier: 'outlined' },
      themes: {
        state: {
          primary: {
            backgroundColor: 'blue',
            color: 'white',
            hover: { backgroundColor: 'darkblue' },
          },
        },
        modifier: {
          outlined: (theme: any) => ({
            color: theme.backgroundColor,
            backgroundColor: 'transparent',
            hover: {
              backgroundColor: theme.backgroundColor,
              color: theme.color,
            },
          }),
        },
      },
      baseTheme: {},
      transformKeys: { modifier: true },
    })
    expect(result.color).toBe('blue')
    expect(result.backgroundColor).toBe('transparent')
    const hover = result.hover as Record<string, any>
    expect(hover.backgroundColor).toBe('blue')
    expect(hover.color).toBe('white')
  })

  it('appTheme defaults to empty object when not provided', () => {
    const transformFn = vi.fn(() => ({}))
    getTheme({
      rocketstate: { modifier: 'test' },
      themes: { modifier: { test: transformFn } },
      baseTheme: {},
      transformKeys: { modifier: true },
    })
    expect(transformFn).toHaveBeenCalledWith(
      expect.any(Object),
      {},
      expect.any(Function),
      expect.anything(),
    )
  })

  it('transform with mode callback produces light/dark values', () => {
    const result = getTheme({
      rocketstate: { modifier: 'themed' },
      themes: {
        modifier: {
          themed: (_theme: any, _app: any, mode: any) => ({
            shadow: mode('0 2px 4px rgba(0,0,0,0.1)', 'none'),
          }),
        },
      },
      baseTheme: {},
      transformKeys: { modifier: true },
    })
    expect(typeof result.shadow).toBe('function')
  })
})

describe('getThemeByMode', () => {
  it('returns scalar values as-is', () => {
    const result = getThemeByMode({ color: 'red', size: 16 }, 'light')
    expect(result).toEqual({ color: 'red', size: 16 })
  })

  it('recursively processes nested objects', () => {
    const result = getThemeByMode({ nested: { color: 'red' } }, 'light')
    expect(result).toEqual({ nested: { color: 'red' } })
  })

  it('resolves mode callbacks for light', () => {
    const cb = themeModeCallback('lightColor', 'darkColor')
    const result: any = getThemeByMode({ color: cb }, 'light')
    expect(result.color).toBe('lightColor')
  })

  it('resolves mode callbacks for dark', () => {
    const cb = themeModeCallback('lightColor', 'darkColor')
    const result: any = getThemeByMode({ color: cb }, 'dark')
    expect(result.color).toBe('darkColor')
  })

  it('resolves nested mode callbacks', () => {
    const cb = themeModeCallback('lightBg', 'darkBg')
    const result: any = getThemeByMode({ nested: { bg: cb } }, 'light')
    expect(result.nested.bg).toBe('lightBg')
  })

  it('handles mixed values and mode callbacks', () => {
    const cb = themeModeCallback('#fff', '#000')
    const result: any = getThemeByMode(
      { bg: cb, fontSize: 16, nested: { color: 'static' } },
      'dark',
    )
    expect(result.bg).toBe('#000')
    expect(result.fontSize).toBe(16)
    expect(result.nested.color).toBe('static')
  })
})
