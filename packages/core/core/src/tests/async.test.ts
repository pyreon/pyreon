import { Async, _resetAsyncWarning, type AsyncLike } from '../async'
import type { VNodeChild } from '../types'

/** Build an AsyncLike whose branch is chosen by a mutable state object. */
function source<T>(s: {
  pending?: boolean
  error?: unknown
  data?: T | undefined
}): AsyncLike<T> {
  return {
    isPending: () => s.pending === true,
    isError: () => s.error !== undefined,
    error: () => s.error,
    data: () => s.data,
  }
}

const read = (v: unknown) => (v as () => VNodeChild)()

describe('Async', () => {
  beforeEach(() => {
    _resetAsyncWarning()
  })

  test('returns a reactive accessor, like Show', () => {
    const r = Async({ of: source({ data: 1 }), children: (n: number) => String(n) })
    expect(typeof r).toBe('function')
  })

  test('renders `pending` while pending, and nothing when it is omitted', () => {
    const s = source<number>({ pending: true })
    expect(read(Async({ of: s, pending: 'wait', children: String }))).toBe('wait')
    expect(read(Async({ of: s, children: String }))).toBe(null)
  })

  test('pending wins over data that is already present', () => {
    const s = source<number>({ pending: true, data: 7 })
    expect(read(Async({ of: s, pending: 'wait', children: String }))).toBe('wait')
  })

  test('renders `error(e)` with the error value', () => {
    const err = new Error('nope')
    const r = Async({
      of: source<number>({ error: err }),
      error: (e) => `failed: ${(e as Error).message}`,
      children: String,
    })
    expect(read(r)).toBe('failed: nope')
  })

  test('an error with no `error` prop renders nothing and warns ONCE', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = source<number>({ error: 'boom' })
    expect(read(Async({ of: s, children: String }))).toBe(null)
    expect(read(Async({ of: s, children: String }))).toBe(null)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).toContain('<Async>')
    warn.mockRestore()
  })

  test('error wins over data', () => {
    const s = source<number>({ error: 'boom', data: 3 })
    expect(read(Async({ of: s, error: () => 'E', children: String }))).toBe('E')
  })

  test('null/undefined data renders `empty`', () => {
    expect(read(Async({ of: source<number>({}), empty: 'none', children: String }))).toBe('none')
    expect(
      read(Async({ of: source<number>({ data: undefined }), empty: 'none', children: String })),
    ).toBe('none')
  })

  test('null data with no `empty` renders nothing — children is never called with undefined', () => {
    const children = vi.fn(String)
    expect(read(Async({ of: source<number>({}), children }))).toBe(null)
    expect(children).not.toHaveBeenCalled()
  })

  test('an empty array uses `empty` when it is provided', () => {
    const r = Async({ of: source<number[]>({ data: [] }), empty: 'none', children: () => 'rows' })
    expect(read(r)).toBe('none')
  })

  test('an empty array WITHOUT `empty` is passed to children — the list keeps its own empty state', () => {
    const children = vi.fn(() => 'own-empty-state')
    const r = Async({ of: source<number[]>({ data: [] }), children })
    expect(read(r)).toBe('own-empty-state')
    expect(children).toHaveBeenCalledWith([])
  })

  test('resolved data reaches children', () => {
    const r = Async({ of: source({ data: [1, 2, 3] }), children: (v: number[]) => `n=${v.length}` })
    expect(read(r)).toBe('n=3')
  })

  test('falsy-but-present data is data, not empty', () => {
    expect(read(Async({ of: source({ data: 0 }), empty: 'none', children: (n: number) => `v${n}` }))).toBe('v0')
    expect(read(Async({ of: source({ data: '' }), empty: 'none', children: (s: string) => `[${s}]` }))).toBe('[]')
  })

  test('the accessor re-reads the source on every call', () => {
    const s: { pending?: boolean; error?: unknown; data?: number } = { pending: true }
    const acc = Async({ of: source(s), pending: 'P', error: () => 'E', children: (n: number) => `D${n}` })
    expect(read(acc)).toBe('P')
    s.pending = false
    s.error = 'x'
    expect(read(acc)).toBe('E')
    s.error = undefined
    s.data = 5
    expect(read(acc)).toBe('D5')
  })
})
