import { _pk, _pp, _rp, _rpd, makeReactiveProps, REACTIVE_PROP } from '../props'
import { signal } from '@pyreon/reactivity'

describe('_pk — fold eligibility of a props key', () => {
  test('own data primitives are foldable', () => {
    const p = { s: 'a', n: 1, b: false, z: null, u: undefined }
    for (const k of Object.keys(p)) expect(_pk(p, k)).toBe(true)
  })
  test('objects, functions, BigInt, symbols, getters and missing keys are not', () => {
    const p: Record<string, unknown> = { o: {}, f: () => 1, g: 1n, y: Symbol('s') }
    Object.defineProperty(p, 'get', { get: () => 1, enumerable: true })
    for (const k of ['o', 'f', 'g', 'y', 'get', 'missing']) expect(_pk(p, k)).toBe(false)
  })
  test('never fires a getter', () => {
    let reads = 0
    const p = {}
    Object.defineProperty(p, 'x', { get: () => ++reads })
    _pk(p, 'x')
    expect(reads).toBe(0)
  })
})

describe('_pp — pass-through forwarding', () => {
  test('a data value is returned as-is, objects included', () => {
    const o = { deep: 1 }
    expect(_pp({ a: 1 }, 'a')).toBe(1)
    expect(_pp({ o }, 'o')).toBe(o)
  })
  test('a compiler getter is forwarded itself (direct tier kept)', () => {
    const s = signal(1)
    const props = makeReactiveProps({ v: _rpd(s), w: _rp(() => s() + 1) })
    const v = _pp(props, 'v') as { direct?: unknown }
    expect(v).toBe(Object.getOwnPropertyDescriptor(props, 'v')!.get)
    expect(typeof v.direct).toBe('function')
    expect(_pp(props, 'w')).toBe(Object.getOwnPropertyDescriptor(props, 'w')!.get)
  })
  test('an unbranded getter, a branded data function and a missing key get a fresh _rp thunk', () => {
    const s = signal(1)
    const p: Record<string, unknown> = { f: _rp(() => 9) }
    Object.defineProperty(p, 'h', { get: () => s(), enumerable: true })
    for (const k of ['h', 'f', 'missing']) {
      const out = _pp(p, k) as (() => unknown) & Record<symbol, unknown>
      expect(typeof out).toBe('function')
      expect(out[REACTIVE_PROP]).toBe(true)
      expect(out).not.toBe(p[k])
    }
    const h = _pp(p, 'h') as () => unknown
    s.set(2)
    expect(h()).toBe(2)
  })
})
