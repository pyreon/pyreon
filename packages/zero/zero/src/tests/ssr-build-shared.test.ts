import { describe, expect, it } from 'vitest'
import { type BuildSsrBundleOptions, buildInnerBuildOptions } from '../ssr-build-shared'

const base: BuildSsrBundleOptions = {
  root: '/app',
  entryPath: '/app/__zero-entry.js',
  outDir: '/app/dist/server',
  outputFilename: 'entry-server.mjs',
  envFlag: 'PYREON_ZERO_SSG_INNER_BUILD',
  userConfig: {},
}

describe('buildInnerBuildOptions — asset-emission inheritance (#2)', () => {
  it('keeps the SSR-runtime-fixed settings (target/format/external) regardless of input', () => {
    const b = buildInnerBuildOptions(base)
    expect(b.ssr).toBe(base.entryPath)
    expect(b.outDir).toBe(base.outDir)
    expect(b.target).toBe('esnext')
    expect((b.rollupOptions as { output: { format: string } }).output.format).toBe('es')
  })

  it('omits assetsInlineLimit when the outer build did not set it (Vite default preserved)', () => {
    const b = buildInnerBuildOptions(base)
    // Absent — so the inner build keeps Vite's own default; no behaviour change
    // for apps that never configured it.
    expect('assetsInlineLimit' in b).toBe(false)
    expect('assetsDir' in b).toBe(false)
  })

  it('propagates assetsInlineLimit: 0 so small assets emit as files (matching the client build)', () => {
    // The proven bug: with configFile:false the inner build fell back to Vite's
    // 4 KB default and inlined <=4 KB images as data: URIs while the client
    // build (assetsInlineLimit: 0) emitted hashed files — an SSR/CSR mismatch.
    const b = buildInnerBuildOptions({ ...base, assetsInlineLimit: 0 })
    expect(b.assetsInlineLimit).toBe(0)
  })

  it('propagates a numeric assetsInlineLimit and assetsDir', () => {
    const b = buildInnerBuildOptions({ ...base, assetsInlineLimit: 8192, assetsDir: 'static' })
    expect(b.assetsInlineLimit).toBe(8192)
    expect(b.assetsDir).toBe('static')
  })

  it('propagates the Vite-5 predicate form of assetsInlineLimit by reference', () => {
    const predicate = () => false
    const b = buildInnerBuildOptions({ ...base, assetsInlineLimit: predicate })
    expect(b.assetsInlineLimit).toBe(predicate)
  })
})
