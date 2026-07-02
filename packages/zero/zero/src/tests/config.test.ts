import { describe, expect, it } from 'vitest'
import { defineConfig, detectPlatformAdapter, resolveConfig } from '../config'

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

describe('detectPlatformAdapter', () => {
  it('detects vercel / netlify / cloudflare from build env vars', () => {
    expect(detectPlatformAdapter({ VERCEL: '1' })).toBe('vercel')
    expect(detectPlatformAdapter({ NETLIFY: 'true' })).toBe('netlify')
    expect(detectPlatformAdapter({ CF_PAGES: '1' })).toBe('cloudflare')
  })

  it('returns null when no platform env is present', () => {
    expect(detectPlatformAdapter({})).toBe(null)
    expect(detectPlatformAdapter({ CI: 'true', NODE_ENV: 'production' })).toBe(null)
  })

  it('prefers vercel when multiple are somehow set (stable order)', () => {
    expect(detectPlatformAdapter({ VERCEL: '1', NETLIFY: 'true' })).toBe('vercel')
  })
})

describe('resolveConfig adapter auto-detection', () => {
  it('uses the detected platform adapter when adapter is unset', () => {
    vi.stubEnv('VERCEL', '1')
    try {
      expect(resolveConfig().adapter).toBe('vercel')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('an explicit adapter always wins over detection', () => {
    vi.stubEnv('VERCEL', '1')
    try {
      expect(resolveConfig({ adapter: 'node' }).adapter).toBe('node')
      expect(resolveConfig({ adapter: 'netlify' }).adapter).toBe('netlify')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
