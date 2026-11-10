/**
 * Dead-binding elision: a `renderEffect` / `_bind` whose FIRST run tracked no
 * dependency can never re-run (only a tracked source schedules a re-run), so
 * it returns the shared `_noopDispose` and registers nothing with the scope.
 * Live bindings keep their own disposer and scope entry.
 */
import { _bind, _noopDispose, renderEffect } from '../effect'
import { effectScope, getCurrentScope, setCurrentScope } from '../scope'
import { signal } from '../signal'
import { runUntracked } from '../tracking'

function inScope<T>(fn: () => T): { result: T; empty: boolean } {
  const scope = effectScope()
  const prev = getCurrentScope()
  setCurrentScope(scope)
  try {
    const result = fn()
    return { result, empty: scope._isEmpty() }
  } finally {
    setCurrentScope(prev)
    scope.stop()
  }
}

describe.each([
  ['renderEffect', renderEffect],
  ['_bind', _bind],
] as const)('%s dead-binding elision', (_name, make) => {
  test('no tracked read: runs once, returns the shared no-op, registers nothing', () => {
    let runs = 0
    const { result, empty } = inScope(() =>
      make(() => {
        runs++
      }),
    )
    expect(runs).toBe(1)
    expect(result).toBe(_noopDispose)
    expect(empty).toBe(true)
    expect(() => result()).not.toThrow()
  })

  test('only untracked reads: dead', () => {
    const s = signal(1)
    let seen = 0
    const { result, empty } = inScope(() =>
      make(() => {
        seen = runUntracked(() => s())
      }),
    )
    expect(seen).toBe(1)
    expect(result).toBe(_noopDispose)
    expect(empty).toBe(true)
  })

  test('a tracked read keeps a live, scope-registered binding', () => {
    const s = signal(1)
    let seen = 0
    const scope = effectScope()
    const prev = getCurrentScope()
    setCurrentScope(scope)
    let dispose: () => void
    try {
      dispose = make(() => {
        seen = s()
      })
    } finally {
      setCurrentScope(prev)
    }
    expect(dispose).not.toBe(_noopDispose)
    expect(scope._isEmpty()).toBe(false)
    s.set(2)
    expect(seen).toBe(2)
    scope.stop()
    s.set(3)
    expect(seen).toBe(2)
  })
})
