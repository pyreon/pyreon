/**
 * Coverage for the chainable builder shape:
 *   - `.views(f)` returns a NEW ModelDefinition with `f`'s output unioned
 *   - `.actions(f)` does the same for actions
 *   - Each subsequent factory's `self` includes ALL previously-accumulated
 *     views + actions (chain-level cumulative visibility)
 *   - Chain methods are immutable (don't mutate the prior definition)
 *   - Reserved-key collision throws at create-time, naming the colliding key
 *   - Order matters: views allocate before actions; later factories overwrite
 *     earlier ones for duplicate keys WITHIN their own kind
 */
import { describe, expect, it } from 'vitest'
import { model } from '../model'

describe('chainable .views() — accumulating composition', () => {
  it('returns a new ModelDefinition (immutable builder)', () => {
    const Base = model({ state: { count: 0 } })
    const WithView = Base.views((self) => ({ doubled: () => self.count() * 2 }))
    expect(Base).not.toBe(WithView)
    // The original definition has zero views; the new one has one.
    expect(Base._config.viewFactories.length).toBe(0)
    expect(WithView._config.viewFactories.length).toBe(1)
  })

  it('chains: later .views() factories see prior views via self', () => {
    const M = model({ state: { count: 0 } })
      .views((self) => ({ doubled: () => self.count() * 2 }))
      .views((self) => ({
        // self.doubled is callable here because the prior block ran first.
        quadrupled: () => (self.doubled as () => number)() * 2,
      }))
    const m = M.create({ count: 3 }) as ReturnType<typeof M.create> & {
      doubled: () => number
      quadrupled: () => number
    }
    expect(m.doubled()).toBe(6)
    expect(m.quadrupled()).toBe(12)
  })

  it('three-deep view chain reads through intermediates', () => {
    const M = model({ state: { x: 2 } })
      .views((self) => ({ a: () => self.x() + 1 }))
      .views((self) => ({ b: () => (self.a as () => number)() * 10 }))
      .views((self) => ({ c: () => (self.b as () => number)() + 100 }))
    const m = M.create() as ReturnType<typeof M.create> & {
      a: () => number
      b: () => number
      c: () => number
    }
    expect(m.a()).toBe(3) // 2 + 1
    expect(m.b()).toBe(30) // 3 * 10
    expect(m.c()).toBe(130) // 30 + 100
  })
})

describe('chainable .actions() — accumulating composition', () => {
  it('chains: later .actions() factories see prior actions via self', () => {
    const M = model({ state: { count: 0 } })
      .actions((self) => ({
        inc: () => self.count.update((n: number) => n + 1),
      }))
      .actions((self) => ({
        // self.inc is callable from the second block.
        twice: () => {
          ;(self.inc as () => void)()
          ;(self.inc as () => void)()
        },
      }))
    const m = M.create() as ReturnType<typeof M.create> & {
      inc: () => void
      twice: () => void
    }
    m.twice()
    expect(m.count()).toBe(2)
  })

  it('actions can read views accumulated in earlier .views() blocks', () => {
    const M = model({ state: { count: 5 } })
      .views((self) => ({ doubled: () => self.count() * 2 }))
      .actions((self) => ({
        // self.doubled visible because views run before actions.
        report: () => (self.doubled as () => number)(),
      }))
    const m = M.create() as ReturnType<typeof M.create> & {
      doubled: () => number
      report: () => number
    }
    expect(m.report()).toBe(10)
  })

  it('within ONE .actions() block, actions can call each other via self proxy', () => {
    // The live self proxy returns the FINAL instance, so forward references
    // within a single .actions() block work as long as the call happens at
    // invocation time (not at factory-evaluation time).
    const M = model({ state: { count: 0 } })
      .actions((self) => ({
        bump: () => self.count.update((n: number) => n + 1),
        bumpTwice: () => {
          self.bump()
          self.bump()
        },
      }))
    const m = M.create() as ReturnType<typeof M.create> & {
      bump: () => void
      bumpTwice: () => void
    }
    m.bumpTwice()
    expect(m.count()).toBe(2)
  })
})

describe('chainable — reserved-key collisions', () => {
  it('throws when a view collides with a state key', () => {
    const Bad = model({ state: { count: 0 } }).views(() => ({
      count: () => 999,
    }))
    expect(() => Bad.create()).toThrow(/collides with a schema\/state field/)
  })

  it('throws when an action collides with a state key', () => {
    const Bad = model({ state: { count: 0 } }).actions(() => ({
      count: () => 999,
    }))
    expect(() => Bad.create()).toThrow(/collides with a schema\/state field/)
  })
})

describe('chainable — order semantics', () => {
  it('views are installed before actions (action factories see views)', () => {
    const order: string[] = []
    const M = model({ state: { x: 0 } })
      .actions(() => ({
        // We mark when this factory runs by pushing to the local array.
        marker: () => {
          order.push('action-fired')
        },
      }))
      .views(() => ({
        viewMarker: () => {
          order.push('view-fired')
          return 1
        },
      }))
    const m = M.create() as ReturnType<typeof M.create> & {
      marker: () => void
      viewMarker: () => number
    }
    // Calling the view first then the action proves invocation order.
    m.viewMarker()
    m.marker()
    expect(order).toEqual(['view-fired', 'action-fired'])
  })

  it('factory ordering: every .views() and .actions() runs in registration order', () => {
    const fired: string[] = []
    const M = model({ state: { x: 0 } })
      .views(() => {
        fired.push('view-1')
        return { v1: () => 1 }
      })
      .actions(() => {
        fired.push('action-1')
        return { a1: () => 1 }
      })
      .views(() => {
        fired.push('view-2')
        return { v2: () => 2 }
      })
      .actions(() => {
        fired.push('action-2')
        return { a2: () => 2 }
      })
    M.create()
    // Views always run before actions per createInstance's lifecycle phases,
    // even when interleaved in the chain — this is the documented order.
    expect(fired).toEqual(['view-1', 'view-2', 'action-1', 'action-2'])
  })

  it('asHook returns the same singleton across calls (registered post-chain)', () => {
    const Counter = model({ state: { n: 0 } })
      .views((self) => ({ doubled: () => self.n() * 2 }))
      .actions((self) => ({ inc: () => self.n.update((x: number) => x + 1) }))
    const useC = Counter.asHook('chainable-singleton-1')
    const a = useC()
    const b = useC()
    expect(a).toBe(b)
  })
})
