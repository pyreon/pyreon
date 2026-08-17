import { use, type Directive } from '../directive'

/** Directives only ever touch what they are handed, so a stub stands in for
 *  an Element here. The real-mount contract (ref called with null on unmount)
 *  is covered by the runtime-dom parity test. */
const stub = () => ({ tag: 'div' }) as unknown as HTMLElement

describe('use', () => {
  test('runs every directive on attach, in order', () => {
    const order: string[] = []
    const a: Directive = () => void order.push('a')
    const b: Directive = () => void order.push('b')
    use(a, b)(stub())
    expect(order).toEqual(['a', 'b'])
  })

  test('hands the element to each directive', () => {
    const el = stub()
    const seen: unknown[] = []
    use(
      (e) => void seen.push(e),
      (e) => void seen.push(e),
    )(el)
    expect(seen).toEqual([el, el])
  })

  test('runs cleanups in REVERSE order on detach', () => {
    const order: string[] = []
    const ref = use(
      () => () => order.push('cleanup-a'),
      () => () => order.push('cleanup-b'),
    )
    ref(stub())
    expect(order).toEqual([])
    ref(null)
    expect(order).toEqual(['cleanup-b', 'cleanup-a'])
  })

  test('a directive returning nothing needs no cleanup', () => {
    const ref = use(() => undefined, () => {})
    ref(stub())
    expect(() => ref(null)).not.toThrow()
  })

  test('skips falsy entries so directives can be applied conditionally', () => {
    const ran: string[] = []
    const on = false
    const ref = use(
      () => void ran.push('always'),
      on && (() => void ran.push('never')),
      null,
      undefined,
      () => void ran.push('also'),
    )
    ref(stub())
    expect(ran).toEqual(['always', 'also'])
  })

  test('detach is idempotent — a second null does not re-run cleanups', () => {
    const cleanup = vi.fn()
    const ref = use(() => cleanup)
    ref(stub())
    ref(null)
    ref(null)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  test('a re-attach without an intervening detach tears the previous one down first', () => {
    const cleanup = vi.fn()
    const attach = vi.fn(() => cleanup)
    const ref = use(attach)
    ref(stub())
    expect(cleanup).not.toHaveBeenCalled()
    ref(stub()) // KeepAlive re-mount / re-applied spread
    expect(cleanup).toHaveBeenCalledTimes(1) // torn down, not stacked
    expect(attach).toHaveBeenCalledTimes(2)
    ref(null)
    expect(cleanup).toHaveBeenCalledTimes(2)
  })

  test('re-attaching after a detach works — no permanently-dead ref', () => {
    const ran = vi.fn()
    const ref = use(() => {
      ran()
    })
    ref(stub())
    ref(null)
    ref(stub())
    expect(ran).toHaveBeenCalledTimes(2)
  })

  test('a directive that throws still leaves earlier cleanups reachable', () => {
    const cleanup = vi.fn()
    const ref = use(
      () => cleanup,
      () => {
        throw new Error('bad directive')
      },
    )
    expect(() => ref(stub())).toThrow('bad directive')
    ref(null)
    expect(cleanup).toHaveBeenCalledTimes(1) // not leaked
  })

  test('bundles compose by spread — behaviours are plain arrays', () => {
    const ran: string[] = []
    const bundle: Directive[] = [() => void ran.push('x'), () => void ran.push('y')]
    use(...bundle, () => void ran.push('z'))(stub())
    expect(ran).toEqual(['x', 'y', 'z'])
  })

  test('use() with no directives is a working no-op', () => {
    const ref = use()
    expect(() => {
      ref(stub())
      ref(null)
    }).not.toThrow()
  })
})
