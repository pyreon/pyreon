import { describe, expect, it } from 'vitest'
import { effect, effectScope, setErrorHandler, signal } from '../index'

/**
 * `EffectScope.stop()` runs user code (a registered cleanup: an `onCleanup` in
 * a component's `onMount`, a `runInScope` callback's). One that throws is
 * reported through the effect error handler and never stops the rest of the
 * scope's teardown: the later cleanups run and the effects are disposed.
 */
describe('EffectScope.stop with a cleanup that throws', () => {
  it('reports it and still runs the rest', () => {
    const errors: unknown[] = []
    setErrorHandler((err) => errors.push(err))
    try {
      const scope = effectScope()
      const s = signal(0)
      const seen: number[] = []
      const ran: string[] = []
      scope.runInScope(() => {
        scope.add(() => {
          throw new Error('first')
        })
        effect(() => {
          seen.push(s())
        })
        scope.add(() => ran.push('second'))
      })
      expect(() => scope.stop()).not.toThrow()
      expect(ran).toEqual(['second'])
      expect(errors.map(String)).toEqual(['Error: first'])
      // The effect was disposed despite the throw before it.
      s.set(1)
      expect(seen).toEqual([0])
    } finally {
      // Back to the default handler.
      setErrorHandler(undefined as never)
    }
  })
})
