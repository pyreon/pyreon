import { runWithHooks } from '../component'
import {
  captureContextStack,
  createContext,
  getContextStackLength,
  popContext,
  provide,
  pushContext,
  restoreContextStack,
  setContextStackProvider,
  useContext,
  withContext,
} from '../context'
import type { ContextSnapshot } from '../context'
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

// ─── captureContextStack — dedup semantics ───────────────────────────────────
//
// The capture step deduplicates: only the topmost frame per context-id is
// retained in the snapshot. This is a HEAP-LEAK fix: under deeply-nested
// reactive boundaries, each effect's setup-time snapshot used to grow with
// the live stack's transient duplicates (40k+ entries reported in 0.21.x;
// see context.ts JSDoc for the full story). Dedup collapses the captured
// size to ~N entries where N is the number of distinct context ids in
// scope (typically 2-10 in real apps).
//
// Safety property: `useContext` walks the stack in reverse and stops at
// the first matching frame; any shadowed frame is unreachable. The dedup
// preserves the topmost frame per id, so `useContext` returns the same
// value before and after.

describe('captureContextStack — dedup', () => {
  const restoreStack: Map<symbol, unknown>[][] = []
  let testStack: Map<symbol, unknown>[]

  beforeEach(() => {
    testStack = []
    setContextStackProvider(() => testStack)
  })

  afterEach(() => {
    while (restoreStack.length > 0) restoreStack.pop()
    const freshStack: Map<symbol, unknown>[] = []
    setContextStackProvider(() => freshStack)
  })

  test('empty stack snapshot is empty', () => {
    expect(captureContextStack()).toEqual([])
  })

  test('single frame snapshot is identical', () => {
    const ctx = createContext('default')
    pushContext(new Map([[ctx.id, 'A']]))
    const snap = captureContextStack()
    expect(snap).toHaveLength(1)
    expect(snap[0]).toBe(testStack[0]) // same reference
    popContext()
  })

  test('stack with no duplicate ids snapshots verbatim', () => {
    const a = createContext('a-default')
    const b = createContext('b-default')
    const c = createContext('c-default')
    pushContext(new Map([[a.id, 'A']]))
    pushContext(new Map([[b.id, 'B']]))
    pushContext(new Map([[c.id, 'C']]))
    const snap = captureContextStack()
    expect(snap).toHaveLength(3)
    expect(snap.map((f) => Array.from(f.values()))).toEqual([['A'], ['B'], ['C']])
    popContext()
    popContext()
    popContext()
  })

  test('duplicate ids collapse to topmost', () => {
    // Same context-id pushed 3 times — typical of nested restoreContextStack
    // windows. Only the topmost should appear in the snapshot.
    const ctx = createContext('default')
    pushContext(new Map([[ctx.id, 'A']]))
    pushContext(new Map([[ctx.id, 'B']]))
    pushContext(new Map([[ctx.id, 'C']]))
    const snap = captureContextStack()
    expect(snap).toHaveLength(1)
    expect(snap[0]!.get(ctx.id)).toBe('C') // topmost wins
    popContext()
    popContext()
    popContext()
  })

  test('mixed: deep stack with mostly duplicates collapses', () => {
    // Simulates the bug shape: same context pushed 40 times via nested
    // restore windows + one unique frame at the top.
    const repeated = createContext('default')
    const unique = createContext('default')
    for (let i = 0; i < 40; i++) {
      pushContext(new Map([[repeated.id, `dup-${i}`]]))
    }
    pushContext(new Map([[unique.id, 'unique']]))
    expect(testStack).toHaveLength(41)

    const snap = captureContextStack()
    // Result: topmost `repeated` frame + the `unique` frame = 2 entries.
    // Pre-fix this snapshot would have all 41 frames — the leak.
    expect(snap).toHaveLength(2)
    // Ordering must match push order (bottom-to-top in the array).
    expect(snap[0]!.get(repeated.id)).toBe('dup-39')
    expect(snap[1]!.get(unique.id)).toBe('unique')

    for (let i = 0; i < 41; i++) popContext()
  })

  test('multi-key frame: kept if it provides ANY un-shadowed id', () => {
    // Frame with two contexts; only one is shadowed by a deeper push.
    const a = createContext('a')
    const b = createContext('b')
    pushContext(new Map<symbol, unknown>([[a.id, 'a1'], [b.id, 'b1']]))
    pushContext(new Map([[a.id, 'a2']])) // shadows `a`, NOT `b`

    const snap = captureContextStack()
    // Both frames should remain: the upper provides `a`, the lower
    // still provides un-shadowed `b`.
    expect(snap).toHaveLength(2)

    // Verify useContext semantics survive: a→a2, b→b1
    setContextStackProvider(() => snap)
    expect(useContext(a)).toBe('a2')
    expect(useContext(b)).toBe('b1')
    setContextStackProvider(() => testStack)

    popContext()
    popContext()
  })

  test('multi-key frame: dropped if ALL its ids are shadowed', () => {
    const a = createContext('a')
    const b = createContext('b')
    pushContext(new Map<symbol, unknown>([[a.id, 'a1'], [b.id, 'b1']]))
    pushContext(new Map<symbol, unknown>([[a.id, 'a2'], [b.id, 'b2']]))

    const snap = captureContextStack()
    expect(snap).toHaveLength(1)
    expect(snap[0]!.get(a.id)).toBe('a2')
    expect(snap[0]!.get(b.id)).toBe('b2')

    popContext()
    popContext()
  })

  test('useContext returns same value pre/post dedup for arbitrary read patterns', () => {
    // Cross-check: build a complex stack, capture, then verify useContext
    // returns the same value when reading from the original stack vs the
    // deduped snapshot. This is the load-bearing semantic-equivalence
    // assertion for the safety argument.
    const a = createContext('a-default')
    const b = createContext('b-default')
    const c = createContext('c-default')
    pushContext(new Map([[a.id, 'a1']]))
    pushContext(new Map<symbol, unknown>([[a.id, 'a2'], [b.id, 'b1']]))
    pushContext(new Map([[c.id, 'c1']]))
    pushContext(new Map([[a.id, 'a3']]))
    pushContext(new Map([[b.id, 'b2']]))

    // Read against original stack
    const beforeA = useContext(a)
    const beforeB = useContext(b)
    const beforeC = useContext(c)

    // Capture (dedup happens) and read against the snapshot
    const snap = captureContextStack()
    setContextStackProvider(() => snap)
    const afterA = useContext(a)
    const afterB = useContext(b)
    const afterC = useContext(c)

    expect(afterA).toBe(beforeA) // 'a3' from the topmost frame
    expect(afterB).toBe(beforeB) // 'b2' from the topmost frame
    expect(afterC).toBe(beforeC) // 'c1' (still the only c-provider)

    // Clean up
    setContextStackProvider(() => testStack)
    for (let i = 0; i < 5; i++) popContext()
  })
})

// ─── restoreContextStack — works against deduped snapshots ───────────────────

describe('restoreContextStack — with deduped snapshots', () => {
  let testStack: Map<symbol, unknown>[]

  beforeEach(() => {
    testStack = []
    setContextStackProvider(() => testStack)
  })

  afterEach(() => {
    const freshStack: Map<symbol, unknown>[] = []
    setContextStackProvider(() => freshStack)
  })

  test('restores deduped snapshot — fn() sees correct context, stack cleans up', () => {
    const ctx = createContext('default')
    pushContext(new Map([[ctx.id, 'A']]))
    pushContext(new Map([[ctx.id, 'B']]))
    pushContext(new Map([[ctx.id, 'C']]))

    const snap = captureContextStack()
    expect(snap).toHaveLength(1) // dedup collapsed to topmost

    // Now empty the stack to simulate post-mount state
    popContext()
    popContext()
    popContext()
    expect(testStack).toHaveLength(0)

    // Restore the deduped snapshot
    const observed = restoreContextStack(snap, () => {
      // Inside fn(): stack has the deduped frame
      expect(testStack).toHaveLength(1)
      return useContext(ctx)
    })

    // fn() saw the topmost-frame value, NOT 'default' — semantic equivalence
    expect(observed).toBe('C')
    // After restore, the snapshot's frames are removed by reference identity
    expect(testStack).toHaveLength(0)
  })

  test('restoring 40-duplicate stack only pushes/pops 1 frame post-dedup', () => {
    // This is the bug-shape regression test. Pre-dedup, this snapshot was
    // 40 entries; restore pushed 40 then removed 40. Post-dedup, both
    // operations move 1 frame.
    const ctx = createContext('default')
    for (let i = 0; i < 40; i++) {
      pushContext(new Map([[ctx.id, `dup-${i}`]]))
    }
    const snap = captureContextStack()
    expect(snap).toHaveLength(1)

    // Empty the live stack so the restore is observable in isolation.
    while (testStack.length > 0) popContext()

    let observedLenInside = -1
    restoreContextStack(snap, () => {
      observedLenInside = testStack.length
    })

    // 1 push during fn, 1 splice after = stack stays balanced.
    expect(observedLenInside).toBe(1)
    expect(testStack).toHaveLength(0)
  })
})

// ─── Leak audit: snapshot allocations stay bounded under deep stacks ─────────
//
// This is the regression lock for the heap-snapshot finding that motivated
// the dedup. Reported in 0.21.x: 1.22 MB / 321k-entry arrays retained by
// effect closures under deeply-nested reactive boundaries. The 0.23.0
// restoreContextStack fix cleaned the live stack but residual snapshot
// amplification persisted (~3 MB / 20×40k-entry arrays). This dedup
// closes that. The test below makes the bug-shape impossible to
// re-introduce silently: it builds the deep-stack scenario, captures
// N snapshots that previously would each have held the stack-depth, and
// asserts the TOTAL frame count across all snapshots scales with the
// number of DISTINCT context ids in scope, NOT with the stack depth.

describe('captureContextStack — leak audit (regression lock)', () => {
  let testStack: Map<symbol, unknown>[]

  beforeEach(() => {
    testStack = []
    setContextStackProvider(() => testStack)
  })

  afterEach(() => {
    const freshStack: Map<symbol, unknown>[] = []
    setContextStackProvider(() => freshStack)
  })

  test('1000 snapshots of a deep duplicate-heavy stack retain bounded total frames', () => {
    // Build a stack of 100 frames, all pushing the same context (simulates
    // nested restoreContextStack windows). Then capture 1000 snapshots —
    // one per effect setup, as happens in a large component tree.
    const ctx = createContext('default')
    for (let i = 0; i < 100; i++) {
      pushContext(new Map([[ctx.id, `dup-${i}`]]))
    }

    const snapshots: ContextSnapshot[] = []
    for (let i = 0; i < 1000; i++) {
      snapshots.push(captureContextStack())
    }

    // Pre-dedup: 1000 snapshots × 100 frames = 100,000 frame references.
    // Post-dedup: 1000 snapshots × 1 frame (topmost) = 1,000 frame references.
    // The assertion bounds total retention at the dedup-correct ceiling.
    const totalFrames = snapshots.reduce((sum, s) => sum + s.length, 0)
    expect(totalFrames).toBe(1000) // 1000 snapshots × 1 unique id

    // Clean up
    for (let i = 0; i < 100; i++) popContext()
  })

  test('mixed deep stack: total frames bounded by distinct id count, not depth', () => {
    // 50 unique contexts pushed into a stack of 500 frames (10 duplicates
    // per context). Capture 100 snapshots.
    const ctxs = Array.from({ length: 50 }, () => createContext('default'))
    for (let depth = 0; depth < 10; depth++) {
      for (const ctx of ctxs) {
        pushContext(new Map([[ctx.id, `d${depth}`]]))
      }
    }
    expect(testStack).toHaveLength(500)

    const snapshots: ContextSnapshot[] = []
    for (let i = 0; i < 100; i++) {
      snapshots.push(captureContextStack())
    }

    // Pre-dedup: 100 × 500 = 50,000 frame references.
    // Post-dedup: 100 × 50 (topmost per distinct id) = 5,000 frame
    // references. 10× reduction matches the empirical bug-shape.
    const totalFrames = snapshots.reduce((sum, s) => sum + s.length, 0)
    expect(totalFrames).toBe(100 * 50)

    // Clean up
    for (let i = 0; i < 500; i++) popContext()
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
    expect(captureContextStack()).toHaveLength(1) // deduped snapshot length

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
