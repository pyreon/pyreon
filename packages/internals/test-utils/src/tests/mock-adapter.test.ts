import { describe, expect, it } from 'vitest'
import { mockAdapter, mockAdapters } from '../mock-adapter'

describe('mockAdapter', () => {
  it('returns the implementation function unchanged at runtime', () => {
    interface Opts {
      flag: boolean
    }
    const impl = (opts: Opts): string => (opts.flag ? 'on' : 'off')
    const adapter = mockAdapter<Opts, string>(impl)
    expect(adapter).toBe(impl)
    expect(adapter({ flag: true })).toBe('on')
    expect(adapter({ flag: false })).toBe('off')
  })

  it('preserves captured state across calls (typical mock pattern)', () => {
    interface DraggableArgs {
      element: { tagName: string }
    }
    let lastSeen: DraggableArgs | null = null
    const adapter = mockAdapter<DraggableArgs, () => void>((opts) => {
      lastSeen = opts
      return () => {}
    })
    adapter({ element: { tagName: 'DIV' } })
    expect(lastSeen).toEqual({ element: { tagName: 'DIV' } })
  })
})

describe('mockAdapters', () => {
  it('returns the factory object unchanged at runtime', () => {
    const factory = {
      foo: (n: number) => n * 2,
      bar: (s: string) => s.toUpperCase(),
    }
    const adapters = mockAdapters(factory)
    expect(adapters).toBe(factory)
    expect(adapters.foo(21)).toBe(42)
    expect(adapters.bar('hi')).toBe('HI')
  })
})
