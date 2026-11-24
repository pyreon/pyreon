/**
 * The reactivity half of the lazy context owner (see scope.ts): the pending
 * frame, the claim, the pin `getCurrentScope()` applies, `_isDroppable`, and
 * `runWithContextOwner` running its callback with no component pending.
 * runtime-dom's `lazy-context-owner.test.tsx` covers the mounted behaviour.
 */
import {
  _claimContextOwner,
  _currentScope,
  _devOwner,
  _swapPendingOwner,
  effect,
  effectScope,
  getContextOwner,
  getCurrentScope,
  runWithContextOwner,
  setContextOwner,
  setCurrentScope,
  signal,
} from '../index'

afterEach(() => {
  _swapPendingOwner(null)
  setContextOwner(null)
  setCurrentScope(null)
  _devOwner!.late = false
})

describe('_swapPendingOwner / _claimContextOwner', () => {
  it('returns 0 and changes nothing when no component is pending', () => {
    const owner = effectScope()
    setContextOwner(owner)
    expect(_claimContextOwner()).toBe(0)
    expect(getContextOwner()).toBe(owner)
  })

  it('claims the pending scope: it becomes the owner, is pinned, and the frame empties', () => {
    const scope = effectScope()
    expect(_swapPendingOwner(scope)).toBeNull()
    expect(scope._isDroppable()).toBe(true)
    expect(_claimContextOwner()).toBe(1)
    expect(getContextOwner()).toBe(scope)
    expect(scope._isDroppable()).toBe(false)
    // Claimed once: a second provide() finds nothing pending.
    expect(_claimContextOwner()).toBe(0)
  })

  it('reports a LATE claim in dev', () => {
    _swapPendingOwner(effectScope())
    _devOwner!.late = true
    expect(_claimContextOwner()).toBe(2)
  })

  it('swap returns the previous frame so a caller can restore it', () => {
    const outer = effectScope()
    const inner = effectScope()
    _swapPendingOwner(outer)
    const prev = _swapPendingOwner(inner)
    expect(prev).toBe(outer)
    expect(_swapPendingOwner(prev)).toBe(inner)
    expect(_claimContextOwner()).toBe(1)
    expect(getContextOwner()).toBe(outer)
  })
})

describe('runWithContextOwner', () => {
  it('runs its callback with no component pending and restores both owner and frame', () => {
    const pending = effectScope()
    const restored = effectScope()
    _swapPendingOwner(pending)
    const claim = runWithContextOwner(restored, () => {
      expect(getContextOwner()).toBe(restored)
      return _claimContextOwner()
    })
    expect(claim).toBe(0)
    expect(getContextOwner()).toBeNull()
    // The outer component is still pending and can still claim.
    expect(_claimContextOwner()).toBe(1)
    expect(getContextOwner()).toBe(pending)
  })

  it('restores on a throw', () => {
    const pending = effectScope()
    _swapPendingOwner(pending)
    expect(() =>
      runWithContextOwner(effectScope(), () => {
        throw new Error('x')
      }),
    ).toThrow('x')
    expect(getContextOwner()).toBeNull()
    expect(_claimContextOwner()).toBe(1)
  })
})

describe('getCurrentScope pins, _currentScope does not', () => {
  it('both return the current scope (or null)', () => {
    expect(getCurrentScope()).toBeNull()
    expect(_currentScope()).toBeNull()
    const s = effectScope()
    setCurrentScope(s)
    expect(_currentScope()).toBe(s)
    expect(s._isDroppable()).toBe(true)
    expect(getCurrentScope()).toBe(s)
    expect(s._isDroppable()).toBe(false)
  })

  it('a registration or an onUpdate hook makes a scope non-droppable', () => {
    const withEffect = effectScope()
    withEffect.runInScope(() => {
      effect(() => {
        signal(0)()
      })
    })
    expect(withEffect._isDroppable()).toBe(false)
    const withHook = effectScope()
    withHook.addUpdateHook(() => {})
    expect(withHook._isDroppable()).toBe(false)
  })
})
