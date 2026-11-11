import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FLAT, normalizeDocsPath, overviewProductAt, prevNextOf, railProductOf, SIDEBAR, sourcePathOf, trailOf } from '../nav'
import { OVERVIEWS } from '../overviews'

const CONTENT = join(import.meta.dirname, '../../content/docs')
function mdFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? mdFiles(p) : f.endsWith('.md') ? [relative(CONTENT, p)] : []
  })
}
/**
 * Pages written after the content set's sidebar was generated (_docs.json,
 * 2026-11-11). Each needs a place in the content set; listed here so a NEW
 * unlisted page still fails. They render, with breadcrumbs from their title.
 */
const NOT_YET_IN_SIDEBAR = ['/docs/blog']

const hrefOf = (file: string) => (file === 'index.md' ? '/docs' : `/docs/${file.replace(/\.md$/, '')}`)

describe('docs navigation (_docs.json)', () => {
  it('lists every Markdown page exactly once, and nothing else', () => {
    const pages = new Set(mdFiles(CONTENT).map(hrefOf))
    const listed = new Set(FLAT.map((p) => p.href))
    expect([...pages].filter((p) => !listed.has(p))).toEqual(NOT_YET_IN_SIDEBAR)
    expect([...listed].filter((p) => !pages.has(p))).toEqual([])
  })

  it('keeps the Products-menu group order', () => {
    expect(SIDEBAR.map((g) => g.group)).toEqual(['Get started', 'Build', 'Data and state', 'Visual and content', 'Developer tools', 'Guides', 'Migrate', 'Reference'])
  })

  it('normalizes trailing slashes, hashes and /docs/index', () => {
    expect(normalizeDocsPath('/docs/form/')).toBe('/docs/form')
    expect(normalizeDocsPath('/docs/form#install')).toBe('/docs/form')
    expect(normalizeDocsPath('/docs/index')).toBe('/docs')
  })

  it('walks prev / next in sidebar order across groups', () => {
    expect(prevNextOf('/docs').prev).toBeUndefined()
    expect(prevNextOf('/docs').next?.href).toBe(FLAT[1]?.href)
    const lastOfGetStarted = SIDEBAR[0]!.items.at(-1)!
    expect(prevNextOf(lastOfGetStarted.href).next?.href).toBe(normalizeDocsPath(SIDEBAR[1]!.items[0]!.href))
    expect(prevNextOf('/docs/no-such-page')).toEqual({ prev: undefined, next: undefined })
  })

  it('gives a child page its parent and its product', () => {
    const t = trailOf('/docs/ssr')
    expect(t?.parent?.productId).toBe('zero')
    expect(t?.productId).toBe('zero')
    expect(t?.group.group).toBe('Build')
  })

  it('suggests the product’s first cross-sell in the rail, and nothing outside products', () => {
    const form = OVERVIEWS.find((o) => o.productId === 'form')!
    expect(railProductOf('/docs/form')).toBe(form.crossSell[0])
    expect(railProductOf('/docs/guides/testing')).toBeUndefined()
  })

  it('treats only pages that ARE an overview as overviews (a product without its own page has none)', () => {
    expect(overviewProductAt('/docs/form/')).toBe('form')
    const gap = OVERVIEWS.find((o) => o.docsPage === null)
    if (gap) expect(overviewProductAt(gap.docsHref)).toBeUndefined()
  })

  it('maps a slug to its source file', () => {
    expect(sourcePathOf('form')).toBe('docs/src/content/docs/form.md')
    expect(sourcePathOf('')).toBe('docs/src/content/docs/index.md')
  })
})
