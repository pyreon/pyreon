/**
 * Theme + Rocketstyle integration tests.
 *
 * Tests mode switching, reactive dimension props, and dimension CSS computation
 * through the rocketstyle pipeline using test-utils helpers.
 */
import {
  ThemeCapture,
  getComputedTheme,
  initTestConfig,
  withThemeContext,
} from '@pyreon/test-utils'
import rocketstyle from '../init'
import { getThemeByMode, themeModeCallback } from '../utils/theme'

let cleanup: () => void
beforeAll(() => {
  cleanup = initTestConfig()
})
afterAll(() => cleanup())

/**
 * Base component that filters internal props and returns a VNode-like object.
 */
const BaseComponent: any = ({ children, $rocketstyle, $rocketstate, ...rest }: any) => ({
  type: 'div',
  props: rest,
  children,
  key: null,
  $rocketstyle: typeof $rocketstyle === 'function' ? $rocketstyle() : $rocketstyle,
  $rocketstate: typeof $rocketstate === 'function' ? $rocketstate() : $rocketstate,
})
BaseComponent.displayName = 'BaseComponent'

// ─── theme integration — mode switching ───────────────────────────────────────

describe('theme integration — mode switching', () => {
  it('rocketstyle component with m(light, dark) resolves light value by default', () => {
    const Comp: any = rocketstyle()({
      name: 'ModeSwitchComp',
      component: ThemeCapture,
    }).theme((_t: any, m: any) => ({
      color: m('light-blue', 'dark-blue'),
      backgroundColor: m('#fff', '#111'),
    }))

    const theme = getComputedTheme(Comp, {}, { mode: 'light' })
    expect(theme.color).toBe('light-blue')
    expect(theme.backgroundColor).toBe('#fff')
  })

  it('switching to dark mode resolves dark values', () => {
    const Comp: any = rocketstyle()({
      name: 'DarkModeComp',
      component: ThemeCapture,
    }).theme((_t: any, m: any) => ({
      color: m('light-text', 'dark-text'),
      backgroundColor: m('white', 'black'),
    }))

    const lightTheme = getComputedTheme(Comp, {}, { mode: 'light' })
    expect(lightTheme.color).toBe('light-text')
    expect(lightTheme.backgroundColor).toBe('white')

    const darkTheme = getComputedTheme(Comp, {}, { mode: 'dark' })
    expect(darkTheme.color).toBe('dark-text')
    expect(darkTheme.backgroundColor).toBe('black')
  })

  it('getThemeByMode resolves mode callbacks in nested objects', () => {
    const cb = themeModeCallback('#f0f0f0', '#1a1a1a')
    const result: any = getThemeByMode(
      { surface: { bg: cb, border: '1px solid' } },
      'dark',
    )
    expect(result.surface.bg).toBe('#1a1a1a')
    expect(result.surface.border).toBe('1px solid')
  })

  it('dimension theme with mode callback resolves per mode', () => {
    const Comp: any = rocketstyle()({
      name: 'DimModeComp',
      component: ThemeCapture,
    })
      .theme((_t: any, m: any) => ({
        color: m('black', 'white'),
      }))
      .states((_t: any, m: any) => ({
        primary: {
          backgroundColor: m('blue', 'navy'),
        },
      }))

    const lightTheme = getComputedTheme(Comp, { state: 'primary' }, { mode: 'light' })
    expect(lightTheme.color).toBe('black')
    expect(lightTheme.backgroundColor).toBe('blue')

    const darkTheme = getComputedTheme(Comp, { state: 'primary' }, { mode: 'dark' })
    expect(darkTheme.color).toBe('white')
    expect(darkTheme.backgroundColor).toBe('navy')
  })
})

// ─── theme integration — pseudo props reactive ───────────────────────────────

describe('theme integration — pseudo props reactive', () => {
  it('different state values produce different computed themes', () => {
    const Comp: any = rocketstyle()({
      name: 'PseudoComp',
      component: ThemeCapture,
    })
      .theme({ color: 'default-color', bg: 'default-bg' })
      .states({
        active: { color: 'active-color' },
        disabled: { color: 'disabled-color', bg: 'disabled-bg' },
      })

    const defaultTheme = getComputedTheme(Comp)
    expect(defaultTheme.color).toBe('default-color')
    expect(defaultTheme.bg).toBe('default-bg')

    const activeTheme = getComputedTheme(Comp, { state: 'active' })
    expect(activeTheme.color).toBe('active-color')
    expect(activeTheme.bg).toBe('default-bg')

    const disabledTheme = getComputedTheme(Comp, { state: 'disabled' })
    expect(disabledTheme.color).toBe('disabled-color')
    expect(disabledTheme.bg).toBe('disabled-bg')
  })

  it('boolean dimension prop resolves to the matching state theme', () => {
    const Comp: any = rocketstyle({ useBooleans: true })({
      name: 'BoolPseudoComp',
      component: ThemeCapture,
    })
      .theme({ color: 'black' })
      .states({
        primary: { color: 'blue' },
        secondary: { color: 'green' },
      })

    // boolean shorthand: `primary={true}` → state='primary' (requires useBooleans: true)
    const theme = getComputedTheme(Comp, { primary: true })
    expect(theme.color).toBe('blue')
  })

  it('$rocketstate tracks active dimension values', () => {
    const Comp: any = rocketstyle()({
      name: 'StateTrackComp',
      component: ThemeCapture,
    }).states({
      primary: { color: 'blue' },
      secondary: { color: 'green' },
    })

    const vnode1 = withThemeContext(() => Comp({ state: 'primary' }))
    expect(vnode1.$rocketstate.state).toBe('primary')

    const vnode2 = withThemeContext(() => Comp({ state: 'secondary' }))
    expect(vnode2.$rocketstate.state).toBe('secondary')
  })
})

// ─── theme integration — dimension props ──────────────────────────────────────

describe('theme integration — dimension props', () => {
  it('state="primary" applies correct dimension CSS', () => {
    const Comp: any = rocketstyle()({
      name: 'DimPrimaryComp',
      component: ThemeCapture,
    })
      .theme({ color: 'default', fontSize: 14 })
      .states({
        primary: { color: 'primary-blue', fontWeight: 'bold' },
        danger: { color: 'danger-red' },
      })

    const theme = getComputedTheme(Comp, { state: 'primary' })
    expect(theme.color).toBe('primary-blue')
    expect(theme.fontWeight).toBe('bold')
    expect(theme.fontSize).toBe(14) // inherited from base theme
  })

  it('changing state prop produces different computed theme', () => {
    const Comp: any = rocketstyle()({
      name: 'ChangeDimComp',
      component: ThemeCapture,
    })
      .theme({ color: 'black' })
      .states({
        primary: { color: 'blue' },
        danger: { color: 'red' },
      })

    const primaryTheme = getComputedTheme(Comp, { state: 'primary' })
    expect(primaryTheme.color).toBe('blue')

    const dangerTheme = getComputedTheme(Comp, { state: 'danger' })
    expect(dangerTheme.color).toBe('red')
  })

  it('multiple dimensions combine correctly', () => {
    const Comp: any = rocketstyle()({
      name: 'MultiDimIntComp',
      component: ThemeCapture,
    })
      .theme({ color: 'black', fontSize: 14, padding: 4 })
      .states({ primary: { color: 'blue' } })
      .sizes({ large: { fontSize: 20, padding: 12 } })

    const theme = getComputedTheme(Comp, {
      state: 'primary',
      size: 'large',
    })
    expect(theme.color).toBe('blue')
    expect(theme.fontSize).toBe(20)
    expect(theme.padding).toBe(12)
  })

  it('modifier transform derives from accumulated dimension themes', () => {
    const Comp: any = rocketstyle()({
      name: 'ModTransformComp',
      component: ThemeCapture,
    })
      .theme({ backgroundColor: '#0070f3', color: '#fff' })
      .states({ danger: { backgroundColor: '#dc3545' } })
      .modifiers({
        outlined: (acc: any) => ({
          color: acc.backgroundColor,
          backgroundColor: 'transparent',
        }),
      })

    const theme = getComputedTheme(Comp, {
      state: 'danger',
      modifier: 'outlined',
    })
    expect(theme.color).toBe('#dc3545')
    expect(theme.backgroundColor).toBe('transparent')
  })

  it('no dimension props returns base theme only', () => {
    const Comp: any = rocketstyle()({
      name: 'BaseOnlyComp',
      component: ThemeCapture,
    })
      .theme({ color: 'base-color', bg: 'base-bg' })
      .states({ primary: { color: 'blue' } })

    const theme = getComputedTheme(Comp)
    expect(theme.color).toBe('base-color')
    expect(theme.bg).toBe('base-bg')
  })
})
