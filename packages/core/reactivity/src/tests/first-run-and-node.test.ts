/**
 * Round 2 of the link-graph core changed two shapes. Both must be invisible:
 *
 *   - A binding's FIRST run (`renderEffect` / `_renderBind` / `_bind`) is one
 *     frame instead of `_track` → `_call` → `purgeDeps` → `settleFirstRun`.
 *     It skips `purgeDeps` and `settleUnread` because a first run has no
 *     previous dependencies, and it re-runs itself only when its own write
 *     re-queued it. Each spec runs the same first run unbatched and inside
 *     `batch()` and requires identical observations, plus the contract's
 *     ordering (D9: the self re-run happens before the binding call returns;
 *     everything else the first run's writes reached runs at the outermost
 *     close, in queue order).
 *   - A computed's graph node is a plain object the callable is bound to. The
 *     callable's methods (`direct`, `dispose`, `_v`) and every owner of a
 *     computed (scope, inner registration) must still reach that node.
 */
import { _bind, _renderBind, batch, computed, effect, effectScope, renderEffect, signal } from '../index'
import { _computedNode } from '../computed'
import { depCount, edgeCount } from './graph-internals'

type Mode = 'unbatched' | 'batched'
const MODES: Mode[] = ['unbatched', 'batched']

const BINDERS = [
  ['renderEffect', renderEffect],
  ['_renderBind', _renderBind],
  ['_bind', _bind],
] as const

function inMode(mode: Mode, fn: () => void): void {
  if (mode === 'unbatched') fn()
  else batch(fn)
}

describe('a binding first run matches the queue in and out of a batch', () => {
  for (const [name, bind] of BINDERS) {
    it(`${name}: a first-run write to its own source re-runs it before the call returns; other work waits for the outermost close`, () => {
      const logs = MODES.map((mode) => {
        const log: string[] = []
        const s = signal(0)
        const t = signal(0)
        effect(() => {
          log.push(`watch-t:${t()}`)
        })
        log.length = 0
        inMode(mode, () => {
          bind(() => {
            const v = s()
            log.push(`bind:${v}`)
            if (v === 0) {
              t.set(1) // reaches the other effect: waits for the outermost close
              s.set(1) // its own source: re-run right after this run returns
            }
          })
          log.push('returned')
        })
        log.push(`end:${s()}`)

        return log
      })
      // The self re-run is inside the binding call in both modes. The other
      // effect runs at the OUTERMOST close: the binding's own window when
      // unbatched (before the call returns), the batch's close otherwise.
      expect(logs[0]).toEqual(['bind:0', 'bind:1', 'watch-t:1', 'returned', 'end:1'])
      expect(logs[1]).toEqual(['bind:0', 'bind:1', 'returned', 'watch-t:1', 'end:1'])
    })

    it(`${name}: a first run that throws keeps the edges it made and leaves no batch window open`, () => {
      const results = MODES.map((mode) => {
        const s = signal(0)
        const after = signal(0)
        let seen = -1
        effect(() => {
          seen = after()
        })
        let threw = false
        try {
          inMode(mode, () => {
            bind(() => {
              s()
              throw new Error('first run')
            })
          })
        } catch {
          threw = true
        }
        // No window left open: an unbatched write flushes on its own.
        after.set(7)

        return { threw, seen, edges: edgeCount(s) }
      })
      expect(results[0]).toEqual({ threw: true, seen: 7, edges: 1 })
      expect(results[1]).toEqual(results[0])
    })

    it(`${name}: disposing a binding right after its first run leaves no edges and no re-run`, () => {
      for (const mode of MODES) {
        const a = signal(1)
        const b = signal(2)
        let dispose: (() => void) | undefined
        let runs = 0
        inMode(mode, () => {
          const box: { d?: () => void } = {}
          dispose = bind(() => {
            runs++
            a()
            box.d?.()
            b()
          })
          box.d = dispose
        })
        // The first run cannot reach its own disposer (it is returned after
        // the run); dispose it now and check the edges, then that later
        // writes do nothing.
        dispose?.()
        expect(edgeCount(a)).toBe(0)
        expect(edgeCount(b)).toBe(0)
        a.set(10)
        b.set(20)
        expect(runs).toBe(1)
      }
    })
  }

  it('a first run that reads the same source twice, and several sources, links each once in read order', () => {
    for (const mode of MODES) {
      const a = signal(1)
      const b = signal(2)
      let out = 0
      let d: () => void = () => {}
      inMode(mode, () => {
        d = renderEffect(() => {
          out = a() + a() + b() + a()
        })
      })
      expect(out).toBe(5)
      expect(edgeCount(a)).toBe(1)
      expect(edgeCount(b)).toBe(1)
      a.set(2)
      expect(out).toBe(8)
      d()
      expect(edgeCount(a)).toBe(0)
      expect(edgeCount(b)).toBe(0)
    }
  })

  it('a binding whose first run stops its owning scope is released when it registers (stopped scope)', () => {
    for (const mode of MODES) {
      const s = signal(0)
      const late = signal(0)
      let runs = 0
      const scope = effectScope()
      inMode(mode, () => {
        scope.runInScope(() => {
          renderEffect(() => {
            runs++
            s()
            scope.stop() // the binding registers with the scope only after this run
            late()
          })
        })
      })
      // A stopped scope disposes what is registered with it afterwards.
      expect(edgeCount(s)).toBe(0)
      expect(edgeCount(late)).toBe(0)
      late.set(1)
      expect(runs).toBe(1)
    }
  })
})

describe('the computed graph node behind the callable', () => {
  it('the callable reaches its node for direct, _v and dispose', () => {
    const s = signal(1)
    const c = computed(() => s() * 2)
    const node = _computedNode(c)
    expect(node).toBeDefined()
    expect(typeof c).toBe('function')
    expect(c instanceof Function).toBe(true)
    let fired = 0
    const stop = c.direct(() => {
      fired++
    })
    expect((c as unknown as { _v: number })._v).toBe(2)
    s.set(2)
    expect(fired).toBe(1)
    expect((c as unknown as { _v: number })._v).toBe(4)
    stop()
    const dispose = c.dispose // detached
    dispose()
    s.set(3)
    expect(c()).toBe(4)
    expect(edgeCount(s)).toBe(0)
  })

  it('a reader links to the node; disposing the reader drops the edge on the node', () => {
    const s = signal(1)
    const c = computed(() => s() + 1)
    let seen = 0
    const e = effect(() => {
      seen = c()
    })
    expect(edgeCount(c)).toBe(1)
    expect(depCount(c)).toBe(1)
    s.set(5)
    expect(seen).toBe(6)
    e.dispose()
    expect(edgeCount(c)).toBe(0)
  })

  it('the owning scope disposes the node, and a computed created in a stopped scope is disposed at once', () => {
    const s = signal(1)
    const scope = effectScope()
    let c!: () => number
    scope.runInScope(() => {
      c = computed(() => s() * 10)
      c()
    })
    expect(edgeCount(s)).toBe(1)
    scope.stop()
    expect(edgeCount(s)).toBe(0)
    s.set(2)
    expect(c()).toBe(10) // a disposed computed keeps its last value

    let late!: () => number
    scope.runInScope(() => {
      late = computed(() => s() * 100)
    })
    // Disposed before it ever evaluated: one untracked evaluation, no edge.
    expect(late()).toBe(200)
    expect(edgeCount(s)).toBe(0)
  })

  it('an inner computed of an effect run is owned by the effect run like before', () => {
    const s = signal(1)
    const gate = signal(true)
    const reads: number[] = []
    effect(() => {
      if (!gate()) return
      const c = computed(() => s() * 3)
      reads.push(c())
    })
    s.set(2)
    expect(reads).toEqual([3, 6])
  })
})
