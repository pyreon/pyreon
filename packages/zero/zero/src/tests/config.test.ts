import { describe, expect, it } from 'vitest'
import { defineConfig, resolveConfig } from '../config'

describe('defineConfig', () => {
  it('returns the config as-is', () => {
    const config = defineConfig({ mode: 'ssg', port: 4000 })
    expect(config).toEqual({ mode: 'ssg', port: 4000 })
  })
})

describe('resolveConfig', () => {
  it('provides defaults', () => {
    const config = resolveConfig()
    expect(config.mode).toBe('ssr')
    expect(config.base).toBe('/')
    expect(config.port).toBe(3000)
    expect(config.adapter).toBe('node')
    expect(config.ssr?.mode).toBe('string')
  })

  it('merges user overrides', () => {
    const config = resolveConfig({ mode: 'ssg', port: 8080 })
    expect(config.mode).toBe('ssg')
    expect(config.port).toBe(8080)
    expect(config.base).toBe('/') // default preserved
  })

  it('merges nested ssr config', () => {
    const config = resolveConfig({ ssr: { mode: 'stream' } })
    expect(config.ssr?.mode).toBe('stream')
  })

  it('preserves middleware array', () => {
    const mw = [
      () => {
        /* noop middleware */
      },
    ]
    const config = resolveConfig({ middleware: mw as never })
    expect(config.middleware).toBe(mw)
  })

  it('preserves ssg config', () => {
    const paths = ['/', '/about']
    const config = resolveConfig({ ssg: { paths } })
    expect(config.ssg?.paths).toBe(paths)
  })

  it('preserves isr config', () => {
    const config = resolveConfig({ isr: { revalidate: 120 } })
    expect(config.isr?.revalidate).toBe(120)
  })
})
