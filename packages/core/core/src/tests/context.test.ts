import { runWithHooks } from '../component'
import {
  createContext,
  popContext,
  provide,
  pushContext,
  setContextStackProvider,
  useContext,
  withContext,
} from '../context'
import type { ComponentFn, Props } from '../types'

describe('createContext', () => {
  test('returns context with unique symbol id', () => {
    const ctx = createContext('default')
    expect(typeof ctx.id).toBe('symbol')
    expect(ctx.defaultValue).toBe('default')
  })

  test('each context has a unique id', () => {
    const a = createContext(1)
    const b = createContext(2)
    expect(a.id).not.toBe(b.id)
  })

  test('undefined default value', () => {
    const ctx = createContext<string | undefined>(undefined)
    expect(ctx.defaultValue).toBeUndefined()
  })

  test('null default value', () => {
    const ctx = createContext<null>(null)
    expect(ctx.defaultValue).toBeNull()
  })

  test('object default value', () => {
    const obj = { theme: 'dark', lang: 'en' }
    const ctx = createContext(obj)
    expect(ctx.defaultValue).toBe(obj)
  })

  test('function default value', () => {
    const fn = () => 42
    const ctx = createContext(fn)
    expect(ctx.defaultValue).toBe(fn)
  })
})

describe('useContext', () => {
  test('returns default when no provider exists', () => {
    const ctx = createContext('fallback')
    expect(useContext(ctx)).toBe('fallback')
  })

  test('returns provided value from pushContext', () => {
    const ctx = createContext('default')
    pushContext(new Map([[ctx.id, 'provided']]))
    expect(useContext(ctx)).toBe('provided')
    popContext()
  })

  test('returns innermost value with nested pushContext', () => {
    const ctx = createContext('default')
    pushContext(new Map([[ctx.id, 'outer']]))
    pushContext(new Map([[ctx.id, 'inner']]))
    expect(useContext(ctx)).toBe('inner')
    popContext()
    expect(useContext(ctx)).toBe('outer')
    popContext()
  })

  test('different contexts in same frame are independent', () => {
    const ctxA = createContext('a-default')
    const ctxB = createContext('b-default')
    const frame = new Map<symbol, unknown>([
      [ctxA.id, 'a-value'],
      [ctxB.id, 'b-value'],
    ])
    pushContext(frame)
    expect(useContext(ctxA)).toBe('a-value')
    expect(useContext(ctxB)).toBe('b-value')
    popContext()
  })

  test('context not in frame falls through to previous frame', () => {
    const ctxA = createContext('a-default')
    const ctxB = createContext('b-default')
    pushContext(new Map([[ctxA.id, 'a-outer']]))
    pushContext(new Map([[ctxB.id, 'b-inner']]))
    // ctxA is not in the inner frame, should fall through to outer
    expect(useContext(ctxA)).toBe('a-outer')
    expect(useContext(ctxB)).toBe('b-inner')
    popContext()
    popContext()
  })
})

describe('pushContext / popContext', () => {
  test('push and pop maintain correct stack order', () => {
    const ctx = createContext(0)
    pushContext(new Map([[ctx.id, 1]]))
    pushContext(new Map([[ctx.id, 2]]))
    pushContext(new Map([[ctx.id, 3]]))
    expect(useContext(ctx)).toBe(3)
    popContext()
    expect(useContext(ctx)).toBe(2)
    popContext()
    expect(useContext(ctx)).toBe(1)
    popContext()
    expect(useContext(ctx)).toBe(0) // default
  })

  test('popContext on empty stack is a silent no-op', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    popContext()
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('withContext', () => {
  test('provides value during callback execution', () => {
    const ctx = createContext('default')
    let captured = ''
    withContext(ctx, 'inside', () => {
      captured = useContext(ctx)
    })
    expect(captured).toBe('inside')
    // After withContext, should be back to default
    expect(useContext(ctx)).toBe('default')
  })

  test('restores stack on normal completion', () => {
    const ctx = createContext('default')
    withContext(ctx, 'temp', () => {
      expect(useContext(ctx)).toBe('temp')
    })
    expect(useContext(ctx)).toBe('default')
  })

  test('restores stack even when callback throws', () => {
    const ctx = createContext('safe')
    try {
      withContext(ctx, 'dangerous', () => {
        expect(useContext(ctx)).toBe('dangerous')
        throw new Error('boom')
      })
    } catch {
      // expected
    }
    expect(useContext(ctx)).toBe('safe')
  })

  test('nested withContext calls', () => {
    const ctx = createContext(0)
    withContext(ctx, 1, () => {
      expect(useContext(ctx)).toBe(1)
      withContext(ctx, 2, () => {
        expect(useContext(ctx)).toBe(2)
        withContext(ctx, 3, () => {
          expect(useContext(ctx)).toBe(3)
        })
        expect(useContext(ctx)).toBe(2)
      })
      expect(useContext(ctx)).toBe(1)
    })
    expect(useContext(ctx)).toBe(0)
  })

  test('multiple contexts in nested withContext', () => {
    const theme = createContext('light')
    const lang = createContext('en')

    withContext(theme, 'dark', () => {
      withContext(lang, 'fr', () => {
        expect(useContext(theme)).toBe('dark')
        expect(useContext(lang)).toBe('fr')
      })
      expect(useContext(lang)).toBe('en')
    })
    expect(useContext(theme)).toBe('light')
  })
})

describe('provide', () => {
  test('pushes context and registers unmount cleanup', () => {
    const ctx = createContext('default')
    const { hooks } = runWithHooks(
      (() => {
        provide(ctx, 'provided-value')
        expect(useContext(ctx)).toBe('provided-value')
        return null
      }) as ComponentFn,
      {} as Props,
    )
    // Context should still be available after runWithHooks
    expect(useContext(ctx)).toBe('provided-value')
    // unmount hooks should include the popContext cleanup
    expect(hooks.unmount!.length).toBeGreaterThanOrEqual(1)
    // Running unmount cleans up
    for (const fn of hooks.unmount!) fn()
    expect(useContext(ctx)).toBe('default')
  })

  test('multiple provides in same component', () => {
    const ctxA = createContext('a')
    const ctxB = createContext('b')
    const { hooks } = runWithHooks(
      (() => {
        provide(ctxA, 'A-value')
        provide(ctxB, 'B-value')
        return null
      }) as ComponentFn,
      {} as Props,
    )
    expect(useContext(ctxA)).toBe('A-value')
    expect(useContext(ctxB)).toBe('B-value')
    // Clean up
    for (const fn of hooks.unmount!) fn()
    expect(useContext(ctxA)).toBe('a')
    expect(useContext(ctxB)).toBe('b')
  })
})

describe('setContextStackProvider', () => {
  test('overrides the stack provider', () => {
    const customStack: Map<symbol, unknown>[] = []
    const ctx = createContext('default')

    setContextStackProvider(() => customStack)

    customStack.push(new Map([[ctx.id, 'custom']]))
    expect(useContext(ctx)).toBe('custom')
    customStack.pop()
    expect(useContext(ctx)).toBe('default')

    // Restore default provider
    const freshStack: Map<symbol, unknown>[] = []
    setContextStackProvider(() => freshStack)
  })

  test('different providers see different stacks', () => {
    const ctx = createContext('default')
    const stack1: Map<symbol, unknown>[] = []
    const stack2: Map<symbol, unknown>[] = []

    setContextStackProvider(() => stack1)
    pushContext(new Map([[ctx.id, 'stack1-value']]))
    expect(useContext(ctx)).toBe('stack1-value')

    // Switch to stack2 — should not see stack1's value
    setContextStackProvider(() => stack2)
    expect(useContext(ctx)).toBe('default')

    // Clean up
    setContextStackProvider(() => stack1)
    popContext()
    const freshStack: Map<symbol, unknown>[] = []
    setContextStackProvider(() => freshStack)
  })
})
