/**
 * End-to-end test: rocketstyle theme computation pipeline.
 *
 * Tests that rocketstyle components correctly compute theme values
 * through the full chain: base theme → dimension themes → transform modifiers.
 *
 * Unlike the React version which tested CSS injection in the DOM,
 * this Pyreon version tests the computed $rocketstyle output directly.
 */
import { popContext, pushContext } from '@pyreon/core'
import { config } from '@pyreon/ui-core'
import { context } from '../context/context'
import rocketstyle from '../init'

// Mock styled that passes through the component unchanged
const mockStyled = (component: any) => {
  const taggedTemplate = (_strings: any, ..._args: any[]) => component
  return taggedTemplate
}

const mockCss = (_strings: any, ..._args: any[]) => ''

const originalStyled = config.styled
const originalCss = config.css

beforeAll(() => {
  config.init({
    css: mockCss as any,
    styled: mockStyled as any,
    component: 'div',
    textComponent: 'span',
  })
})

afterAll(() => {
  config.styled = originalStyled
  config.css = originalCss
})

/** Component that captures $rocketstyle for inspection */
const ThemeCapture: any = ({ $rocketstyle, $rocketstate, ...rest }: any) => ({
  type: 'div',
  props: rest,
  children: [],
  key: null,
  $rocketstyle,
  $rocketstate,
})
ThemeCapture.displayName = 'ThemeCapture'

/** Helper to render within theme context and return $rocketstyle */
const getComputedTheme = (Component: any, props: Record<string, any> = {}) => {
  pushContext(
    new Map([
      [
        context.id,
        {
          theme: { rootSize: 16 },
          mode: 'light',
          isDark: false,
          isLight: true,
        },
      ],
    ]),
  )
  try {
    const vnode = Component(props) as any
    // $rocketstyle is a function accessor for reactive mode switching — call it to resolve
    const rs = vnode.$rocketstyle
    return typeof rs === 'function' ? rs() : rs
  } finally {
    popContext()
  }
}

describe('e2e: rocketstyle theme computation', () => {
  it('base theme values are passed through', () => {
    const Comp: any = rocketstyle()({
      name: 'BaseComp',
      component: ThemeCapture,
    }).theme({
      backgroundColor: '#0070f3',
      color: '#fff',
    })

    const theme = getComputedTheme(Comp)
    expect(theme.backgroundColor).toBe('#0070f3')
    expect(theme.color).toBe('#fff')
  })

  it('state dimension overrides base theme values', () => {
    const Comp: any = rocketstyle()({
      name: 'StateComp',
      component: ThemeCapture,
    })
      .theme({
        backgroundColor: '#0070f3',
        color: '#fff',
      })
      .states({
        danger: {
          backgroundColor: '#dc3545',
          color: '#fff',
        },
      })

    const theme = getComputedTheme(Comp, { state: 'danger' })
    expect(theme.backgroundColor).toBe('#dc3545')
    expect(theme.color).toBe('#fff')
  })

  it('modifier transform derives styles from accumulated state theme', () => {
    const Comp: any = rocketstyle()({
      name: 'ModifierComp',
      component: ThemeCapture,
    })
      .theme({
        backgroundColor: '#0070f3',
        color: '#fff',
      })
      .states({
        danger: {
          backgroundColor: '#dc3545',
          color: '#fff',
        },
      })
      .modifiers({
        outlined: (accTheme: any) => ({
          color: accTheme.backgroundColor,
          backgroundColor: 'transparent',
        }),
      })

    // danger state + outlined modifier
    const theme = getComputedTheme(Comp, {
      state: 'danger',
      modifier: 'outlined',
    })
    // outlined should flip: color becomes the danger backgroundColor
    expect(theme.color).toBe('#dc3545')
    expect(theme.backgroundColor).toBe('transparent')
  })

  it('modifier without active state uses base theme only', () => {
    const Comp: any = rocketstyle()({
      name: 'ModifierBaseComp',
      component: ThemeCapture,
    })
      .theme({
        backgroundColor: '#0070f3',
        color: '#fff',
      })
      .modifiers({
        outlined: (accTheme: any) => ({
          color: accTheme.backgroundColor,
          backgroundColor: 'transparent',
        }),
      })

    // just outlined modifier, no state — derive from base theme
    const theme = getComputedTheme(Comp, { modifier: 'outlined' })
    expect(theme.color).toBe('#0070f3')
    expect(theme.backgroundColor).toBe('transparent')
  })

  it('variant dimension values are applied correctly', () => {
    const Comp: any = rocketstyle()({
      name: 'VariantComp',
      component: ThemeCapture,
    })
      .theme({
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
      })
      .variants({
        box: {
          height: 64,
          padding: 8,
          backgroundColor: 'transparent',
        },
        circle: {
          width: 72,
          height: 72,
          padding: 4,
          backgroundColor: '#F0F0F0',
          borderRadius: 180,
        },
      })

    const theme = getComputedTheme(Comp, { variant: 'circle' })
    expect(theme.width).toBe(72)
    expect(theme.height).toBe(72)
    expect(theme.backgroundColor).toBe('#F0F0F0')
    expect(theme.borderRadius).toBe(180)
  })

  it('variant box values override base theme', () => {
    const Comp: any = rocketstyle()({
      name: 'VariantBoxComp',
      component: ThemeCapture,
    })
      .theme({
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
      })
      .variants({
        box: {
          height: 64,
          padding: 8,
          backgroundColor: 'transparent',
        },
      })

    const theme = getComputedTheme(Comp, { variant: 'box' })
    expect(theme.backgroundColor).toBe('transparent')
    expect(theme.borderRadius).toBe(8) // inherited from base
    expect(theme.height).toBe(64)
    expect(theme.padding).toBe(8)
  })

  it('size dimension values are applied', () => {
    const Comp: any = rocketstyle()({
      name: 'SizeComp',
      component: ThemeCapture,
    })
      .theme({ fontSize: 14 })
      .sizes({
        small: { fontSize: 12, padding: 4 },
        large: { fontSize: 18, padding: 8 },
      })

    const theme = getComputedTheme(Comp, { size: 'large' })
    expect(theme.fontSize).toBe(18)
    expect(theme.padding).toBe(8)
  })

  it('multiple dimensions combine', () => {
    const Comp: any = rocketstyle()({
      name: 'MultiDimComp',
      component: ThemeCapture,
    })
      .theme({ color: 'black' })
      .states({ primary: { color: 'blue' } })
      .sizes({ large: { fontSize: 18 } })

    const theme = getComputedTheme(Comp, {
      state: 'primary',
      size: 'large',
    })
    expect(theme.color).toBe('blue')
    expect(theme.fontSize).toBe(18)
  })

  it('multiple modifier transforms compose sequentially', () => {
    const Comp: any = rocketstyle()({
      name: 'MultiModComp',
      component: ThemeCapture,
    })
      .theme({ backgroundColor: 'blue', color: 'white' })
      .modifiers({
        outlined: (accTheme: any) => ({
          color: accTheme.backgroundColor,
          backgroundColor: 'transparent',
        }),
        rounded: () => ({ borderRadius: '999px' }),
      })

    const theme = getComputedTheme(Comp, {
      modifier: ['outlined', 'rounded'],
    })
    expect(theme.color).toBe('blue')
    expect(theme.backgroundColor).toBe('transparent')
    expect(theme.borderRadius).toBe('999px')
  })

  it('later transform sees earlier transform results', () => {
    const Comp: any = rocketstyle()({
      name: 'ChainedModComp',
      component: ThemeCapture,
    })
      .theme({})
      .modifiers({
        first: () => ({ step: 'one' }),
        second: (accTheme: any) => ({ sawStep: accTheme.step }),
      })

    const theme = getComputedTheme(Comp, {
      modifier: ['first', 'second'],
    })
    expect(theme.step).toBe('one')
    expect(theme.sawStep).toBe('one')
  })
})
