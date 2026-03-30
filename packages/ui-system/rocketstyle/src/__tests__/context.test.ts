import type { VNodeChild } from '@pyreon/core'
import { useContext } from '@pyreon/core'
import { Provider as CoreProvider } from '@pyreon/ui-core'
import Provider from '../context/context'

// Mock @pyreon/core useContext to return controlled values
vi.mock('@pyreon/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@pyreon/core')>()
  return {
    ...original,
    useContext: vi.fn(() => ({})),
  }
})

// Mock @pyreon/ui-core Provider and context
vi.mock('@pyreon/ui-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@pyreon/ui-core')>()
  return {
    ...original,
    Provider: vi.fn(((props: Record<string, unknown>) => ({
      type: 'div',
      props: { ...props, 'data-provider': 'core' },
      children: props.children,
      key: null,
    })) as any),
    context: original.context,
  }
})

const mockedUseContext = vi.mocked(useContext)
const mockedCoreProvider = vi.mocked(CoreProvider)

beforeEach(() => {
  vi.clearAllMocks()
  // Default: empty context
  mockedUseContext.mockReturnValue({} as any)
  mockedCoreProvider.mockImplementation(((props: Record<string, unknown>) => ({
    type: 'div',
    props: { ...props, 'data-provider': 'core' },
    children: props.children as VNodeChild,
    key: null,
  })) as any)
})

describe('Provider (context)', () => {
  it('uses MODE_DEFAULT (light) when no mode is provided', () => {
    mockedUseContext.mockReturnValue({} as any)

    const children = { type: 'span', props: {}, children: ['Hello'], key: null }
    Provider({ children })

    expect(mockedCoreProvider).toHaveBeenCalledTimes(1)
    const callArgs = mockedCoreProvider.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArgs.mode).toBe('light')
    expect(callArgs.isLight).toBe(true)
    expect(callArgs.isDark).toBe(false)
  })

  it('passes mode directly when inversed is false', () => {
    mockedUseContext.mockReturnValue({ mode: 'dark' } as any)

    const children = { type: 'span', props: {}, children: ['Hello'], key: null }
    Provider({ children, mode: 'dark', inversed: false })

    const callArgs = mockedCoreProvider.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArgs.mode).toBe('dark')
    expect(callArgs.isDark).toBe(true)
    expect(callArgs.isLight).toBe(false)
  })

  it('passes mode directly when inversed is undefined', () => {
    const children = { type: 'span', props: {}, children: ['Hello'], key: null }
    Provider({ children, mode: 'dark' })

    const callArgs = mockedCoreProvider.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArgs.mode).toBe('dark')
    expect(callArgs.isDark).toBe(true)
    expect(callArgs.isLight).toBe(false)
  })

  it('inverts light to dark when inversed is true', () => {
    const children = { type: 'span', props: {}, children: ['Hello'], key: null }
    Provider({ children, mode: 'light', inversed: true })

    const callArgs = mockedCoreProvider.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArgs.mode).toBe('dark')
    expect(callArgs.isDark).toBe(true)
    expect(callArgs.isLight).toBe(false)
  })

  it('inverts dark to light when inversed is true', () => {
    const children = { type: 'span', props: {}, children: ['Hello'], key: null }
    Provider({ children, mode: 'dark', inversed: true })

    const callArgs = mockedCoreProvider.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArgs.mode).toBe('light')
    expect(callArgs.isLight).toBe(true)
    expect(callArgs.isDark).toBe(false)
  })

  it('passes theme to provider when provided', () => {
    const theme = { rootSize: 16, breakpoints: { sm: 576 } }
    const children = { type: 'span', props: {}, children: ['Hello'], key: null }
    Provider({ children, theme })

    const callArgs = mockedCoreProvider.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArgs.theme).toEqual(theme)
  })

  it('does not pass theme key when theme is undefined', () => {
    const children = { type: 'span', props: {}, children: ['Hello'], key: null }
    Provider({ children })

    const callArgs = mockedCoreProvider.mock.calls[0]?.[0] as Record<string, unknown>
    expect('theme' in callArgs).toBe(false)
  })

  it('uses custom provider when specified', () => {
    const customProvider = vi.fn((props: Record<string, unknown>) => ({
      type: 'section',
      props,
      children: props.children as VNodeChild,
      key: null,
    }))

    const children = { type: 'span', props: {}, children: ['Hello'], key: null }
    Provider({ children, provider: customProvider as any })

    expect(customProvider).toHaveBeenCalledTimes(1)
    // CoreProvider should NOT have been called
    expect(mockedCoreProvider).not.toHaveBeenCalled()
  })

  it('defaults to CoreProvider when no provider prop is given', () => {
    const children = { type: 'span', props: {}, children: ['Hello'], key: null }
    Provider({ children })

    expect(mockedCoreProvider).toHaveBeenCalledTimes(1)
  })

  it('passes children through to the provider', () => {
    const children = { type: 'span', props: {}, children: ['Hello World'], key: null }
    Provider({ children })

    const callArgs = mockedCoreProvider.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArgs.children).toBe(children)
  })

  it('passes provider reference to the provider call', () => {
    const children = { type: 'span', props: {}, children: ['Hello'], key: null }
    Provider({ children })

    const callArgs = mockedCoreProvider.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArgs.provider).toBe(CoreProvider)
  })

  it('returns null when provider returns null', () => {
    mockedCoreProvider.mockReturnValue(null as any)

    const children = { type: 'span', props: {}, children: ['Hello'], key: null }
    const result = Provider({ children })

    expect(result).toBeNull()
  })

  it('returns null when provider returns undefined', () => {
    mockedCoreProvider.mockReturnValue(undefined as any)

    const children = { type: 'span', props: {}, children: ['Hello'], key: null }
    const result = Provider({ children })

    expect(result).toBeNull()
  })

  it('merges context values with incoming props (props take precedence)', () => {
    mockedUseContext.mockReturnValue({
      mode: 'light',
      theme: { rootSize: 12 },
    } as any)

    const overrideTheme = { rootSize: 20 }
    const children = { type: 'span', props: {}, children: ['Hello'], key: null }
    Provider({ children, theme: overrideTheme, mode: 'dark' })

    const callArgs = mockedCoreProvider.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArgs.mode).toBe('dark')
    expect(callArgs.theme).toEqual(overrideTheme)
  })

  it('uses context mode when no mode prop is given', () => {
    mockedUseContext.mockReturnValue({ mode: 'dark' } as any)

    const children = { type: 'span', props: {}, children: ['Hello'], key: null }
    Provider({ children })

    const callArgs = mockedCoreProvider.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArgs.mode).toBe('dark')
    expect(callArgs.isDark).toBe(true)
  })
})
