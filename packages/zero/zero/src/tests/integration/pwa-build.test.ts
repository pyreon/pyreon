/**
 * Real-build test for `zero({ pwa })`: runs ACTUAL `vite build`s of
 * `fixture-og` and reads the emitted worker. The load-bearing assertion is
 * that the precache list equals the files that actually shipped — every
 * content-hashed asset + (SSG) every prerendered page, nothing that does
 * not exist on disk, and no internal artifacts.
 */
import { cpSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { build } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'
import { zeroPlugin } from '../../vite-plugin'
import type { ZeroConfig } from '../../types'

// Each suite builds a PRIVATE copy of fixture-og: the three og/pwa suites
// run in parallel, and zero materializes its SSR/SSG entry inside the root,
// so a shared root lets one suite's cleanup delete another's entry.
const FIXTURE = resolve(import.meta.dirname, '.tmp-fixture-pwa')
cpSync(resolve(import.meta.dirname, 'fixture-og'), FIXTURE, { recursive: true })
const OUT = 'dist-pwa'
const DIST = join(FIXTURE, OUT)

const pwa: ZeroConfig['pwa'] = {
  manifest: { name: 'OG Fixture', short_name: 'OG', theme_color: '#123456', icons: [] },
}

async function buildWith(cfg: ZeroConfig): Promise<void> {
  await rm(DIST, { recursive: true, force: true })
  await build({
    root: FIXTURE,
    configFile: false,
    logLevel: 'error',
    plugins: zeroPlugin(cfg),
    resolve: { conditions: ['bun'] },
    build: { outDir: OUT, emptyOutDir: true },
  })
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const full = join(dir, n)
    return statSync(full).isDirectory() ? walk(full) : [relative(DIST, full).split(sep).join('/')]
  })
}

function readCfg(swPath: string): { precache: string[]; skipWaiting: boolean; version: string } {
  const src = readFileSync(swPath, 'utf-8')
  return JSON.parse(src.match(/^const CFG = (.*);$/m)![1]!)
}

afterAll(async () => {
  await rm(FIXTURE, { recursive: true, force: true })
})

describe('zero({ pwa }) — real builds', () => {
  it('SSG: precache == emitted hashed assets + prerendered pages', async () => {
    await buildWith({ mode: 'ssg', pwa })
    const files = walk(DIST)
    const expected = files
      .filter(
        (f) =>
          (f.startsWith('assets/') && !f.endsWith('.map') && !f.startsWith('assets/og/')) ||
          (f.endsWith('.html') && f !== '404.html'),
      )
      .map((f) => `/${f}`)
      .sort()
    const cfg = readCfg(join(DIST, 'sw.js'))
    expect(cfg.precache).toEqual(expected)
    // Sanity: the list is non-trivial and covers the page + asset kinds.
    expect(cfg.precache).toContain('/index.html')
    expect(cfg.precache).toContain('/posts/hello/index.html')
    expect(cfg.precache.some((u) => /^\/assets\/.+\.js$/.test(u))).toBe(true)
    for (const u of cfg.precache) expect(existsSync(join(DIST, u))).toBe(true)
    expect(cfg.skipWaiting).toBe(false)

    // Manifest emitted + linked from every page.
    const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.webmanifest'), 'utf-8'))
    expect(manifest).toMatchObject({ name: 'OG Fixture', start_url: '/', scope: '/', display: 'standalone' })
    const home = readFileSync(join(DIST, 'index.html'), 'utf-8')
    expect(home).toContain('<link rel="manifest" href="/manifest.webmanifest">')
    expect(home).toContain('<meta name="theme-color" content="#123456">')
  }, 180_000)

  it('SSR: precache is hashed assets only (HTML is network-first per request)', async () => {
    await buildWith({ mode: 'ssr', pwa: { ...pwa, skipWaiting: true } })
    // node adapter stages the client into dist/client — the worker travels with it.
    const clientRoot = existsSync(join(DIST, 'client', 'sw.js')) ? join(DIST, 'client') : DIST
    const cfg = readCfg(join(clientRoot, 'sw.js'))
    expect(cfg.precache.length).toBeGreaterThan(0)
    expect(cfg.precache.every((u) => u.startsWith('/assets/'))).toBe(true)
    for (const u of cfg.precache) expect(existsSync(join(clientRoot, u))).toBe(true)
    expect(cfg.skipWaiting).toBe(true)
  }, 180_000)

  it('SPA: the plugin writes the worker itself (no SSR/SSG post-step)', async () => {
    await buildWith({ mode: 'spa', pwa })
    const cfg = readCfg(join(DIST, 'sw.js'))
    const expected = walk(DIST)
      .filter((f) => f.startsWith('assets/') && !f.endsWith('.map'))
      .map((f) => `/${f}`)
      .sort()
    expect(cfg.precache).toEqual(expected)
    expect(existsSync(join(DIST, 'manifest.webmanifest'))).toBe(true)
  }, 180_000)
})
