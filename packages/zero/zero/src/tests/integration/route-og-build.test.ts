/**
 * Real-build integration test for route-level OG images (`export const og`).
 *
 * Runs an ACTUAL `vite build` (mode 'ssg') of `fixture-og` with the zero
 * plugin chain constructed from src, then reads the emitted files:
 *   - every page whose leaf route exports `og` gets a content-hashed PNG
 *     under `dist/assets/og/`, a VALID PNG of exactly the configured size,
 *   - that page's `<meta property="og:image">` points at that file,
 *   - the card is rendered from params + LOADER DATA (distinct pixels per
 *     path prove the per-path context reached the component),
 *   - a route without `og` gets neither a PNG nor a meta tag,
 *   - the `og` export never reaches the client bundle.
 */
import { cpSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import pyreon from '@pyreon/vite-plugin'
import { build } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { zeroPlugin } from '../../vite-plugin'

// Each suite builds a PRIVATE copy of fixture-og: the three og/pwa suites
// run in parallel, and zero materializes its SSR/SSG entry inside the root,
// so a shared root lets one suite's cleanup delete another's entry.
const FIXTURE = resolve(import.meta.dirname, '.tmp-fixture-ogssg')
cpSync(resolve(import.meta.dirname, 'fixture-og'), FIXTURE, { recursive: true })
const DIST = join(FIXTURE, 'dist')

function ogHref(html: string): string | null {
  return html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ?? null
}

function pngSize(buf: Buffer): { width: number; height: number } {
  // PNG signature + IHDR (width/height are big-endian u32 at offset 16/20).
  expect([...buf.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  expect(buf.subarray(12, 16).toString('ascii')).toBe('IHDR')
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

async function topLeftPixel(buf: Buffer): Promise<number[]> {
  const { data } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
  return [data[0]!, data[1]!, data[2]!]
}

beforeAll(async () => {
  await rm(DIST, { recursive: true, force: true })
  await build({
    root: FIXTURE,
    configFile: false,
    logLevel: 'error',
    plugins: [pyreon(), ...zeroPlugin({ mode: 'ssg', routeOg: { width: 600, height: 315, siteUrl: 'https://ex.test' } })],
    resolve: { conditions: ['bun'] },
    build: { outDir: 'dist', emptyOutDir: true },
  })
}, 180_000)

afterAll(async () => {
  await rm(FIXTURE, { recursive: true, force: true })
})

describe('route og export — SSG build', () => {
  const pages = [
    ['/', 'index.html', [0x12, 0x34, 0x56]],
    ['/posts/hello', 'posts/hello/index.html', [255, 0, 0]],
    ['/posts/world', 'posts/world/index.html', [0, 255, 0]],
  ] as const

  for (const [path, file, rgb] of pages) {
    it(`${path}: meta points at an emitted, valid PNG of the configured size`, async () => {
      const html = readFileSync(join(DIST, file), 'utf-8')
      const href = ogHref(html)
      expect(href).not.toBeNull()
      expect(href!.startsWith('https://ex.test/assets/og/')).toBe(true)
      expect(html).toContain('<meta property="og:image:width" content="600">')
      expect(html).toContain('<meta property="og:image:height" content="315">')
      const onDisk = join(DIST, new URL(href!).pathname)
      expect(existsSync(onDisk)).toBe(true)
      const png = readFileSync(onDisk)
      expect(pngSize(png)).toEqual({ width: 600, height: 315 })
      expect(await topLeftPixel(png)).toEqual([...rgb])
    })
  }

  it('file names are content-hashed and one PNG exists per og page', () => {
    const files = readdirSync(join(DIST, 'assets', 'og')).sort()
    expect(files).toHaveLength(3)
    for (const f of files) expect(f).toMatch(/^[a-z0-9_-]+\.[0-9a-f]{10}\.png$/)
  })

  it('a route without `og` gets no og:image meta', () => {
    expect(ogHref(readFileSync(join(DIST, 'about', 'index.html'), 'utf-8'))).toBeNull()
  })

  it('the og component never reaches the client bundle', () => {
    const js = readdirSync(join(DIST, 'assets'))
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(join(DIST, 'assets', f), 'utf-8'))
      .join('\n')
    expect(js).not.toContain('#123456')
  })
})
