import { describe, expect, it } from 'vitest'
import { signal } from '../signal'

// A signal method used without its signal (`ref={sig.set}`,
// `promise.then(sig.set)`) runs with `this === undefined`: the methods live on
// a shared prototype. It used to fail as "Cannot read properties of undefined
// (reading '_v')"; dev builds now name the mistake and the fix (#4356).
// Bisect-verified: without the guards these specs see the bare TypeError.
describe('detached signal methods', () => {
  it.each(['set', 'update', 'peek', 'trigger', 'subscribe'] as const)(
    'sig.%s called detached throws a [Pyreon] error naming the fix',
    (method) => {
      const s = signal(0)
      const detached = s[method] as (...args: unknown[]) => unknown
      expect(() => detached(method === 'update' ? (n: number) => n + 1 : () => {})).toThrow(
        `[Pyreon] signal.${method}() was called without its signal`,
      )
      expect(() => detached(1)).toThrow(`(v) => sig.${method}(v)`)
    },
  )

  it('called on the signal, the methods work as before', () => {
    const s = signal(1)
    s.set(2)
    s.update((n) => n + 1)
    expect(s.peek()).toBe(3)
  })
})
