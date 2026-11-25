/**
 * A node disposed WHILE ITS OWN RUN IS ON THE STACK must end that run owning
 * nothing.
 *
 * `dispose()` tears down what the node holds at that moment, but the run keeps
 * going: it can still create inner effects, register `onCleanup` callbacks,
 * return a cleanup and read signals. Each of those used to land on a node that
 * nothing would ever dispose again — inner effects kept running on their
 * sources after their owner was gone, cleanups never ran, and later reads
 * re-subscribed the dead node to its sources for their lifetime.
 *
 * The dispose can come from the body itself, from the owning scope stopping
 * (a write inside the body unmounts the component that owns the effect), or
 * from anything else the body calls.
 */
import { computed } from '../computed'
import { _effectOwned, effect, onCleanup, renderEffect, setErrorHandler } from '../effect'
import { effectScope, onScopeDispose } from '../scope'
import { signal } from '../signal'

const subs = (s: { debug(): { subscriberCount: number } }) => s.debug().subscriberCount

describe('effect disposed during its own run', () => {
  let errors: unknown[]
  beforeEach(() => {
    errors = []
    setErrorHandler((err) => errors.push(err))
  })
  afterEach(() => {
    setErrorHandler((err) => console.error(err))
  })

  test('onCleanup, the returned cleanup and inner effects of the disposing run are torn down', () => {
    const log: string[] = []
    const s = signal(0)
    let handle: { dispose(): void } | undefined
    handle = effect(() => {
      s()
      if (handle) handle.dispose()
      onCleanup(() => log.push('onCleanup'))
      effect(() => {
        s()
        log.push('inner run')

        return () => log.push('inner cleanup')
      })

      return () => log.push('returned')
    })
    log.length = 0
    s.set(1) // disposes itself mid-run, then registers again
    expect(log).toEqual([
      // the dispose tears down run 1
      'inner cleanup',
      'onCleanup',
      'returned',
      // run 2 registers after its own dispose …
      'inner run',
      // … and is torn down when the run ends
      'inner cleanup',
      'onCleanup',
      'returned',
    ])
    log.length = 0
    s.set(2)
    expect(log).toEqual([]) // no leaked inner effect
    expect(subs(s)).toBe(0)
    expect(errors).toEqual([])
  })

  test('an inner effect created EARLIER in the disposing run is torn down too', () => {
    const s = signal(0)
    const trigger = signal(0)
    let innerRuns = 0
    let handle: { dispose(): void } | undefined
    handle = effect(() => {
      const t = trigger()
      effect(() => {
        s()
        innerRuns++
      })
      if (t === 1) handle?.dispose()
    })
    trigger.set(1)
    innerRuns = 0
    s.set(1)
    expect(innerRuns).toBe(0)
    expect(subs(s)).toBe(0)
    expect(errors).toEqual([])
  })

  test('a read after the dispose does not re-subscribe the dead effect', () => {
    const a = signal(0)
    const b = signal(0)
    const fresh = signal(0)
    let handle: { dispose(): void } | undefined
    handle = effect(() => {
      a()
      if (a() === 1) handle?.dispose()
      b() // a confirmed position past the dispose
      if (a() === 1) fresh() // a new dependency read after the dispose
    })
    a.set(1)
    expect(errors).toEqual([])
    expect(subs(a)).toBe(0)
    expect(subs(b)).toBe(0)
    expect(subs(fresh)).toBe(0)
  })

  test('the owning scope stopping during a member effect run tears that run down', () => {
    const s = signal(0)
    const unmount = signal(false)
    const scope = effectScope()
    let innerRuns = 0
    let cleanups = 0
    scope.runInScope(() => {
      effect(() => {
        if (unmount()) scope.stop()
        onCleanup(() => cleanups++)
        effect(() => {
          s()
          innerRuns++
        })
      })
    })
    unmount.set(true)
    innerRuns = 0
    cleanups = 0
    s.set(1)
    expect(innerRuns).toBe(0)
    expect(cleanups).toBe(0) // already ran at run end, exactly once each
    expect(subs(s)).toBe(0)
    expect(subs(unmount)).toBe(0)
  })

  test('the owning scope stopping during a member effect FIRST run disposes the member', () => {
    const s = signal(0)
    const scope = effectScope()
    let runs = 0
    scope.runInScope(() => {
      effect(() => {
        s()
        runs++
        scope.stop()
      })
    })
    s.set(1)
    expect(runs).toBe(1)
    expect(subs(s)).toBe(0)
  })

  test('an owned effect (`_effectOwned`) disposed by its owner during its run releases what the run registered', () => {
    // The runtime-dom structural-boundary shape: not in any scope, owned by
    // the cleanup its disposer is returned to — here the owner runs mid-run.
    const s = signal(0)
    const close = signal(false)
    let innerRuns = 0
    let cleanups = 0
    let owner: (() => void) | undefined
    owner = _effectOwned(() => {
      if (close()) owner?.()
      onCleanup(() => cleanups++)
      effect(() => {
        s()
        innerRuns++
      })
    })
    close.set(true)
    innerRuns = 0
    cleanups = 0
    s.set(1)
    expect(innerRuns).toBe(0)
    expect(cleanups).toBe(0)
    expect(subs(s)).toBe(0)
    expect(subs(close)).toBe(0)
  })

  test('a registration with an already-stopped scope is disposed, not dropped', () => {
    const scope = effectScope()
    scope.stop()
    const log: string[] = []
    scope.runInScope(() => {
      onScopeDispose(() => log.push('disposed'))
    })
    expect(log).toEqual(['disposed'])
  })
})

describe('renderEffect disposed during its own run', () => {
  test('a read after the dispose does not re-subscribe it', () => {
    const a = signal(0)
    const fresh = signal(0)
    let dispose: (() => void) | undefined
    dispose = renderEffect(() => {
      if (a() === 1) {
        dispose?.()
        fresh()
      }
    })
    a.set(1)
    expect(subs(a)).toBe(0)
    expect(subs(fresh)).toBe(0)
  })
})

describe('computed disposed during its own evaluation', () => {
  test('returns and keeps that evaluation, and links nothing read after the dispose', () => {
    const s = signal(1)
    const late = signal(0)
    let self: { dispose(): void } | null = null
    let evals = 0
    const c = computed(() => {
      evals++
      const v = s() * 10
      self?.dispose()
      late()

      return v
    })
    expect(c()).toBe(10)
    self = c
    s.set(2)
    expect(c()).toBe(20) // the disposing evaluation's value
    expect(c()).toBe(20)
    s.set(3)
    expect(c()).toBe(20) // disposed: never evaluates again
    expect(evals).toBe(2)
    expect(subs(s)).toBe(0)
    expect(subs(late)).toBe(0)
  })
})
