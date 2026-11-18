/**
 * A compiled template with several disposers returns its combined cleanup
 * through a runtime helper (`_dispose2/3/4/N`), not an arrow built inside the
 * bind function. The arrow's context chained to the COMPONENT function's
 * context, so every local the component body captured (and its `props`) stayed
 * alive for as long as the template was mounted, even when only read once at
 * mount. These tests pin both halves: the helpers dispose every binding in
 * order, and the component's captured locals are collectable while the
 * component is still mounted (real V8 GC through `--expose-gc`).
 */
import v8 from 'node:v8'
import vm from 'node:vm'
import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { _dispose2, _dispose3, _dispose4, _disposeN } from '../template'
import { compilePlainModule, mountComponent } from './plain-harness'

describe('template cleanup helpers', () => {
  it('run every disposer once, in order', () => {
    const calls: number[] = []
    const d = (i: number) => () => calls.push(i)
    _dispose2(d(0), d(1))()
    _dispose3(d(2), d(3), d(4))()
    _dispose4(d(5), d(6), d(7), d(8))()
    _disposeN([d(9), d(10), d(11), d(12), d(13)])()
    expect(calls).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
  })

  it('a compiled multi-binding template disposes every binding on unmount', () => {
    const sigs = [signal(0), signal(0), signal(0), signal(0), signal(0)]
    const [a, b, c, d, e] = sigs
    const { exports, code } = compilePlainModule<{ Five: () => unknown }>(
      `export function Five() { return <div><b>{a()}</b><i>{b()}</i><u>{c()}</u><s>{d()}</s><em>{e()}</em></div> }`,
      ['Five'],
      { a, b, c, d, e },
    )
    expect(code).toContain('_disposeN([')
    const { container, cleanup } = mountComponent(exports.Five)
    for (const s of sigs) s.set(1)
    expect(container.textContent).toBe('11111')
    cleanup()
    for (const s of sigs) expect(s.debug().subscriberCount).toBe(0)
  })
})

describe('a mounted template does not pin its component function context', () => {
  it('a local the bind read once is collectable while the component stays mounted', async () => {
    v8.setFlagsFromString('--expose-gc')
    const gc = vm.runInNewContext('gc') as () => void
    const a = signal('x')
    const b = signal('y')
    const refs: WeakRef<object>[] = []
    const { exports, code } = compilePlainModule<{ Comp: () => unknown }>(
      `export function Comp() {
        const big = { tag: 'big' }
        refs.push(new WeakRef(big))
        return <div title={big.tag}><b>{a()}</b><i>{b()}</i></div>
      }`,
      ['Comp'],
      { a, b, refs, WeakRef },
    )
    expect(code).toContain('return _dispose2(__d0, __d1)')
    // Production: in dev, the reactive devtools record each binding's creation
    // site, and that stack record holds the bind function (and so its context)
    // by design. The retention this test pins is the production one.
    const prevEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    let mounted: ReturnType<typeof mountComponent>
    try {
      mounted = mountComponent(exports.Comp)
    } finally {
      if (prevEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = prevEnv
    }
    const { container, cleanup } = mounted
    expect(container.innerHTML).toBe('<div title="big"><b>x</b><i>y</i></div>')
    await new Promise((r) => setTimeout(r, 0))
    gc()
    expect(refs[0]!.deref()).toBeUndefined()
    // Still mounted and live.
    a.set('z')
    expect(container.querySelector('b')!.textContent).toBe('z')
    cleanup()
  })
})
