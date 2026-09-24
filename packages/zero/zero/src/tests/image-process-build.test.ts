/**
 * Build-time image processing: content-hashed names, width de-duplication,
 * and the cross-build encode cache.
 */
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { processImage } from '../image-plugin'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

async function png(dir: string, file: string, color: { r: number; g: number; b: number }) {
  const sharp = await import('sharp').then((m) => m.default ?? m)
  const buf = await sharp({
    create: { width: 800, height: 400, channels: 3, background: color },
  } as never)
    .png()
    .toBuffer()
  const path = join(dir, file)
  writeFileSync(path, buf)
  return path
}

function opts(cacheDir: string) {
  return {
    widths: [640, 1024, 1920],
    formats: ['webp' as const],
    qualityFor: () => 80,
    placeholderStrategy: 'none' as const,
    placeholderSize: 16,
    outSubDir: 'assets/img',
    cacheDir,
  }
}

function tmp() {
  const d = mkdtempSync(join(tmpdir(), 'zero-img-'))
  dirs.push(d)
  return d
}

describe('processImage (build)', () => {
  it('names carry a content hash, and widths that clamp together collapse to one', async () => {
    const d = tmp()
    const src = await png(d, 'hero.png', { r: 255, g: 0, b: 0 })
    const { image, files } = await processImage(src, opts(join(d, 'cache')))
    // 800px source: 640 and 800 (1024 and 1920 both clamp to 800).
    expect(image.sources.map((s) => s.width)).toEqual([640, 800])
    for (const s of image.sources) expect(s.src).toMatch(/^hero-[0-9a-f]{8}-\d+\.webp$/)
    expect(files.size).toBe(2)
  })

  it('two different images with the same file name get different names', async () => {
    const a = tmp()
    const b = tmp()
    const ra = await processImage(await png(a, 'hero.png', { r: 255, g: 0, b: 0 }), opts(join(a, 'c')))
    const rb = await processImage(await png(b, 'hero.png', { r: 0, g: 0, b: 255 }), opts(join(b, 'c')))
    const na = ra.image.sources.map((s) => s.src)
    const nb = rb.image.sources.map((s) => s.src)
    expect(na.some((n) => nb.includes(n))).toBe(false)
  })

  it('a second build reads encoded variants from the cache', async () => {
    const d = tmp()
    const cache = join(d, 'cache')
    const src = await png(d, 'hero.png', { r: 0, g: 128, b: 0 })
    await processImage(src, opts(cache))
    const entries = readdirSync(cache)
    expect(entries).toHaveLength(2)
    // Replace a cached entry: if the next build returns these bytes, it read
    // the cache rather than re-encoding.
    const marker = new Uint8Array([1, 2, 3])
    for (const e of entries) writeFileSync(join(cache, e), marker)
    const { files } = await processImage(src, opts(cache))
    for (const bytes of files.values()) expect([...bytes]).toEqual([1, 2, 3])
  })
})
