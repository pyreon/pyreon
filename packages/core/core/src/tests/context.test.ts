import { effectScope, setContextOwner } from '@pyreon/reactivity'
import { runWithHooks } from '../component'
import {
  createContext,
  getContextStackLength,
  popContext,
  provide,
  pushContext,
  removeContextFrame,
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

describe('removeContextFrame', () => {
  // Identity-based removal used by the `*-compat` layers, which run their own
  // stack-based provide/inject (`pushContext`) independent of Pyreon's
  // owner-based context. Removal is by reference (LIFO match), so a NON-top
  // frame can be removed without disturbing the frames above it — the property
  // compat-layer out-of-order teardown relies on.
  test('removes a frame by reference identity, leaving other frames intact', () => {
    const ctx = createContext('default')
    const base = getContextStackLength()
    const outer = new Map<symbol, unknown>([[ctx.id, 'outer']])
    const inner = new Map<symbol, unknown>([[ctx.id, 'inner']])
    pushContext(outer)
    pushContext(inner)
    expect(useContext(ctx)).toBe('inner')

    // Remove the NON-top frame by reference — the top (inner) still resolves.
    removeContextFrame(outer)
    expect(getContextStackLength()).toBe(base + 1)
    expect(useContext(ctx)).toBe('inner')

    // Remove the remaining frame → back to the default.
    removeContextFrame(inner)
    expect(getContextStackLength()).toBe(base)
    expect(useContext(ctx)).toBe('default')
  })

  test('a frame not on the stack is a silent no-op', () => {
    const base = getContextStackLength()
    const orphan = new Map<symbol, unknown>([[Symbol('orphan'), 1]])
    expect(() => removeContextFrame(orphan)).not.toThrow()
    expect(getContextStackLength()).toBe(base)
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
  // Client path: provide() writes onto the current owner; context resolves
  // up the owner chain and is released when the owner is left/disposed (no
  // onUnmount cleanup — the value dies with the scope). The renderer sets the
  // owner during mount; here we drive `setContextOwner` directly.
  test('provides on the current owner; resolves it; gone after the owner is left', () => {
    const ctx = createContext('default')
    const scope = effectScope()
    const prev = setContextOwner(scope)
    provide(ctx, 'provided-value')
    expect(useContext(ctx)).toBe('provided-value')
    setContextOwner(prev)
    expect(useContext(ctx)).toBe('default')
  })

  test('multiple provides on the same owner', () => {
    const ctxA = createContext('a')
    const ctxB = createContext('b')
    const scope = effectScope()
    const prev = setContextOwner(scope)
    provide(ctxA, 'A-value')
    provide(ctxB, 'B-value')
    expect(useContext(ctxA)).toBe('A-value')
    expect(useContext(ctxB)).toBe('B-value')
    setContextOwner(prev)
    expect(useContext(ctxA)).toBe('a')
    expect(useContext(ctxB)).toBe('b')
  })

  test('SSR path (no owner): provide pushes onto the request stack', () => {
    const ctx = createContext('default')
    // No owner active → provide falls back to the stack (the server renderer
    // pops it by length via trimContextStack).
    provide(ctx, 'ssr-value')
    expect(useContext(ctx)).toBe('ssr-value')
    popContext()
    expect(useContext(ctx)).toBe('default')
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

// ─── getContextStackLength ──────────────────────────────────────────────────

describe('getContextStackLength', () => {
  let testStack: Map<symbol, unknown>[]

  beforeEach(() => {
    testStack = []
    setContextStackProvider(() => testStack)
  })

  afterEach(() => {
    const freshStack: Map<symbol, unknown>[] = []
    setContextStackProvider(() => freshStack)
  })

  test('returns the LIVE stack length, not the deduped snapshot length', () => {
    // This is the load-bearing distinction: SSR cleanup uses
    // `getContextStackLength()` as a position marker, and it must reflect
    // the live (un-deduped) stack length so subsequent `popContext` calls
    // pop the right number of frames.
    const ctx = createContext('default')
    pushContext(new Map([[ctx.id, 'A']]))
    pushContext(new Map([[ctx.id, 'B']]))
    pushContext(new Map([[ctx.id, 'C']]))

    expect(getContextStackLength()).toBe(3) // live length

    popContext()
    popContext()
    popContext()
  })

  test('zero on empty stack', () => {
    expect(getContextStackLength()).toBe(0)
  })

  test('matches stack array length after push/pop cycles', () => {
    const ctx = createContext('default')
    expect(getContextStackLength()).toBe(0)
    pushContext(new Map([[ctx.id, 'A']]))
    expect(getContextStackLength()).toBe(1)
    pushContext(new Map([[ctx.id, 'B']]))
    expect(getContextStackLength()).toBe(2)
    popContext()
    expect(getContextStackLength()).toBe(1)
    popContext()
    expect(getContextStackLength()).toBe(0)
  })
})
