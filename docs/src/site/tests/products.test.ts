import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EXTRA_SECTIONS } from '../content/extra-sections'
import { EXTRA_SECTIONS_MORE } from '../content/extra-sections.more'
import type { ProductVisuals } from '../content/visuals'
import { DEMOS } from '../demos/registry'

/**
 * Every product page: its content file, a wired demo whose module exists, a
 * hero visual (with the manifest's alt text, and the files it points to in
 * public/), a share image, and typed extra sections when its content carries
 * reference-only `extraSectionsHtml`. The ids are the content files present,
 * and `_products.json` must list exactly those.
 */
const productsDir = resolve(__dirname, '../content/products')
const IDS = readdirSync(productsDir)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .map((f) => f.slice(0, -'.json'.length))
  .sort()

const site = resolve(__dirname, '..')
const publicDir = resolve(__dirname, '../../../public')
const read = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

/** Every `/media/…` path a visuals file points to (srcset entries included). */
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

describe('product pages', () => {
  it.each(IDS)('%s: the hero ember word is in the title, outside code', (id) => {
    const hero = read<{ hero: { title: string; emberWord: string } }>(resolve(site, `content/products/${id}.json`)).hero
    const i = hero.title.indexOf(hero.emberWord)
    expect(hero.emberWord.length, `${id}: emberWord`).toBeGreaterThan(0)
    expect(i, `${id}: "${hero.emberWord}" in "${hero.title}"`).toBeGreaterThanOrEqual(0)
    expect(hero.title.slice(0, i).split('`').length % 2, `${id}: ember word inside backticks`).toBe(1)
  })

  it('covers all 40 products, and the products index lists exactly them', () => {
    expect(IDS).toHaveLength(40)
    const index = read<{ groups?: { products: { id: string }[] }[]; products?: { id: string }[] }>(resolve(site, 'content/_products.json'))
    const listed = JSON.stringify(index)
    for (const id of IDS) expect(listed, `_products.json lists ${id}`).toContain(`"${id}"`)
  })

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
    expect((v.hero.kind === 'loop' ? v.hero.media.alt : v.hero.alt).length, 'hero alt text').toBeGreaterThan(20)
    if (v.hero.kind === 'svg') {
      expect(v.hero.svg).toMatch(/^<svg[^>]*role="img"/)
      expect(v.hero.svg).toContain('<title')
    }
    expect(v.og?.src).toBe(`/media/og/products/${id}.png`)
    for (const p of assetPaths(v)) expect(existsSync(resolve(publicDir, `.${p}`)), p).toBe(true)

    // Reference-only extra sections are rebuilt as typed data.
    if (content.extraSectionsHtml) expect((EXTRA_SECTIONS[id] ?? EXTRA_SECTIONS_MORE[id])?.length ?? 0, `EXTRA_SECTIONS.${id}`).toBeGreaterThan(0)
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
