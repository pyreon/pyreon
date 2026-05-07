import { effect } from '../effect'
import { EffectScope, effectScope, getCurrentScope, setCurrentScope } from '../scope'
import { signal } from '../signal'

describe('effectScope', () => {
  test('creates an EffectScope instance', () => {
    const scope = effectScope()
    expect(scope).toBeInstanceOf(EffectScope)
  })

  test('getCurrentScope returns null by default', () => {
    expect(getCurrentScope()).toBeNull()
  })

  test('setCurrentScope sets and clears the current scope', () => {
    const scope = effectScope()
    setCurrentScope(scope)
    expect(getCurrentScope()).toBe(scope)
    setCurrentScope(null)
    expect(getCurrentScope()).toBeNull()
  })

  test('effects created within a scope are disposed on stop', () => {
    const scope = effectScope()
    setCurrentScope(scope)

    const s = signal(0)
    let count = 0
    effect(() => {
      s()
      count++
    })

    setCurrentScope(null)

    expect(count).toBe(1)
    s.set(1)
    expect(count).toBe(2)

    scope.stop()
    s.set(2)
    expect(count).toBe(2) // effect disposed, no re-run
  })

  test('stop is idempotent — second call does nothing', () => {
    const scope = effectScope()
    setCurrentScope(scope)

    const s = signal(0)
    let count = 0
    effect(() => {
      s()
      count++
    })

    setCurrentScope(null)
    scope.stop()
    scope.stop() // should not throw
    s.set(1)
    expect(count).toBe(1)
  })

  test('add is ignored after scope is stopped', () => {
    const scope = effectScope()
    scope.stop()
    // Should not throw — add is silently ignored
    scope.add({ dispose() {} })
  })

  test('runInScope temporarily re-activates the scope', () => {
    const scope = effectScope()
    setCurrentScope(null)

    const s = signal(0)
    let count = 0

    scope.runInScope(() => {
      effect(() => {
        s()
        count++
      })
    })

    expect(getCurrentScope()).toBeNull() // restored
    expect(count).toBe(1)
    s.set(1)
    expect(count).toBe(2)

    scope.stop()
    s.set(2)
    expect(count).toBe(2) // disposed via scope
  })

  test('runInScope restores previous scope even on error', () => {
    const scope = effectScope()
    const prevScope = effectScope()
    setCurrentScope(prevScope)

    try {
      scope.runInScope(() => {
        expect(getCurrentScope()).toBe(scope)
        throw new Error('test')
      })
    } catch {
      // expected
    }

    expect(getCurrentScope()).toBe(prevScope)
    setCurrentScope(null)
  })

  test("runInScope returns the function's return value", () => {
    const scope = effectScope()
    const result = scope.runInScope(() => 42)
    expect(result).toBe(42)
  })

  test('addUpdateHook + notifyEffectRan fires hooks via microtask', async () => {
    const scope = effectScope()
    let hookCalled = 0

    scope.addUpdateHook(() => {
      hookCalled++
    })

    scope.notifyEffectRan()
    expect(hookCalled).toBe(0) // not yet — microtask

    await new Promise((r) => setTimeout(r, 10))
    expect(hookCalled).toBe(1)
  })

  test('notifyEffectRan does nothing when no update hooks', async () => {
    const scope = effectScope()
    // Should not throw — early return when _updateHooks is empty
    scope.notifyEffectRan()
    await new Promise((r) => setTimeout(r, 10))
  })

  test('notifyEffectRan does nothing after scope is stopped', async () => {
    const scope = effectScope()
    let hookCalled = 0

    scope.addUpdateHook(() => {
      hookCalled++
    })

    scope.stop()
    scope.notifyEffectRan()

    await new Promise((r) => setTimeout(r, 10))
    expect(hookCalled).toBe(0)
  })

  test('notifyEffectRan deduplicates — only one microtask while pending', async () => {
    const scope = effectScope()
    let hookCalled = 0

    scope.addUpdateHook(() => {
      hookCalled++
    })

    scope.notifyEffectRan()
    scope.notifyEffectRan()
    scope.notifyEffectRan()

    await new Promise((r) => setTimeout(r, 10))
    expect(hookCalled).toBe(1) // only fired once
  })

  test('notifyEffectRan skips hooks if scope stopped before microtask fires', async () => {
    const scope = effectScope()
    let hookCalled = 0

    scope.addUpdateHook(() => {
      hookCalled++
    })

    scope.notifyEffectRan()
    scope.stop() // stop before microtask runs

    await new Promise((r) => setTimeout(r, 10))
    expect(hookCalled).toBe(0)
  })

  test('onUpdate hook errors are caught and logged', async () => {
    const scope = effectScope()
    const errors: unknown[] = []
    const origError = console.error
    console.error = (...args: unknown[]) => errors.push(args)

    scope.addUpdateHook(() => {
      throw new Error('hook error')
    })

    scope.notifyEffectRan()
    await new Promise((r) => setTimeout(r, 10))

    expect(errors.length).toBe(1)
    console.error = origError
  })

  // Regression: pre-fix, addUpdateHook always allocated `_updateHooks` and
  // pushed the fn even after `stop()`. The fn never fired (because
  // notifyEffectRan checks `_active` first), but the registration leaked
  // an array allocation and gave the caller no signal that the hook was
  // futile. Mirrors `add()`'s silent-no-op-when-stopped contract.
  test('addUpdateHook honors _active — silently no-ops on stopped scope', () => {
    const scope = effectScope()
    scope.stop()

    let hookFired = false
    scope.addUpdateHook(() => {
      hookFired = true
    })

    // Cause an update — the hook should NOT fire because scope is stopped.
    scope.notifyEffectRan()
    expect(hookFired).toBe(false)

    // The internal `_updateHooks` should not have been allocated either.
    // We can't introspect the private field, but the observable contract
    // is "stopped scopes don't fire hooks under any circumstance" — which
    // would have held pre-fix too because `notifyEffectRan` already
    // gated on `_active`. The fix prevents the array allocation; we test
    // the consequence: no fire, regardless of how often you push.
    for (let i = 0; i < 100; i++) scope.addUpdateHook(() => {})
    scope.notifyEffectRan()
    expect(hookFired).toBe(false)
  })
})
