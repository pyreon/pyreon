import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EXTRA_SECTIONS } from '../content/extra-sections'
import type { ProductVisuals } from '../content/visuals'
import { DEMOS } from '../demos/registry'

/**
 * The products-a slice: the core/platform and data/state product pages.
 * Every one of these ids must have its content file, a wired demo whose
 * module exists, a hero visual (with the manifest's alt text, and the files
 * it points to in public/), a share image, and typed extra sections when
 * its content carries reference-only `extraSectionsHtml`.
 */
const IDS = [
  'zero',
  'content',
  'native',
  'primitives',
  'design',
  'kinetic',
  'router',
  'hooks',
  'validation',
  'auth',
  'query',
  'http',
  'store',
  'statetree',
  'machine',
  'sync',
  'storage',
] as const

const site = resolve(__dirname, '..')
const publicDir = resolve(__dirname, '../../../public')
const read = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

/** Every `/assets/…` path a visuals file points to (srcset entries included). */
function assetPaths(v: ProductVisuals): string[] {
  const out = new Set<string>()
  const walk = (x: unknown): void => {
    if (typeof x === 'string') {
      for (const m of x.matchAll(/\/assets\/[^\s,"]+/g)) out.add(m[0])
    } else if (Array.isArray(x)) x.forEach(walk)
    else if (x && typeof x === 'object') Object.entries(x).forEach(([k, val]) => k !== 'svg' && walk(val))
  }
  walk(v)
  return [...out]
}

describe('products-a pages', () => {
  it.each(IDS)('%s has content, a wired demo, a hero visual and a share image', (id) => {
    const contentPath = resolve(site, `content/products/${id}.json`)
    expect(existsSync(contentPath), `${id}.json`).toBe(true)
    const content = read<{ demo: { component: string }; extraSectionsHtml: string | null }>(contentPath)

    // The demo: registered under the content file's name, and its module exists.
    expect(Object.keys(DEMOS), `${content.demo.component} in the registry`).toContain(content.demo.component)
    expect(existsSync(resolve(site, `demos/${content.demo.component}.tsx`)), `demos/${content.demo.component}.tsx`).toBe(true)

    // The hero visual and share image.
    const visualsPath = resolve(site, `content/visuals/${id}.json`)
    expect(existsSync(visualsPath), `visuals/${id}.json`).toBe(true)
    const v = read<ProductVisuals>(visualsPath)
    expect(v.id).toBe(id)
    expect(v.hero.alt.length, 'hero alt text').toBeGreaterThan(20)
    if (v.hero.kind === 'svg') {
      expect(v.hero.svg).toMatch(/^<svg[^>]*role="img"/)
      expect(v.hero.svg).toContain('<title')
    }
    expect(v.og?.src).toBe(`/assets/og/products/${id}.png`)
    for (const p of assetPaths(v)) expect(existsSync(resolve(publicDir, `.${p}`)), p).toBe(true)

    // Reference-only extra sections are rebuilt as typed data.
    if (content.extraSectionsHtml) expect(EXTRA_SECTIONS[id]?.length ?? 0, `EXTRA_SECTIONS.${id}`).toBeGreaterThan(0)
  })

  it('an unreleased product never shows a copyable install command', () => {
    const auth = read<{ hero: { install: string } }>(resolve(site, 'content/products/auth.json'))
    // ProductPage renders a `#` install line as a "next release" note.
    expect(auth.hero.install.trimStart().startsWith('#')).toBe(true)
  })

  it('an extra section that names a diagram has it in the page visuals', () => {
    for (const [id, sections] of Object.entries(EXTRA_SECTIONS)) {
      for (const s of sections) {
        if (s.kind !== 'steps' || !s.visual) continue
        const v = read<ProductVisuals>(resolve(site, `content/visuals/${id}.json`))
        expect(v.svgs?.[s.visual]?.svg, `${id}: svgs.${s.visual}`).toMatch(/^<svg/)
      }
    }
  })
})
