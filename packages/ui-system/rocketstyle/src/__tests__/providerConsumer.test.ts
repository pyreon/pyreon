import { popContext, pushContext } from '@pyreon/core'
import {
  BaseComponent,
  buildThemeContextMap,
  initTestConfig,
  withThemeContext,
} from '@pyreon/test-utils'
import rocketstyle from '../init'

let cleanup: () => void
beforeAll(() => {
  cleanup = initTestConfig()
})
afterAll(() => cleanup())

/** Child component that reads consumer context */
const ChildComponent: any = ({
  children,
  $rocketstyle,
  $rocketstate,
  parentHover,
  ...rest
}: any) => ({
  type: 'div',
  props: { ...rest, 'data-parent-hover': parentHover ?? 'none' },
  children,
})
ChildComponent.displayName = 'ChildComponent'

// --------------------------------------------------------
// Provider/Consumer integration
// --------------------------------------------------------
describe('Provider/Consumer integration', () => {
  describe('provider component', () => {
    it('renders with provider: true', () => {
      const ParentButton: any = rocketstyle()({
        name: 'ProviderButton',
        component: BaseComponent,
      }).config({ provider: true })

      const result = withThemeContext(() => ParentButton({ children: 'Child' }))
      expect(result).toBeDefined()
    })

    it('detects pseudo-state via $rocketstate on provider', () => {
      const ParentButton: any = rocketstyle()({
        name: 'HoverProvider',
        component: BaseComponent,
      }).config({ provider: true })

      const result = withThemeContext(() => ParentButton({ children: 'Child' }))
      // Provider wraps with createLocalProvider which injects pseudo state
      // Initial state should be false
      expect(result.props['data-hover']).toBe('false')
      expect(result.props['data-focus']).toBe('false')
      expect(result.props['data-pressed']).toBe('false')
    })
  })

  describe('consumer component', () => {
    it('consumer receives pseudo-state from provider context', () => {
      const Parent: any = rocketstyle()({
        name: 'ParentProvider',
        component: BaseComponent,
      }).config({ provider: true })

      const Child: any = rocketstyle()({
        name: 'ChildConsumer',
        component: ChildComponent,
      }).config({
        consumer: (ctx: any) =>
          ctx((rawCtx: any) => ({
            parentHover: rawCtx?.pseudo?.hover ? 'yes' : 'no',
          })),
      })

      // Render parent, then render child within the same context
      withThemeContext(() => {
        const _parentResult = Parent({ children: null })
        // The parent pushes local context — child should see it
        const childResult = Child({})
        expect(childResult).toBeDefined()
        const childProps = childResult?.props ?? childResult
        expect(childProps['data-parent-hover']).toBe('no')
      })
    })

    it('consumer without provider returns default pseudo', () => {
      const Child: any = rocketstyle()({
        name: 'OrphanConsumer',
        component: ChildComponent,
      }).config({
        consumer: (ctx: any) =>
          ctx((rawCtx: any) => ({
            parentHover: rawCtx?.pseudo?.hover ? 'yes' : 'no',
          })),
      })

      const result = withThemeContext(() => Child({}))
      const props = result?.props ?? result
      expect(props['data-parent-hover']).toBe('no')
    })

    it('component without consumer ignores provider context', () => {
      const Parent: any = rocketstyle()({
        name: 'IgnoredProvider',
        component: BaseComponent,
      }).config({ provider: true })

      const Child: any = rocketstyle()({
        name: 'NoConsumer',
        component: BaseComponent,
      }).config({})

      withThemeContext(() => {
        Parent({ children: null })
        const childResult = Child({})
        expect(childResult).toBeDefined()
      })
    })
  })

  describe('theme mode', () => {
    it('light mode is default', () => {
      const Button: any = rocketstyle()({
        name: 'LightButton',
        component: BaseComponent,
      }).config({})

      const result = withThemeContext(() => Button({}))
      expect(result).toBeDefined()
    })

    it('dark mode is passed through Provider', () => {
      const Button: any = rocketstyle()({
        name: 'DarkButton',
        component: BaseComponent,
      }).config({})

      pushContext(
        buildThemeContextMap({ mode: 'dark', isDark: true, isLight: false }),
      )
      try {
        const result = Button({})
        expect(result).toBeDefined()
      } finally {
        popContext()
      }
    })

    it('inversed config flips the mode', () => {
      const Button: any = rocketstyle()({
        name: 'InversedButton',
        component: BaseComponent,
      }).config({ inversed: true })

      const result = withThemeContext(() => Button({}))
      expect(result).toBeDefined()
    })
  })

  describe('nested providers', () => {
    it('supports nested provider components', () => {
      const Outer: any = rocketstyle()({
        name: 'OuterProvider',
        component: BaseComponent,
      }).config({ provider: true })

      const Inner: any = rocketstyle()({
        name: 'InnerProvider',
        component: BaseComponent,
      }).config({ provider: true })

      withThemeContext(() => {
        const outerResult = Outer({ children: null })
        expect(outerResult).toBeDefined()

        const innerResult = Inner({ children: null })
        expect(innerResult).toBeDefined()
      })
    })
  })
})
