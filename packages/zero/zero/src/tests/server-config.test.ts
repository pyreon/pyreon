import { describe, expect, it } from 'vitest'
import { createMemoryStore } from '../isr'
import { serializeServerConfig } from '../server-config'

describe('serializeServerConfig', () => {
  it('carries the data a production server needs', () => {
    const { value, dropped } = serializeServerConfig({
      mode: 'isr',
      base: '/app/',
      ssr: { mode: 'stream' },
      isr: { revalidate: 30, cacheKey: 'path-only' },
      routeRules: { '/blog/**': { renderMode: 'isr' } },
      i18n: { locales: ['en', 'de'], defaultLocale: 'en' },
    })
    expect(value).toEqual({
      mode: 'isr',
      base: '/app/',
      ssr: { mode: 'stream' },
      isr: { revalidate: 30, cacheKey: 'path-only' },
      routeRules: { '/blog/**': { renderMode: 'isr' } },
      i18n: { locales: ['en', 'de'], defaultLocale: 'en' },
    })
    expect(dropped).toEqual([])
    // It must survive the JSON round trip the define performs.
    expect(JSON.parse(JSON.stringify(value))).toEqual(value)
  })

  it('reports code-valued options instead of silently losing them', () => {
    const { value, dropped } = serializeServerConfig({
      mode: 'isr',
      isr: {
        revalidate: 30,
        cacheKey: (req) => req.url,
        store: createMemoryStore(),
        responseFilter: (res) => res,
      },
      middleware: [() => {}],
    })
    expect(value.isr).toEqual({ revalidate: 30 })
    expect(dropped.sort()).toEqual(['isr.cacheKey', 'isr.responseFilter', 'isr.store', 'middleware'])
  })

  it('omits what is not set, and leaves adapters and plugins out entirely', () => {
    const { value } = serializeServerConfig({ port: 4000, adapter: 'node' })
    expect(value).toEqual({})
  })
})
