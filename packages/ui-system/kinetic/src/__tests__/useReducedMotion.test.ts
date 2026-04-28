// Track lifecycle callbacks
let mountCallbacks: Array<() => undefined | (() => void)> = []
let unmountCallbacks: Array<() => void> = []

vi.mock('@pyreon/core', () => ({
  onMount: vi.fn((cb: () => undefined | (() => void)) => {
    mountCallbacks.push(cb)
  }),
  onUnmount: vi.fn((cb: () => void) => {
    unmountCallbacks.push(cb)
  }),
}))

vi.mock('@pyreon/reactivity', () => {
  const signal = <T>(initial: T) => {
    let value = initial
    const s = (() => value) as (() => T) & {
      set: (v: T) => void
      update: (fn: (c: T) => T) => void
      peek: () => T
      subscribe: () => () => void
      direct: () => () => void
      label: string | undefined
      debug: () => { name: string | undefined; value: T; subscriberCount: number }
    }
    s.set = (v: T) => {
      value = v
    }
    s.update = (fn: (c: T) => T) => {
      value = fn(value)
    }
    s.peek = () => value
    s.subscribe = () => () => undefined
    s.direct = () => () => undefined
    s.label = undefined
    s.debug = () => ({ name: undefined, value, subscriberCount: 0 })
    return s
  }
  // No-op stub for the DI hook `@pyreon/core/context.ts` calls at module
  // load. See sibling test mocks for the full rationale.
  const setSnapshotCapture = () => {}
  return { signal, setSnapshotCapture }
})

import { useReducedMotion } from '../useReducedMotion'

describe('useReducedMotion', () => {
  let changeHandlers: Array<(e: any) => void>
  let removedHandlers: Array<(e: any) => void>

  const createMockMQL = (matches: boolean) => ({
    matches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: vi.fn((event: string, handler: (e: any) => void) => {
      if (event === 'change') changeHandlers.push(handler)
    }),
    removeEventListener: vi.fn((event: string, handler: (e: any) => void) => {
      if (event === 'change') removedHandlers.push(handler)
    }),
  })

  beforeEach(() => {
    mountCallbacks = []
    unmountCallbacks = []
    changeHandlers = []
    removedHandlers = []
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns false initially', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => createMockMQL(false)),
    )
    const result = useReducedMotion()
    expect(result()).toBe(false)
  })

  it('reads matchMedia state on mount (true)', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => createMockMQL(true)),
    )
    const result = useReducedMotion()

    // Fire mount callback
    for (const cb of mountCallbacks) cb()

    expect(result()).toBe(true)
  })

  it('reads matchMedia state on mount (false)', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => createMockMQL(false)),
    )
    const result = useReducedMotion()

    for (const cb of mountCallbacks) cb()

    expect(result()).toBe(false)
  })

  it('reacts to change events', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => createMockMQL(false)),
    )
    const result = useReducedMotion()

    for (const cb of mountCallbacks) cb()
    expect(result()).toBe(false)

    // Simulate preference change
    for (const handler of changeHandlers) {
      handler({ matches: true })
    }

    expect(result()).toBe(true)
  })

  it('queries the correct media string', () => {
    const mockMatchMedia = vi.fn(() => createMockMQL(false))
    vi.stubGlobal('matchMedia', mockMatchMedia)

    useReducedMotion()
    for (const cb of mountCallbacks) cb()

    expect(mockMatchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
  })

  it('registers a change listener on mount', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => createMockMQL(false)),
    )
    useReducedMotion()

    for (const cb of mountCallbacks) cb()

    expect(changeHandlers).toHaveLength(1)
  })

  it('removes the change listener on unmount', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => createMockMQL(false)),
    )
    useReducedMotion()

    for (const cb of mountCallbacks) cb()
    expect(changeHandlers).toHaveLength(1)

    for (const cb of unmountCallbacks) cb()
    expect(removedHandlers).toHaveLength(1)
  })
})
