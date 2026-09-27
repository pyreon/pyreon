import { _enterCleanupFrame, _exitCleanupFrame, effect, onCleanup, signal } from '../index'

describe('_enterCleanupFrame / _exitCleanupFrame', () => {
  test('collects onCleanup outside any effect', () => {
    const fn = () => {}
    const t = _enterCleanupFrame()
    onCleanup(fn)
    expect(_exitCleanupFrame(t)).toEqual([fn])
  })

  test('returns null when nothing was registered (no allocation)', () => {
    const t = _enterCleanupFrame()
    expect(_exitCleanupFrame(t)).toBeNull()
  })

  test('a frame inside an effect run does not steal or drop the effect cleanups', () => {
    const log: string[] = []
    const s = signal(0)
    let frameGot: unknown = null
    const e = effect(() => {
      s()
      onCleanup(() => log.push('before'))
      const t = _enterCleanupFrame()
      onCleanup(() => log.push('frame'))
      frameGot = _exitCleanupFrame(t)
      onCleanup(() => log.push('after'))
    })
    expect((frameGot as unknown[]).length).toBe(1)
    s.set(1)
    expect(log).toEqual(['before', 'after'])
    e.dispose()
  })

  test('nested frames restore the outer frame collector', () => {
    const a = () => {}
    const b = () => {}
    const outer = _enterCleanupFrame()
    onCleanup(a)
    const inner = _enterCleanupFrame()
    onCleanup(b)
    expect(_exitCleanupFrame(inner)).toEqual([b])
    expect(_exitCleanupFrame(outer)).toEqual([a])
  })
})

describe('EffectScope.runInScope owns setup-time onCleanup', () => {
  test('runs on stop(), not on an enclosing effect re-run', async () => {
    const { effectScope } = await import('../index')
    const log: string[] = []
    const s = signal(0)
    const scope = effectScope()
    const e = effect(() => {
      if (s() === 0) scope.runInScope(() => onCleanup(() => log.push('scoped')))
    })
    s.set(1)
    expect(log).toEqual([])
    scope.stop()
    expect(log).toEqual(['scoped'])
    e.dispose()
  })
})
