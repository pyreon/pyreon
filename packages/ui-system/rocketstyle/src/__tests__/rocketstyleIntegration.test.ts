import {
  ThemeCapture,
  getComputedTheme,
  initTestConfig,
  renderProps,
  withThemeContext,
} from '@pyreon/test-utils'
import rocketstyle from '../init'
import isRocketComponent from '../isRocketComponent'

let cleanup: () => void
beforeAll(() => {
  cleanup = initTestConfig()
})
afterAll(() => cleanup())

/**
 * Base component that filters internal props and returns a VNode-like object.
 * In Pyreon, components are plain functions — no forwardRef needed.
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

// --------------------------------------------------------
// rocketstyle factory
// --------------------------------------------------------
describe('rocketstyle factory', () => {
  it('creates a component from factory', () => {
    const Button = rocketstyle()({
      name: 'TestButton',
      component: BaseComponent,
    })
    expect(Button).toBeDefined()
    expect(typeof Button).toBe('function')
  })

  it('sets IS_ROCKETSTYLE on the component', () => {
    const Button = rocketstyle()({
      name: 'TestButton',
      component: BaseComponent,
    })
    expect(Button.IS_ROCKETSTYLE).toBe(true)
    expect(isRocketComponent(Button)).toBe(true)
  })

  it('sets displayName on the component', () => {
    const Button = rocketstyle()({
      name: 'MyButton',
      component: BaseComponent,
    })
    expect(Button.displayName).toBe('MyButton')
  })

  it('throws when component is missing', () => {
    expect(() => {
      rocketstyle()({ name: 'Test', component: undefined as any })
    }).toThrow('component')
  })

  it('throws when name is missing', () => {
    expect(() => {
      rocketstyle()({ name: '', component: BaseComponent })
    }).toThrow('name')
  })

  it('throws when dimension uses reserved key', () => {
    expect(() => {
      rocketstyle({ dimensions: { attrs: 'attrs' } as any })({
        name: 'Test',
        component: BaseComponent,
      })
    }).toThrow('invalid')
  })

  it('allows custom dimensions', () => {
    const Button = rocketstyle({
      dimensions: { colors: 'color', shapes: 'shape' },
    })({ name: 'CustomButton', component: BaseComponent })
    expect(Button).toBeDefined()
    expect(Button.IS_ROCKETSTYLE).toBe(true)
  })

  it('defaults useBooleans to true', () => {
    const Button = rocketstyle()({
      name: 'Test',
      component: BaseComponent,
    })
    expect(Button).toBeDefined()
  })
})

// --------------------------------------------------------
// chaining methods
// --------------------------------------------------------
describe('chaining methods', () => {
  const Button: any = rocketstyle()({
    name: 'ChainButton',
    component: BaseComponent,
  })

  it('.attrs() returns a new component', () => {
    const Enhanced = Button.attrs(() => ({ label: 'test' }))
    expect(Enhanced).toBeDefined()
    expect(Enhanced.IS_ROCKETSTYLE).toBe(true)
    expect(Enhanced).not.toBe(Button)
  })

  it('.attrs() with priority option', () => {
    const Enhanced = Button.attrs(() => ({ label: 'priority' }), {
      priority: true,
    })
    expect(Enhanced).toBeDefined()
    expect(Enhanced.IS_ROCKETSTYLE).toBe(true)
  })

  it('.attrs() with filter option', () => {
    const Enhanced = Button.attrs(() => ({ label: 'filtered' }), {
      filter: ['internal'],
    })
    expect(Enhanced).toBeDefined()
  })

  it('.config() returns a new component', () => {
    const Enhanced = Button.config({ DEBUG: true })
    expect(Enhanced).toBeDefined()
    expect(Enhanced.IS_ROCKETSTYLE).toBe(true)
  })

  it('.statics() returns a new component', () => {
    const Enhanced = Button.statics({ customMeta: 'value' })
    expect(Enhanced).toBeDefined()
    expect(Enhanced.meta.customMeta).toBe('value')
  })

  it('.theme() returns a new component', () => {
    const Enhanced = Button.theme(() => ({ color: 'blue' }))
    expect(Enhanced).toBeDefined()
    expect(Enhanced.IS_ROCKETSTYLE).toBe(true)
  })

  it('.styles() returns a new component', () => {
    const Enhanced = Button.styles(() => 'color: red;')
    expect(Enhanced).toBeDefined()
  })

  it('.compose() returns a new component', () => {
    const hoc = (C: any) => C
    const Enhanced = Button.compose({ myHoc: hoc })
    expect(Enhanced).toBeDefined()
  })

  it('supports chaining multiple methods', () => {
    const Enhanced = Button.theme(() => ({ color: 'blue' }))
      .attrs(() => ({ label: 'test' }))
      .config({ name: 'EnhancedButton' })
      .statics({ version: '1.0' })

    expect(Enhanced.IS_ROCKETSTYLE).toBe(true)
    expect(Enhanced.meta.version).toBe('1.0')
  })

  it('.getStaticDimensions() returns dimension info', () => {
    const Themed = Button.states(() => ({
      primary: { color: 'red' },
      secondary: { color: 'blue' },
    }))

    const info = Themed.getStaticDimensions({ rootSize: 16 })
    expect(info.dimensions).toBeDefined()
    expect(info.useBooleans).toBe(true)
    expect(info.multiKeys).toBeDefined()
  })

  it('.getDefaultAttrs() evaluates attrs chain', () => {
    const WithAttrs = Button.attrs((props: any) => ({
      label: 'default',
      ...props,
    }))
    const result = WithAttrs.getDefaultAttrs({}, {}, 'light')
    expect(result.label).toBe('default')
  })
})

// --------------------------------------------------------
// rendering
// --------------------------------------------------------
describe('rendering', () => {
  it('renders a basic rocketstyle component', () => {
    const Button: any = rocketstyle()({
      name: 'RenderButton',
      component: BaseComponent,
    }).config({})

    const result = renderProps(Button, { children: 'Hello' })
    expect(result).toBeDefined()
  })

  it('adds data-rocketstyle attribute in dev mode', () => {
    const Button: any = rocketstyle()({
      name: 'DevButton',
      component: BaseComponent,
    }).config({})

    const result = renderProps(Button)
    expect(result['data-rocketstyle']).toBe('DevButton')
  })

  it('renders with attrs defaults', () => {
    const Button: any = rocketstyle()({
      name: 'AttrsButton',
      component: BaseComponent,
    }).attrs((() => ({ 'data-default': 'yes' })) as any)

    const result = renderProps(Button)
    expect(result['data-default']).toBe('yes')
  })

  it('explicit props override attrs', () => {
    const Button: any = rocketstyle()({
      name: 'OverrideButton',
      component: BaseComponent,
    }).attrs((() => ({ 'data-val': 'from-attrs' })) as any)

    const result = renderProps(Button, { 'data-val': 'from-props' })
    expect(result['data-val']).toBe('from-props')
  })

  it('renders with theme', () => {
    const Button: any = rocketstyle()({
      name: 'ThemedButton',
      component: BaseComponent,
    }).theme(() => ({ fontSize: 14 }))

    const result = renderProps(Button)
    expect(result).toBeDefined()
  })

  it('renders with dimension states', () => {
    const Button: any = rocketstyle()({
      name: 'StatesButton',
      component: BaseComponent,
    })
      .theme(() => ({ color: 'default' }))
      .states(() => ({
        primary: { color: 'blue' },
        secondary: { color: 'green' },
      }))

    const result = renderProps(Button, { state: 'primary' })
    expect(result).toBeDefined()
  })

  it('renders with boolean dimension props', () => {
    const Button: any = rocketstyle()({
      name: 'BoolButton',
      component: BaseComponent,
    }).states(() => ({
      primary: { color: 'blue' },
    }))

    // boolean prop 'primary' should map to state='primary'
    const result = renderProps(Button, { primary: true })
    expect(result).toBeDefined()
  })

  it('renders with priority attrs', () => {
    const Button: any = rocketstyle()({
      name: 'PriorityButton',
      component: BaseComponent,
    }).attrs((() => ({ 'data-priority': 'yes' })) as any, { priority: true })

    const result = renderProps(Button)
    expect(result['data-priority']).toBe('yes')
  })
})

// --------------------------------------------------------
// DEBUG option
// --------------------------------------------------------
describe('DEBUG option', () => {
  it('calls console.debug when DEBUG is enabled', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {
      /* no-op */
    })

    const Button: any = rocketstyle()({
      name: 'DebugButton',
      component: BaseComponent,
    }).config({ DEBUG: true })

    renderProps(Button)
    expect(debugSpy).toHaveBeenCalledWith(
      '[rocketstyle] DebugButton render:',
      expect.objectContaining({
        component: 'DebugButton',
        rocketstate: expect.any(Object),
        rocketstyle: expect.any(Object),
        dimensions: expect.any(Object),
        mode: expect.any(String),
      }),
    )

    debugSpy.mockRestore()
  })

  it('does not call console.debug when DEBUG is not set', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {
      /* no-op */
    })

    const Button: any = rocketstyle()({
      name: 'NoDebugButton',
      component: BaseComponent,
    }).config({})

    renderProps(Button)
    expect(debugSpy).not.toHaveBeenCalled()

    debugSpy.mockRestore()
  })
})

// --------------------------------------------------------
// passProps option
// --------------------------------------------------------
describe('passProps option', () => {
  it('passes styling props through when passProps is configured', () => {
    const PassPropsComponent: any = ({
      children,
      $rocketstyle,
      $rocketstate,
      state,
      ...rest
    }: any) => ({
      type: 'div',
      props: { ...rest, 'data-state': state },
      children,
      key: null,
    })
    PassPropsComponent.displayName = 'PassPropsComponent'

    const Button: any = rocketstyle()({
      name: 'PassPropsButton',
      component: PassPropsComponent,
    })
      .states(() => ({
        primary: { color: 'blue' },
        secondary: { color: 'green' },
      }))
      .config({ passProps: ['state'] } as any)

    const result = renderProps(Button, { state: 'primary' })
    expect(result['data-state']).toBe('primary')
  })

  it('does not pass styling props without passProps', () => {
    const PassPropsComponent: any = ({
      children,
      $rocketstyle,
      $rocketstate,
      state,
      ...rest
    }: any) => ({
      type: 'div',
      props: { ...rest, 'data-state': state ?? 'none' },
      children,
      key: null,
    })
    PassPropsComponent.displayName = 'NoPassPropsComponent'

    const Button: any = rocketstyle()({
      name: 'NoPassPropsButton',
      component: PassPropsComponent,
    }).states(() => ({
      primary: { color: 'blue' },
    }))

    const result = renderProps(Button, { state: 'primary' })
    // Without passProps, the state prop should be filtered out
    expect(result['data-state']).toBe('none')
  })
})

// --------------------------------------------------------
// IS_ROCKETSTYLE component wrapping
// --------------------------------------------------------
describe('IS_ROCKETSTYLE component wrapping', () => {
  it('skips styled() wrapping when component already has IS_ROCKETSTYLE', () => {
    const MarkedComponent: any = ({ children, $rocketstyle, $rocketstate, ...rest }: any) => ({
      type: 'div',
      props: rest,
      children,
      key: null,
    })
    MarkedComponent.IS_ROCKETSTYLE = true
    MarkedComponent.displayName = 'MarkedComponent'

    const Outer: any = rocketstyle()({
      name: 'OuterComponent',
      component: MarkedComponent,
    })

    expect(Outer).toBeDefined()
    expect(Outer.IS_ROCKETSTYLE).toBe(true)
    expect(Outer.displayName).toBe('OuterComponent')
  })

  it('renders IS_ROCKETSTYLE component when chained with config', () => {
    const MarkedComponent: any = ({ children, $rocketstyle, $rocketstate, ...rest }: any) => ({
      type: 'div',
      props: rest,
      children,
      key: null,
    })
    MarkedComponent.IS_ROCKETSTYLE = true
    MarkedComponent.displayName = 'MarkedComponent'

    const Outer: any = rocketstyle()({
      name: 'OuterChained',
      component: MarkedComponent,
    }).config({})

    const result = renderProps(Outer, { children: 'Wrapped' })
    expect(result).toBeDefined()
  })
})

// --------------------------------------------------------
// empty dimensions validation
// --------------------------------------------------------
describe('empty dimensions validation', () => {
  it('throws when dimensions is an empty object', () => {
    expect(() => {
      rocketstyle({ dimensions: {} as any })({
        name: 'EmptyDimensions',
        component: BaseComponent,
      })
    }).toThrow('dimensions')
  })
})

// --------------------------------------------------------
// multiple dimension values
// --------------------------------------------------------
describe('multiple dimension values', () => {
  it('renders with array values for multi-key dimensions', () => {
    const Button: any = rocketstyle()({
      name: 'MultiButton',
      component: BaseComponent,
    }).multiple(() => ({
      bold: { fontWeight: 'bold' },
      italic: { fontStyle: 'italic' },
      underline: { textDecoration: 'underline' },
    }))

    const result = renderProps(Button, { multiple: ['bold', 'italic'] })
    expect(result).toBeDefined()
  })

  it('renders with single value for non-multi dimensions', () => {
    const Button: any = rocketstyle()({
      name: 'SingleDimButton',
      component: BaseComponent,
    })
      .states(() => ({
        primary: { color: 'blue' },
        secondary: { color: 'green' },
      }))
      .sizes(() => ({
        small: { fontSize: 12 },
        large: { fontSize: 18 },
      }))

    const result = renderProps(Button, { state: 'primary', size: 'large' })
    expect(result).toBeDefined()
  })

  it('renders with boolean shorthand for multi-key dimensions', () => {
    const Button: any = rocketstyle()({
      name: 'MultiBoolButton',
      component: BaseComponent,
    }).multiple(() => ({
      bold: { fontWeight: 'bold' },
      italic: { fontStyle: 'italic' },
    }))

    // Boolean shorthand for multi-key: both bold and italic as boolean props
    const result = renderProps(Button, { bold: true, italic: true })
    expect(result).toBeDefined()
  })
})

// --------------------------------------------------------
// rendering without Provider context
// --------------------------------------------------------
describe('rendering without Provider context', () => {
  it('renders component without any Provider (useContext returns default)', () => {
    const Button: any = rocketstyle()({
      name: 'NoProviderButton',
      component: BaseComponent,
    }).config({})

    // Call without any context pushed
    const vnode = Button({ children: 'NoCtx' }) as any
    const result = vnode?.props ?? vnode
    expect(result).toBeDefined()
  })
})

// --------------------------------------------------------
// $rocketstyle and $rocketstate are passed to inner component
// --------------------------------------------------------
describe('theme and state injection', () => {
  it('passes $rocketstyle theme to inner component', () => {
    const Button: any = rocketstyle()({
      name: 'ThemeInjButton',
      component: ThemeCapture,
    })
      .theme(() => ({ color: 'blue', bg: 'white' }))
      .states(() => ({
        primary: { color: 'red' },
      }))

    const rs = getComputedTheme(Button, { state: 'primary' })
    expect(rs).toBeDefined()
    expect(rs.color).toBe('red')
    expect(rs.bg).toBe('white')
  })

  it('passes $rocketstate with active dimensions to inner component', () => {
    const Button: any = rocketstyle()({
      name: 'StateInjButton',
      component: ThemeCapture,
    }).states(() => ({
      primary: { color: 'blue' },
    }))

    const vnode = withThemeContext(() => Button({ state: 'primary' }))
    expect(vnode.$rocketstate).toBeDefined()
    expect(vnode.$rocketstate.state).toBe('primary')
  })
})
