import { clearReactiveTrace, getReactiveTrace } from '../reactive-trace'
import { signal } from '../signal'

describe('reactive-trace ring buffer', () => {
  beforeEach(() => clearReactiveTrace())

  test('empty before any write', () => {
    expect(getReactiveTrace()).toEqual([])
  })

  test('records writes chronologically with name + previews', () => {
    const count = signal(0, { name: 'count' })
    count.set(1)
    count.set(2)
    const trace = getReactiveTrace()
    expect(trace).toHaveLength(2)
    expect(trace[0]).toMatchObject({ name: 'count', prev: '0', next: '1' })
    expect(trace[1]).toMatchObject({ name: 'count', prev: '1', next: '2' })
    expect(trace[0]!.timestamp).toBeTypeOf('number')
  })

  test('no-op writes (Object.is equal) are not recorded', () => {
    const s = signal(5, { name: 's' })
    s.set(5) // same value — _set returns early before the recorder
    expect(getReactiveTrace()).toEqual([])
    s.set(6)
    expect(getReactiveTrace()).toHaveLength(1)
  })

  test('anonymous signals record name: undefined', () => {
    const s = signal('a')
    s.set('b')
    const trace = getReactiveTrace()
    expect(trace[0]!.name).toBeUndefined()
    expect(trace[0]).toMatchObject({ prev: '"a"', next: '"b"' })
  })

  test('previews are bounded and never throw on hostile values', () => {
    const s = signal<unknown>(null, { name: 'hostile' })
    // getter that throws
    const evil = {
      get boom() {
        throw new Error('nope')
      },
    }
    s.set(evil)
    // circular
    const circ: Record<string, unknown> = {}
    circ.self = circ
    s.set(circ)
    // huge string
    s.set('x'.repeat(5000))
    const trace = getReactiveTrace()
    expect(trace).toHaveLength(3)
    for (const e of trace) {
      // Each preview stays bounded (PREVIEW_MAX=80 + ellipsis).
      expect(e.prev.length).toBeLessThanOrEqual(81)
      expect(e.next.length).toBeLessThanOrEqual(81)
    }
    // The huge-string write got truncated with an ellipsis marker.
    expect(trace[2]!.next.endsWith('…')).toBe(true)
  })

  test('object preview shows constructor + shallow keys, not full JSON', () => {
    class Box {
      a = 1
      b = 2
    }
    const s = signal<unknown>(0, { name: 'o' })
    s.set(new Box())
    s.set({ x: 1, y: 2, z: 3 })
    const trace = getReactiveTrace()
    expect(trace[0]!.next).toContain('Box')
    expect(trace[1]!.next).toContain('x, y, z')
  })

  test('ring buffer is bounded at 50 — oldest evicted, order preserved', () => {
    const s = signal(0, { name: 'ring' })
    for (let i = 1; i <= 70; i++) s.set(i)
    const trace = getReactiveTrace()
    expect(trace).toHaveLength(50)
    // Oldest surviving write is the 21st (writes 1..20 evicted).
    expect(trace[0]).toMatchObject({ prev: '20', next: '21' })
    expect(trace[49]).toMatchObject({ prev: '69', next: '70' })
  })

  test('returned array is a copy — mutating it does not affect the buffer', () => {
    const s = signal(0, { name: 'c' })
    s.set(1)
    const a = getReactiveTrace()
    a.push({ name: 'fake', prev: 'x', next: 'y', timestamp: 0 })
    expect(getReactiveTrace()).toHaveLength(1)
  })

  test('clearReactiveTrace resets to empty', () => {
    const s = signal(0, { name: 'c' })
    s.set(1)
    expect(getReactiveTrace()).toHaveLength(1)
    clearReactiveTrace()
    expect(getReactiveTrace()).toEqual([])
  })

  test('getReactiveTrace short-circuits to [] under NODE_ENV=production', () => {
    // The reader is prod-gated (the write-side records are NODE_ENV-gated, so a
    // real prod build never fills the buffer). Populate in the default test env,
    // then prove the prod gate suppresses the read even with a non-empty buffer.
    signal(0, { name: 'p' }).set(1)
    expect(getReactiveTrace()).toHaveLength(1)
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      expect(getReactiveTrace()).toEqual([])
    } finally {
      // Restore exactly — `delete` when it was unset, else reassign. A bare
      // `process.env.NODE_ENV = prev` fails under `exactOptionalPropertyTypes`
      // (prev is `string | undefined`, the target is `string`).
      if (prev === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = prev
    }
  })
})
