import { config } from '@pyreon/ui-core'
import {
  BaseComponent,
  ThemeCapture,
  buildThemeContextMap,
  initTestConfig,
  mockCss,
  mockStyled,
  resolveRocketstyle,
  withThemeContext,
} from '../index'

describe('mockCss', () => {
  it('returns empty string', () => {
    expect(mockCss`color: red;`).toBe('')
  })
})

describe('mockStyled', () => {
  it('returns the component unchanged', () => {
    const Comp = () => null
    const Styled = mockStyled(Comp)
    expect(Styled`color: red;`).toBe(Comp)
  })
})

describe('initTestConfig', () => {
  it('initializes config and returns cleanup', () => {
    const originalStyled = config.styled
    const cleanup = initTestConfig()
    expect(config.styled).not.toBe(originalStyled)
    cleanup()
    expect(config.styled).toBe(originalStyled)
  })
})

describe('buildThemeContextMap', () => {
  it('returns a Map with defaults', () => {
    const map = buildThemeContextMap()
    expect(map).toBeInstanceOf(Map)
    expect(map.size).toBe(1)
  })

  it('merges custom options', () => {
    const map = buildThemeContextMap({ mode: 'dark', isDark: true })
    const value = [...map.values()][0] as any
    expect(value.mode).toBe('dark')
    expect(value.isDark).toBe(true)
  })
})

describe('withThemeContext', () => {
  it('executes fn within context and returns result', () => {
    const result = withThemeContext(() => 42)
    expect(result).toBe(42)
  })
})

describe('resolveRocketstyle', () => {
  it('returns plain object as-is', () => {
    const obj = { color: 'red' }
    expect(resolveRocketstyle(obj)).toBe(obj)
  })

  it('calls function accessor', () => {
    const accessor = () => ({ color: 'blue' })
    expect(resolveRocketstyle(accessor)).toEqual({ color: 'blue' })
  })
})

describe('ThemeCapture', () => {
  it('captures $rocketstyle and $rocketstate', () => {
    const result = ThemeCapture({
      $rocketstyle: { color: 'red' },
      $rocketstate: { state: 'primary' },
      extra: 'prop',
    })
    expect(result.$rocketstyle).toEqual({ color: 'red' })
    expect(result.$rocketstate).toEqual({ state: 'primary' })
    expect(result.props.extra).toBe('prop')
  })
})

describe('BaseComponent', () => {
  it('exposes pseudo-state via data attributes', () => {
    const result = BaseComponent({
      $rocketstate: { pseudo: { hover: true, focus: false, pressed: false } },
    })
    expect(result.props['data-hover']).toBe('true')
    expect(result.props['data-focus']).toBe('false')
  })
})
