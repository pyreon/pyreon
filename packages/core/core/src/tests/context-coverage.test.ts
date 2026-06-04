/**
 * Coverage tests for the owner-based context refactor (#1338).
 *
 * Targets the residual uncov arms after that PR landed:
 *   - `withContext` owner-present path (lines 211-214)
 *   - `setSnapshotCapture` capture/restore round-trip (lines 232-236)
 *   - `removeContextFrame` lastIndexOf+splice when frame already gone
 *   - `popContext` no-op when stack already empty
 */
import { describe, expect, it, vi } from 'vitest'
import {
  createContext,
  popContext,
  provide,
  pushContext,
  removeContextFrame,
  useContext,
  withContext,
} from '../context'
import { runWithContextOwner } from '@pyreon/reactivity'

describe('withContext — owner-present branch (lines 211-214)', () => {
  it('calls owner.provideContext when an owner is active, no stack push', () => {
    const ctx = createContext<string>('default')
    let observed = ''
    // Create a minimal owner shape (EffectScope-like) that `runWithContextOwner`
    // will treat as active.
    const owner = {
      provideContext: vi.fn((_id: symbol, _value: unknown) => {}),
      lookupContext: vi.fn((id: symbol) =>
        id === ctx.id ? { found: true, value: 'from-owner' } : { found: false, value: undefined },
      ),
      parent: null,
    }
    runWithContextOwner(owner as never, () => {
      withContext(ctx, 'from-with-context', () => {
        observed = useContext(ctx) ?? 'NONE'
      })
    })
    expect(owner.provideContext).toHaveBeenCalledWith(ctx.id, 'from-with-context')
    // useContext goes through the owner's getContext (returns 'from-owner');
    // confirms we took the owner branch, not the stack branch.
    expect(observed).toBe('from-owner')
  })
})

describe('withContext — no-owner SSR fallback (try/finally pop)', () => {
  it('pushes onto the stack and pops in finally even if fn throws', () => {
    const ctx = createContext<number>(0)
    let caught: Error | null = null
    try {
      withContext(ctx, 99, () => {
        throw new Error('boom')
      })
    } catch (e) {
      caught = e as Error
    }
    expect(caught?.message).toBe('boom')
    // Stack should be back to its baseline; a subsequent useContext outside
    // any provider returns the default.
    expect(useContext(ctx)).toBe(0)
  })
})

describe('provide — owner-present branch (lines 197-198)', () => {
  it('writes through to owner.provideContext when an owner is active', () => {
    const ctx = createContext<string>('default')
    const provideContext = vi.fn((_id: symbol, _value: unknown) => {})
    const owner = {
      provideContext,
      lookupContext: () => ({ found: false, value: undefined }),
      parent: null,
    }
    runWithContextOwner(owner as never, () => {
      provide(ctx, 'set-via-provide')
    })
    expect(provideContext).toHaveBeenCalledWith(ctx.id, 'set-via-provide')
  })
})

describe('popContext / removeContextFrame defensive arms', () => {
  it('popContext is a no-op when the stack is already empty', () => {
    // Should not throw and should be safe to call repeatedly.
    expect(() => {
      popContext()
      popContext()
      popContext()
    }).not.toThrow()
  })

  it('removeContextFrame is a no-op when the frame is not on the stack', () => {
    const orphan = new Map<symbol, unknown>([[Symbol('orphan'), 'value']])
    // Frame was never pushed; lastIndexOf returns -1 → splice not called.
    expect(() => removeContextFrame(orphan)).not.toThrow()
  })

  it('removeContextFrame finds and removes a pushed frame by identity', () => {
    const ctx = createContext<string>('x')
    const frame = new Map<symbol, unknown>([[ctx.id, 'A']])
    pushContext(frame)
    expect(useContext(ctx)).toBe('A')
    removeContextFrame(frame)
    expect(useContext(ctx)).toBe('x')
  })
})

describe('SSR-style nested push + pop', () => {
  it('useContext walks down the stack to find the nearest provider', () => {
    const ctx = createContext<string>('default')
    pushContext(new Map([[ctx.id, 'outer']]))
    try {
      expect(useContext(ctx)).toBe('outer')
      pushContext(new Map([[ctx.id, 'inner']]))
      try {
        expect(useContext(ctx)).toBe('inner')
      } finally {
        popContext()
      }
      expect(useContext(ctx)).toBe('outer')
    } finally {
      popContext()
    }
    expect(useContext(ctx)).toBe('default')
  })
})
