import { describe, expect, it } from 'vitest'
import { resolveAdapter } from '../adapters'

describe('resolveAdapter', () => {
  it('returns node adapter by default', () => {
    const adapter = resolveAdapter({})
    expect(adapter.name).toBe('node')
  })

  it('returns node adapter when specified', () => {
    const adapter = resolveAdapter({ adapter: 'node' })
    expect(adapter.name).toBe('node')
  })

  it('returns bun adapter', () => {
    const adapter = resolveAdapter({ adapter: 'bun' })
    expect(adapter.name).toBe('bun')
  })

  it('returns static adapter', () => {
    const adapter = resolveAdapter({ adapter: 'static' })
    expect(adapter.name).toBe('static')
  })

  it('returns vercel adapter', () => {
    const adapter = resolveAdapter({ adapter: 'vercel' })
    expect(adapter.name).toBe('vercel')
  })

  it('returns cloudflare adapter', () => {
    const adapter = resolveAdapter({ adapter: 'cloudflare' })
    expect(adapter.name).toBe('cloudflare')
  })

  it('returns netlify adapter', () => {
    const adapter = resolveAdapter({ adapter: 'netlify' })
    expect(adapter.name).toBe('netlify')
  })

  it('throws for unknown adapter', () => {
    expect(() =>
      // @ts-expect-error testing invalid input
      resolveAdapter({ adapter: 'unknown-platform' }),
    ).toThrow('[zero] Unknown adapter: "unknown-platform"')
  })
})
