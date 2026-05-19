import { afterEach, describe, expect, it } from 'vitest'
import { computed } from '../computed'
import { effect } from '../effect'
import {
  _rdPrune,
  activateReactiveDevtools,
  deactivateReactiveDevtools,
  getReactiveFires,
  getReactiveGraph,
  isReactiveDevtoolsActive,
} from '../reactive-devtools'
import { signal } from '../signal'

afterEach(() => {
  deactivateReactiveDevtools()
})

describe('reactive-devtools — opt-in contract', () => {
  it('is inactive by default and tracks nothing until activated', () => {
    expect(isReactiveDevtoolsActive()).toBe(false)
    const s = signal(1)
    s.set(2)
    const c = computed(() => s() + 1)
    c()
    expect(getReactiveGraph().nodes).toEqual([])
    expect(getReactiveFires()).toEqual([])
  })

  it('activate() then deactivate() is idempotent and clears state', () => {
    activateReactiveDevtools()
    expect(isReactiveDevtoolsActive()).toBe(true)
    activateReactiveDevtools() // idempotent
    expect(isReactiveDevtoolsActive()).toBe(true)
    const s = signal(0, { name: 'x' })
    s()
    expect(getReactiveGraph().nodes.length).toBe(1)
    deactivateReactiveDevtools()
    expect(isReactiveDevtoolsActive()).toBe(false)
    expect(getReactiveGraph().nodes).toEqual([])
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
      [
        's_long',
        'x'.repeat(200),
        (v) => expect(v.endsWith('…') && v.length <= 61).toBe(true),
      ],
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
  it('a stale __pxRdId (registry cleared, node re-fires) is buffered, not crashed', () => {
    activateReactiveDevtools()
    const s = signal(0, { name: 'stale' })
    void s()
    deactivateReactiveDevtools()
    // Re-activate: _byId is empty but `s` still carries its old __pxRdId.
    activateReactiveDevtools()
    expect(() => s.set(1)).not.toThrow()
    // Fire is still buffered even though no record exists for the id.
    expect(getReactiveFires().length).toBe(1)
    // …and it does not appear as a node (record was cleared).
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
