import { h, provide } from '@pyreon/core'
import createLocalProvider from '../context/createLocalProvider'

// Mock @pyreon/core provide
vi.mock('@pyreon/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@pyreon/core')>()
  return {
    ...original,
    provide: vi.fn(),
  }
})

const mockedProvide = vi.mocked(provide)

beforeEach(() => {
  vi.clearAllMocks()
})

/** Simple base component that returns its received props as a VNode for inspection. */
const BaseComponent: any = vi.fn((props: Record<string, unknown>) => ({
  type: 'div',
  props,
  children: props.children,
  key: null,
}))

describe('createLocalProvider', () => {
  it('returns a component function', () => {
    const HOC = createLocalProvider(BaseComponent)
    expect(typeof HOC).toBe('function')
  })

  it('calls the wrapped component with forwarded props', () => {
    const HOC = createLocalProvider(BaseComponent)

    HOC({ 'data-testid': 'test', title: 'Hello', children: 'Content' } as any)

    expect(BaseComponent).toHaveBeenCalledTimes(1)
    const callProps = BaseComponent.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callProps['data-testid']).toBe('test')
    expect(callProps.title).toBe('Hello')
    expect(callProps.children).toBe('Content')
  })

  it('provides local context via provide()', () => {
    const HOC = createLocalProvider(BaseComponent)

    HOC({} as any)

    expect(mockedProvide).toHaveBeenCalledTimes(1)
  })

  it('initial pseudo state is all false', () => {
    const HOC = createLocalProvider(BaseComponent)

    HOC({} as any)

    const callProps = BaseComponent.mock.calls[0]?.[0] as Record<string, unknown>
    const rocketstate = callProps.$rocketstate as Record<string, unknown>
    const pseudo = rocketstate?.pseudo as Record<string, boolean>

    expect(pseudo.hover).toBe(false)
    expect(pseudo.focus).toBe(false)
    expect(pseudo.pressed).toBe(false)
  })

  it('injects mouse and focus event handlers', () => {
    const HOC = createLocalProvider(BaseComponent)

    HOC({} as any)

    const callProps = BaseComponent.mock.calls[0]?.[0] as Record<string, unknown>
    expect(typeof callProps.onMouseEnter).toBe('function')
    expect(typeof callProps.onMouseLeave).toBe('function')
    expect(typeof callProps.onMouseDown).toBe('function')
    expect(typeof callProps.onMouseUp).toBe('function')
    expect(typeof callProps.onFocus).toBe('function')
    expect(typeof callProps.onBlur).toBe('function')
  })

  it('forwards original onMouseEnter handler', () => {
    const HOC = createLocalProvider(BaseComponent)
    const originalHandler = vi.fn()
    const mockEvent = new MouseEvent('mouseenter')

    HOC({ onMouseEnter: originalHandler } as any)

    const callProps = BaseComponent.mock.calls[0]?.[0] as Record<string, unknown>
    ;(callProps.onMouseEnter as (e: MouseEvent) => void)(mockEvent)

    expect(originalHandler).toHaveBeenCalledWith(mockEvent)
  })

  it('forwards original onMouseLeave handler', () => {
    const HOC = createLocalProvider(BaseComponent)
    const originalHandler = vi.fn()
    const mockEvent = new MouseEvent('mouseleave')

    HOC({ onMouseLeave: originalHandler } as any)

    const callProps = BaseComponent.mock.calls[0]?.[0] as Record<string, unknown>
    ;(callProps.onMouseLeave as (e: MouseEvent) => void)(mockEvent)

    expect(originalHandler).toHaveBeenCalledWith(mockEvent)
  })

  it('forwards original onMouseDown handler', () => {
    const HOC = createLocalProvider(BaseComponent)
    const originalHandler = vi.fn()
    const mockEvent = new MouseEvent('mousedown')

    HOC({ onMouseDown: originalHandler } as any)

    const callProps = BaseComponent.mock.calls[0]?.[0] as Record<string, unknown>
    ;(callProps.onMouseDown as (e: MouseEvent) => void)(mockEvent)

    expect(originalHandler).toHaveBeenCalledWith(mockEvent)
  })

  it('forwards original onMouseUp handler', () => {
    const HOC = createLocalProvider(BaseComponent)
    const originalHandler = vi.fn()
    const mockEvent = new MouseEvent('mouseup')

    HOC({ onMouseUp: originalHandler } as any)

    const callProps = BaseComponent.mock.calls[0]?.[0] as Record<string, unknown>
    ;(callProps.onMouseUp as (e: MouseEvent) => void)(mockEvent)

    expect(originalHandler).toHaveBeenCalledWith(mockEvent)
  })

  it('forwards original onFocus handler', () => {
    const HOC = createLocalProvider(BaseComponent)
    const originalHandler = vi.fn()
    const mockEvent = new FocusEvent('focus')

    HOC({ onFocus: originalHandler } as any)

    const callProps = BaseComponent.mock.calls[0]?.[0] as Record<string, unknown>
    ;(callProps.onFocus as (e: FocusEvent) => void)(mockEvent)

    expect(originalHandler).toHaveBeenCalledWith(mockEvent)
  })

  it('forwards original onBlur handler', () => {
    const HOC = createLocalProvider(BaseComponent)
    const originalHandler = vi.fn()
    const mockEvent = new FocusEvent('blur')

    HOC({ onBlur: originalHandler } as any)

    const callProps = BaseComponent.mock.calls[0]?.[0] as Record<string, unknown>
    ;(callProps.onBlur as (e: FocusEvent) => void)(mockEvent)

    expect(originalHandler).toHaveBeenCalledWith(mockEvent)
  })

  it('does not forward event handlers that were not provided', () => {
    const HOC = createLocalProvider(BaseComponent)

    HOC({} as any)

    const callProps = BaseComponent.mock.calls[0]?.[0] as Record<string, unknown>
    // The HOC event handlers should not throw when no original handler exists
    expect(() => {
      ;(callProps.onMouseEnter as (e: MouseEvent) => void)(new MouseEvent('mouseenter'))
      ;(callProps.onMouseLeave as (e: MouseEvent) => void)(new MouseEvent('mouseleave'))
      ;(callProps.onMouseDown as (e: MouseEvent) => void)(new MouseEvent('mousedown'))
      ;(callProps.onMouseUp as (e: MouseEvent) => void)(new MouseEvent('mouseup'))
      ;(callProps.onFocus as (e: FocusEvent) => void)(new FocusEvent('focus'))
      ;(callProps.onBlur as (e: FocusEvent) => void)(new FocusEvent('blur'))
    }).not.toThrow()
  })

  it('merges existing $rocketstate with pseudo state', () => {
    const HOC = createLocalProvider(BaseComponent)

    HOC({
      $rocketstate: { someExisting: 'value', pseudo: { disabled: true } },
    } as any)

    const callProps = BaseComponent.mock.calls[0]?.[0] as Record<string, unknown>
    const rocketstate = callProps.$rocketstate as Record<string, unknown>

    expect(rocketstate.someExisting).toBe('value')
    const pseudo = rocketstate.pseudo as Record<string, unknown>
    expect(pseudo.disabled).toBe(true)
    expect(pseudo.hover).toBe(false)
    expect(pseudo.focus).toBe(false)
    expect(pseudo.pressed).toBe(false)
  })

  it('provides updated state to local context', () => {
    const HOC = createLocalProvider(BaseComponent)

    HOC({} as any)

    expect(mockedProvide).toHaveBeenCalledTimes(1)
    const [, providedValue] = mockedProvide.mock.calls[0] as [unknown, Record<string, unknown>]
    const pseudo = providedValue.pseudo as Record<string, boolean>
    expect(pseudo.hover).toBe(false)
    expect(pseudo.focus).toBe(false)
    expect(pseudo.pressed).toBe(false)
  })

  it('does not pass event handler props to wrapped component as original handler names', () => {
    const HOC = createLocalProvider(BaseComponent)
    const originalMouseEnter = vi.fn()

    HOC({ onMouseEnter: originalMouseEnter, customProp: 'keep' } as any)

    const callProps = BaseComponent.mock.calls[0]?.[0] as Record<string, unknown>
    // The wrapped component should receive the HOC event handlers, not the original ones
    expect(callProps.customProp).toBe('keep')
    // The onMouseEnter on the component should be the HOC wrapper, not the original
    expect(callProps.onMouseEnter).not.toBe(originalMouseEnter)
  })

  it('strips $rocketstate from forwarded props and passes updated version', () => {
    const HOC = createLocalProvider(BaseComponent)
    const originalState = { existing: true }

    HOC({ $rocketstate: originalState } as any)

    const callProps = BaseComponent.mock.calls[0]?.[0] as Record<string, unknown>
    const rocketstate = callProps.$rocketstate as Record<string, unknown>
    // Should have merged pseudo state
    expect(rocketstate.pseudo).toBeDefined()
    // Original state is preserved
    expect(rocketstate.existing).toBe(true)
  })

  it('returns the result of the wrapped component', () => {
    const expectedResult = {
      type: 'div',
      props: { 'data-result': 'yes' },
      children: ['Result'],
      key: null,
    }
    const MockComponent = vi.fn(() => expectedResult)
    const HOC = createLocalProvider(MockComponent as any)

    const result = HOC({} as any)

    expect(result).toBe(expectedResult)
  })
})

// ─── createLocalProvider — real h() round-trip ──────────────────────
//
// The tests above use a `BaseComponent` mock that returns
// `{ type, props, children, key }` literals and assert against the
// shape. This block re-runs key contracts with a base component
// that returns real h() output — same divergence guard as the
// attrs / connector-document parallels.

describe('createLocalProvider — real h() round-trip', () => {
  it('passes children through a real h() base component', () => {
    const BaseComponentH = vi.fn((props: Record<string, unknown>) =>
      h('div', { 'data-real-h': 'yes', ...props }, props.children as never),
    )
    const HOC = createLocalProvider(BaseComponentH as any)
    const result = HOC({ children: 'hello' } as any) as any
    expect(BaseComponentH).toHaveBeenCalled()
    expect(result.type).toBe('div')
    expect(result.props['data-real-h']).toBe('yes')
  })

  it('forwards arbitrary props through real h() output', () => {
    const BaseComponentH = vi.fn((props: Record<string, unknown>) =>
      h('button', props, props.label as never),
    )
    const HOC = createLocalProvider(BaseComponentH as any)
    const result = HOC({ label: 'Click', 'data-id': '42' } as any) as any
    expect(result.type).toBe('button')
    expect(result.props.label).toBe('Click')
    expect(result.props['data-id']).toBe('42')
  })
})
