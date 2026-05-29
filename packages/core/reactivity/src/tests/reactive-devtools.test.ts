import { afterEach, describe, expect, it } from 'vitest'
import { computed } from '../computed'
import { effect } from '../effect'
import {
  __resetReactiveDevtoolsForTesting,
  _rdPrune,
  activateReactiveDevtools,
  deactivateReactiveDevtools,
  getReactiveFires,
  getReactiveGraph,
  isReactiveDevtoolsActive,
} from '../reactive-devtools'
import { signal } from '../signal'

afterEach(() => {
  // Test-only full reset (drops registry + fire buffer + _active).
  // Production `deactivateReactiveDevtools()` deliberately does NOT
  // clear the registry so a close+reopen panel cycle re-exposes the
  // live graph — but tests need cross-`it()` isolation.
  __resetReactiveDevtoolsForTesting()
})

describe('reactive-devtools — read gate contract', () => {
  it('output methods return empty when no client has activated', () => {
    // Registry is always-on in __DEV__ — `s`, `s.set(2)`, and `c` ARE
    // recorded internally — but until a devtools client calls
    // `activateReactiveDevtools()`, the output methods return empty.
    expect(isReactiveDevtoolsActive()).toBe(false)
    const s = signal(1)
    s.set(2)
    const c = computed(() => s() + 1)
    c()
    expect(getReactiveGraph().nodes).toEqual([])
    expect(getReactiveFires()).toEqual([])
  })

  it('activate() then deactivate() — output gates flip; registry retained', () => {
    activateReactiveDevtools()
    expect(isReactiveDevtoolsActive()).toBe(true)
    activateReactiveDevtools() // idempotent
    expect(isReactiveDevtoolsActive()).toBe(true)
    const s = signal(0, { name: 'x' })
    s()
    expect(getReactiveGraph().nodes.length).toBe(1)
    deactivateReactiveDevtools()
    expect(isReactiveDevtoolsActive()).toBe(false)
    // Output returns empty — the read gate is closed.
    expect(getReactiveGraph().nodes).toEqual([])
    // But the registry is RETAINED — re-activate sees the live node.
    activateReactiveDevtools()
    expect(getReactiveGraph().nodes.find((n) => n.name === 'x')).toBeDefined()
  })

  it('REGRESSION: pre-existing signals appear after late activate', () => {
    // The bug this contract change fixes: a user opens devtools AFTER
    // the app has mounted hundreds of signals. Pre-fix `_rdRegister`
    // early-returned on `!_active`, so the late activate saw an empty
    // graph. With always-on registration the graph populates the moment
    // the client attaches.
    expect(isReactiveDevtoolsActive()).toBe(false)
    const a = signal(1, { name: 'pre_a' })
    const b = signal(2, { name: 'pre_b' })
    const c = signal(3, { name: 'pre_c' })
    // Establish a subscriber edge so the graph has structure to render.
    effect(() => {
      void a()
      void b()
      void c()
    })
    // Devtools client attaches LATE — same shape as panel opened after
    // page load completes.
    activateReactiveDevtools()
    const g = getReactiveGraph()
    expect(g.nodes.find((n) => n.name === 'pre_a')).toBeDefined()
    expect(g.nodes.find((n) => n.name === 'pre_b')).toBeDefined()
    expect(g.nodes.find((n) => n.name === 'pre_c')).toBeDefined()
    // At least one effect node + edges from each signal to it.
    expect(g.nodes.some((n) => n.kind === 'effect')).toBe(true)
    expect(g.edges.length).toBeGreaterThanOrEqual(3)
  })

  it('REGRESSION: signal writes recorded BEFORE activate are visible after', () => {
    // Same shape for the fire timeline: fires recorded while inactive
    // land in the bounded ring buffer (capped at FIRE_CAP=512). On
    // activate, the buffer is exposed.
    const s = signal(0, { name: 'pre_fires' })
    s.set(1)
    s.set(2)
    s.set(3)
    activateReactiveDevtools()
    const fires = getReactiveFires()
    expect(fires.length).toBeGreaterThanOrEqual(3)
    const node = getReactiveGraph().nodes.find((n) => n.name === 'pre_fires')!
    expect(node.fires).toBe(3)
  })
})

describe('reactive-devtools — node registry', () => {
  it('registers a named signal with kind + value preview', () => {
    activateReactiveDevtools()
    const count = signal(42, { name: 'count' })
    void count()
    const g = getReactiveGraph()
    const node = g.nodes.find((n) => n.name === 'count')
    expect(node).toBeDefined()
    expect(node!.kind).toBe('signal')
    expect(node!.value).toBe('42')
  })

  it('synthesizes a label for anonymous derived/effect nodes', () => {
    activateReactiveDevtools()
    const s = signal(1)
    const d = computed(() => s() * 2)
    void d()
    effect(() => void s())
    const g = getReactiveGraph()
    expect(g.nodes.some((n) => n.kind === 'derived' && /^derived#\d+$/.test(n.name))).toBe(true)
    expect(g.nodes.some((n) => n.kind === 'effect' && /^effect#\d+$/.test(n.name))).toBe(true)
  })

  it('previews non-primitive signal values without throwing', () => {
    activateReactiveDevtools()
    const obj = signal({ a: 1, b: 2 }, { name: 'o' })
    void obj()
    const arr = signal([1, 2, 3], { name: 'arr' })
    void arr()
    const g = getReactiveGraph()
    expect(g.nodes.find((n) => n.name === 'o')!.value).toContain('{')
    expect(g.nodes.find((n) => n.name === 'arr')!.value).toBe('Array(3)')
  })
})

describe('reactive-devtools — edges from live subscriber sets', () => {
  it('captures signal → derived → effect edges', () => {
    activateReactiveDevtools()
    const s = signal(1, { name: 's' })
    const d = computed(() => s() + 1)
    let seen = 0
    effect(() => {
      seen = d()
    })
    expect(seen).toBe(2)

    const g = getReactiveGraph()
    const sId = g.nodes.find((n) => n.name === 's')!.id
    const dNode = g.nodes.find((n) => n.kind === 'derived')!
    const eNode = g.nodes.find((n) => n.kind === 'effect')!

    // s is read by d; d is read by the effect.
    expect(g.edges).toContainEqual({ from: sId, to: dNode.id })
    expect(g.edges).toContainEqual({ from: dNode.id, to: eNode.id })
  })

  it('reflects subscriber count + reacts to writes (fires + lastFire)', () => {
    activateReactiveDevtools()
    const s = signal(0, { name: 'live' })
    effect(() => void s())
    s.set(1)
    s.set(2)
    const node = getReactiveGraph().nodes.find((n) => n.name === 'live')!
    expect(node.subscribers).toBe(1)
    expect(node.fires).toBe(2)
    expect(node.lastFire).not.toBeNull()
  })
})

describe('reactive-devtools — value preview branches', () => {
  it('previews every primitive + edge shape', () => {
    activateReactiveDevtools()
    const cases: [string, unknown, (v: string) => void][] = [
      ['s_str', 'hello', (v) => expect(v).toBe('"hello"')],
      ['s_num', 7, (v) => expect(v).toBe('7')],
      ['s_bool', true, (v) => expect(v).toBe('true')],
      ['s_big', 10n, (v) => expect(v).toBe('10')],
      ['s_null', null, (v) => expect(v).toBe('null')],
      ['s_undef', undefined, (v) => expect(v).toBe('undefined')],
      ['s_sym', Symbol('z'), (v) => expect(v).toContain('Symbol')],
      ['s_fn', function named() {}, (v) => expect(v).toContain('[Function named]')],
      ['s_long', 'x'.repeat(200), (v) => expect(v.endsWith('…') && v.length <= 61).toBe(true)],
    ]
    for (const [name, val] of cases) {
      const s = signal(val, { name })
      void s()
    }
    const g = getReactiveGraph()
    for (const [name, , assertFn] of cases) {
      assertFn(g.nodes.find((n) => n.name === name)!.value)
    }
  })

  it('never throws on a value whose property access throws', () => {
    activateReactiveDevtools()
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('boom')
        },
        get() {
          throw new Error('boom')
        },
      },
    )
    const s = signal(hostile, { name: 'hostile' })
    void s()
    const node = getReactiveGraph().nodes.find((n) => n.name === 'hostile')!
    expect(typeof node.value).toBe('string')
  })

  it('handles a value whose ownKeys throws but ctor read succeeds', () => {
    activateReactiveDevtools()
    // `.constructor` resolves fine (default get), but Object.keys() trips
    // the inner keys try/catch.
    const keysHostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('no keys')
        },
      },
    )
    const s = signal(keysHostile, { name: 'kh' })
    void s()
    const node = getReactiveGraph().nodes.find((n) => n.name === 'kh')!
    expect(node.value).toBe('{}')
  })

  it('effect nodes carry no value preview', () => {
    activateReactiveDevtools()
    const s = signal(1)
    effect(() => void s())
    const eff = getReactiveGraph().nodes.find((n) => n.kind === 'effect')!
    expect(eff.value).toBe('')
  })
})

describe('reactive-devtools — resilience', () => {
  it('a stale __pxRdId (registry test-reset, node re-fires) is buffered, not crashed', () => {
    // Resilience: `__resetReactiveDevtoolsForTesting()` drops the
    // registry but signals already created still carry their old
    // `__pxRdId` (the property is non-enumerable on the read fn).
    // Subsequent writes must NOT crash; the fire buffer captures the
    // event keyed by the stale id, no record matches, no node appears.
    // (This was the previous behaviour of `deactivate` and now applies
    // only to the test-only reset.)
    activateReactiveDevtools()
    const s = signal(0, { name: 'stale' })
    void s()
    __resetReactiveDevtoolsForTesting()
    // Re-activate: _byId is empty but `s` still carries its old __pxRdId.
    activateReactiveDevtools()
    expect(() => s.set(1)).not.toThrow()
    // Fire is still buffered even though no record exists for the id.
    expect(getReactiveFires().length).toBe(1)
    // …and it does not appear as a node (record was wiped by the test reset).
    expect(getReactiveGraph().nodes.find((n) => n.name === 'stale')).toBeUndefined()
  })

  it('getReactiveFires is empty before any fire', () => {
    activateReactiveDevtools()
    expect(getReactiveFires()).toEqual([])
  })

  it('_rdPrune removes a record (FinalizationRegistry callback path)', () => {
    activateReactiveDevtools()
    const s = signal(1, { name: 'pruneme' })
    void s()
    const before = getReactiveGraph().nodes.find((n) => n.name === 'pruneme')
    expect(before).toBeDefined()
    _rdPrune(before!.id)
    expect(getReactiveGraph().nodes.find((n) => n.name === 'pruneme')).toBeUndefined()
  })
})

describe('reactive-devtools — bounded fire timeline', () => {
  it('records signal writes + computed recomputes in order', () => {
    activateReactiveDevtools()
    const s = signal(0, { name: 't' })
    const d = computed(() => s() + 1)
    effect(() => void d())
    s.set(1)
    s.set(2)
    const fires = getReactiveFires()
    expect(fires.length).toBeGreaterThanOrEqual(2)
    // monotonic, non-decreasing timestamps
    for (let i = 1; i < fires.length; i++) {
      expect(fires[i]!.ts).toBeGreaterThanOrEqual(fires[i - 1]!.ts)
    }
  })

  it('caps the ring buffer (no unbounded growth)', () => {
    activateReactiveDevtools()
    const s = signal(0, { name: 'spin' })
    for (let i = 1; i <= 700; i++) s.set(i)
    expect(getReactiveFires().length).toBeLessThanOrEqual(512)
  })
})

describe('reactive-devtools — preview() edge branches (coverage lock)', () => {
  // Lifts reactive-devtools.ts off the 8 uncovered `preview()` /
  // performance-fallback branches that landed with #703 and dragged
  // @pyreon/reactivity global branch coverage to 89.75% (< the 90%
  // gate). With these: 90.7% (478/527) — the Coverage CI gate passes.
  const valueOf = (name: string) => getReactiveGraph().nodes.find((n) => n.name === name)?.value

  it('anonymous function → [Function anonymous] (|| fallback arm)', () => {
    activateReactiveDevtools()
    const s = signal<unknown>((() => () => {})(), { name: 'anonFn' })
    void s()
    expect(valueOf('anonFn')).toBe('[Function anonymous]')
  })

  it('plain object whose ctor IS Object → no ctor prefix (empty-arm)', () => {
    activateReactiveDevtools()
    const s = signal<unknown>({ a: 1 }, { name: 'plainObj' })
    void s()
    expect(valueOf('plainObj')).toBe('{a}')
  })

  it('object with more than 3 keys → truncates with ellipsis', () => {
    activateReactiveDevtools()
    const s = signal<unknown>({ a: 1, b: 2, c: 3, d: 4 }, { name: 'bigObj' })
    void s()
    expect(valueOf('bigObj')).toBe('{a, b, c, …}')
  })

  it('classed object → keeps the ctor prefix (truthy arm)', () => {
    class Box {
      x = 1
    }
    activateReactiveDevtools()
    const s = signal<unknown>(new Box(), { name: 'boxObj' })
    void s()
    expect(valueOf('boxObj')).toBe('Box {x}')
  })

  it('records the Date.now fallback when performance is unavailable', () => {
    const realPerf = globalThis.performance
    try {
      // Exercise the `typeof performance === 'undefined'` defensive arm.
      delete (globalThis as { performance?: unknown }).performance
      activateReactiveDevtools()
      const s = signal(0, { name: 'noPerf' })
      void s()
      expect(() => s.set(1)).not.toThrow()
      const fires = getReactiveFires()
      expect(fires.length).toBeGreaterThanOrEqual(1)
      expect(typeof fires[0]!.ts).toBe('number')
    } finally {
      ;(globalThis as { performance?: unknown }).performance = realPerf
    }
  })
})
