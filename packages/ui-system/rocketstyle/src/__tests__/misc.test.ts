import ThemeManager from '../cache/LocalThemeManager'
import {
  ALL_RESERVED_KEYS,
  CONFIG_KEYS,
  MODE_DEFAULT,
  PSEUDO_KEYS,
  PSEUDO_META_KEYS,
  STATIC_KEYS,
  STYLING_KEYS,
  THEME_MODES,
  THEME_MODES_INVERSED,
} from '../constants'
import BOOLEAN_TAGS from '../constants/booleanTags'
import DEFAULT_DIMENSIONS from '../constants/defaultDimensions'
import { createStaticsChainingEnhancers, createStaticsEnhancers } from '../utils/statics'
import { calculateStyles } from '../utils/styles'

describe('createStaticsChainingEnhancers', () => {
  it('attaches chaining methods for dimension keys + static keys', () => {
    const context: Record<string, any> = {}
    const func = vi.fn()

    createStaticsChainingEnhancers({
      context,
      dimensionKeys: ['states', 'sizes'],
      func,
      options: {} as any,
    })

    expect(typeof context.states).toBe('function')
    expect(typeof context.sizes).toBe('function')
    expect(typeof context.theme).toBe('function')
    expect(typeof context.styles).toBe('function')
    expect(typeof context.compose).toBe('function')
  })

  it('calls func with options and key-value pair', () => {
    const context: Record<string, any> = {}
    const func = vi.fn()
    const options = { some: 'option' } as any

    createStaticsChainingEnhancers({
      context,
      dimensionKeys: ['states'],
      func,
      options,
    })

    context.states({ primary: { color: 'red' } })
    expect(func).toHaveBeenCalledWith(options, {
      states: { primary: { color: 'red' } },
    })
  })
})

describe('createStaticsEnhancers', () => {
  it('copies options to context', () => {
    const context: Record<string, any> = {}
    createStaticsEnhancers({ context, options: { foo: 'bar', baz: 42 } })
    expect(context.foo).toBe('bar')
    expect(context.baz).toBe(42)
  })

  it('does nothing when options is empty', () => {
    const context: Record<string, any> = { existing: true }
    createStaticsEnhancers({ context, options: {} })
    expect(context).toEqual({ existing: true })
  })

  it('does nothing when options is undefined', () => {
    const context: Record<string, any> = { existing: true }
    createStaticsEnhancers({ context, options: undefined as any })
    expect(context).toEqual({ existing: true })
  })
})

describe('calculateStyles', () => {
  it('returns empty array when styles is undefined', () => {
    expect(calculateStyles(undefined)).toEqual([])
  })

  it('evaluates each style callback', () => {
    const styleFn1 = () => 'style1'
    const styleFn2 = () => 'style2'
    const result = calculateStyles([styleFn1, styleFn2] as any)
    expect(result).toHaveLength(2)
    expect(result[0]).toBe('style1')
    expect(result[1]).toBe('style2')
  })

  it('returns empty array for empty styles array', () => {
    const result = calculateStyles([])
    expect(result).toEqual([])
  })
})

describe('ThemeManager', () => {
  it('creates instance with WeakMap caches', () => {
    const tm = new ThemeManager()
    expect(tm.baseTheme).toBeInstanceOf(WeakMap)
    expect(tm.dimensionsThemes).toBeInstanceOf(WeakMap)
    expect(tm.modeBaseTheme.light).toBeInstanceOf(WeakMap)
    expect(tm.modeBaseTheme.dark).toBeInstanceOf(WeakMap)
    expect(tm.modeDimensionTheme.light).toBeInstanceOf(WeakMap)
    expect(tm.modeDimensionTheme.dark).toBeInstanceOf(WeakMap)
  })

  it('caches and retrieves values', () => {
    const tm = new ThemeManager()
    const key = {}
    tm.baseTheme.set(key, { color: 'red' })
    expect(tm.baseTheme.get(key)).toEqual({ color: 'red' })
  })

  it('mode caches are independent', () => {
    const tm = new ThemeManager()
    const key = {}
    tm.modeBaseTheme.light.set(key, 'light-theme')
    tm.modeBaseTheme.dark.set(key, 'dark-theme')
    expect(tm.modeBaseTheme.light.get(key)).toBe('light-theme')
    expect(tm.modeBaseTheme.dark.get(key)).toBe('dark-theme')
  })
})

describe('constants', () => {
  it('MODE_DEFAULT is light', () => {
    expect(MODE_DEFAULT).toBe('light')
  })

  it('PSEUDO_KEYS', () => {
    expect(PSEUDO_KEYS).toEqual(['hover', 'active', 'focus', 'pressed'])
  })

  it('PSEUDO_META_KEYS', () => {
    expect(PSEUDO_META_KEYS).toEqual(['disabled', 'readOnly'])
  })

  it('THEME_MODES', () => {
    expect(THEME_MODES.light).toBe(true)
    expect(THEME_MODES.dark).toBe(true)
  })

  it('THEME_MODES_INVERSED', () => {
    expect(THEME_MODES_INVERSED.light).toBe('dark')
    expect(THEME_MODES_INVERSED.dark).toBe('light')
  })

  it('CONFIG_KEYS includes expected keys', () => {
    expect(CONFIG_KEYS).toContain('provider')
    expect(CONFIG_KEYS).toContain('consumer')
    expect(CONFIG_KEYS).toContain('name')
    expect(CONFIG_KEYS).toContain('component')
    expect(CONFIG_KEYS).toContain('inversed')
    expect(CONFIG_KEYS).toContain('passProps')
    expect(CONFIG_KEYS).toContain('styled')
    expect(CONFIG_KEYS).toContain('DEBUG')
  })

  it('STYLING_KEYS', () => {
    expect(STYLING_KEYS).toEqual(['theme', 'styles'])
  })

  it('STATIC_KEYS includes styling keys and compose', () => {
    expect(STATIC_KEYS).toContain('theme')
    expect(STATIC_KEYS).toContain('styles')
    expect(STATIC_KEYS).toContain('compose')
  })

  it('ALL_RESERVED_KEYS includes mode keys and others', () => {
    expect(ALL_RESERVED_KEYS).toContain('light')
    expect(ALL_RESERVED_KEYS).toContain('dark')
    expect(ALL_RESERVED_KEYS).toContain('attrs')
    expect(ALL_RESERVED_KEYS).toContain('theme')
    expect(ALL_RESERVED_KEYS).toContain('compose')
  })
})

describe('DEFAULT_DIMENSIONS', () => {
  it('has states, sizes, variants, multiple', () => {
    expect(DEFAULT_DIMENSIONS.states).toBe('state')
    expect(DEFAULT_DIMENSIONS.sizes).toBe('size')
    expect(DEFAULT_DIMENSIONS.variants).toBe('variant')
    expect(DEFAULT_DIMENSIONS.multiple).toEqual({
      propName: 'multiple',
      multi: true,
    })
  })
})

describe('BOOLEAN_TAGS', () => {
  it('is an array of HTML boolean attributes', () => {
    expect(Array.isArray(BOOLEAN_TAGS)).toBe(true)
    expect(BOOLEAN_TAGS).toContain('disabled')
    expect(BOOLEAN_TAGS).toContain('checked')
    expect(BOOLEAN_TAGS).toContain('readOnly')
    expect(BOOLEAN_TAGS).toContain('required')
    expect(BOOLEAN_TAGS).toContain('hidden')
    expect(BOOLEAN_TAGS).toContain('autoFocus')
  })

  it('has more than 20 entries', () => {
    expect(BOOLEAN_TAGS.length).toBeGreaterThan(20)
  })
})
