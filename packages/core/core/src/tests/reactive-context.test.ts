import { effectScope, setContextOwner, signal } from '@pyreon/reactivity'
import { createReactiveContext, provide, useContext } from '../context'

// Coverage for `createReactiveContext` under the owner-based context model.
// Context lives on the current owner (an `EffectScope`) and resolves up the
// owner chain; it is released when the owner is disposed. The renderer wires
// owners during mount — here we drive `setContextOwner` directly to unit-test
// the resolution logic without a DOM. End-to-end mount coverage lives in
// `@pyreon/runtime-dom`'s context tests.
describe('createReactiveContext (owner-based)', () => {
  test('default accessor returns the default value when no provider', () => {
    const Ctx = createReactiveContext<'light' | 'dark'>('light')
    const getter = useContext(Ctx)
    expect(typeof getter).toBe('function')
    expect(getter()).toBe('light')
  })

  test('consumer re-reads the latest signal value through the provided accessor', () => {
    const Ctx = createReactiveContext<'light' | 'dark'>('light')
    const mode = signal<'light' | 'dark'>('light')
    const scope = effectScope()
    const prev = setContextOwner(scope)
    try {
      provide(Ctx, () => mode())
      const getter = useContext(Ctx)
      expect(getter()).toBe('light')
      mode.set('dark')
      // The accessor re-reads the live signal — the provided value is the
      // accessor itself, captured once, so later signal writes are visible.
      expect(getter()).toBe('dark')
    } finally {
      setContextOwner(prev)
    }
    // Outside any owner, useContext returns the default accessor.
    expect(useContext(Ctx)()).toBe('light')
  })

  test('nested owners shadow the outer provider; the outer resolves again once the inner owner is left', () => {
    const Ctx = createReactiveContext<string>('default')

    const outer = effectScope()
    const prevOuter = setContextOwner(outer)
    provide(Ctx, () => 'outer')
    expect(useContext(Ctx)()).toBe('outer')

    // A child owner chains to its parent (the renderer sets `_parent`).
    const inner = effectScope()
    inner._parent = outer
    setContextOwner(inner)
    provide(Ctx, () => 'inner')
    expect(useContext(Ctx)()).toBe('inner') // inner shadows outer

    // Leaving the inner owner restores the outer's value.
    setContextOwner(outer)
    expect(useContext(Ctx)()).toBe('outer')

    setContextOwner(prevOuter)
    // Disposed/left owners are gone — back to the default.
    expect(useContext(Ctx)()).toBe('default')
  })
})
