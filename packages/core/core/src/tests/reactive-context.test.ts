import { signal } from '@pyreon/reactivity'
import { runWithHooks } from '../component'
import { createReactiveContext, popContext, provide, useContext } from '../context'

// Coverage for `createReactiveContext` — previously untested public API.
describe('createReactiveContext', () => {
  test('default accessor returns the default value when no provider', () => {
    const Ctx = createReactiveContext<'light' | 'dark'>('light')
    const getter = useContext(Ctx)
    expect(typeof getter).toBe('function')
    expect(getter()).toBe('light')
  })

  test('consumer re-reads the latest signal value through the provided accessor', () => {
    const Ctx = createReactiveContext<'light' | 'dark'>('light')
    const mode = signal<'light' | 'dark'>('light')

    const seen: Array<'light' | 'dark'> = []

    // provide() registers an onUnmount, so it must run under runWithHooks.
    const { hooks } = runWithHooks(() => {
      provide(Ctx, () => mode())
      const getter = useContext(Ctx)
      seen.push(getter())
      mode.set('dark')
      seen.push(getter())
      return null
    }, {})

    expect(seen).toEqual(['light', 'dark'])

    // Unmount the provider — outside the scope, useContext returns the default.
    for (const fn of hooks.unmount) fn()
    const outerGetter = useContext(Ctx)
    expect(outerGetter()).toBe('light')
  })

  test('nested providers shadow the outer provider, and the outer is restored after unmount', () => {
    const Ctx = createReactiveContext<string>('default')

    const outerRun = runWithHooks(() => {
      provide(Ctx, () => 'outer')
      const outerGetter = useContext(Ctx)
      expect(outerGetter()).toBe('outer')

      const innerRun = runWithHooks(() => {
        provide(Ctx, () => 'inner')
        const innerGetter = useContext(Ctx)
        expect(innerGetter()).toBe('inner')
        return null
      }, {})
      // Run the inner provider's unmount to pop its frame.
      for (const fn of innerRun.hooks.unmount) fn()

      // Outer provider is restored.
      expect(outerGetter()).toBe('outer')
      return null
    }, {})

    // Clean up outer frame.
    for (const fn of outerRun.hooks.unmount) fn()

    // After full teardown, useContext falls back to the default accessor.
    expect(useContext(Ctx)()).toBe('default')

    // Sanity — popContext on an already-empty stack should not crash.
    popContext()
  })
})
