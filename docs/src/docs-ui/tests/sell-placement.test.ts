import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FLAT } from '../nav'
import { OVERVIEWS } from '../overviews'

/**
 * The docs' "lint:docs" rules for the selling slots, run over every page:
 *   - at most ONE <InlineSell> per page;
 *   - the slots that read a product's full content file (<ProductPitch>,
 *     <LiveDemo>, <BenchCallout>, <ComingFrom>, <CrossSell id>) only on that
 *     product's overview page (the only page that loads it);
 *   - every overview page has the six slots, pitch + demo first, the rest last.
 */
const CONTENT = join(import.meta.dirname, '../../content/docs')
const sourceOf = (href: string) =>
  readFileSync(join(CONTENT, href === '/docs' ? 'index.md' : `${href.slice('/docs/'.length)}.md`), 'utf8')
const body = (src: string) => src.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/```[\s\S]*?```/g, '')
const SLOT_RE = /<(ProductPitch|LiveDemo|BenchCallout|ComingFrom|CrossSell|InlineSell)\b([^>]*)\/>/g

const pages = FLAT.map((p) => ({ href: p.href, text: body(sourceOf(p.href)) }))

describe('selling slots in the Markdown', () => {
  it('no page carries more than one inline sell', () => {
    const offenders = pages.filter((p) => (p.text.match(/<InlineSell\b/g) ?? []).length > 1).map((p) => p.href)
    expect(offenders).toEqual([])
  })

  it('product-content slots sit only on that product’s overview page', () => {
    const wrong: string[] = []
    for (const p of pages) {
      for (const m of p.text.matchAll(SLOT_RE)) {
        if (m[1] === 'InlineSell' || /\bids=/.test(m[2] ?? '')) continue
        const id = /\bid="([^"]+)"/.exec(m[2] ?? '')?.[1]
        const overview = OVERVIEWS.find((o) => o.productId === id)
        if (!overview || overview.docsPage === null || overview.docsHref !== p.href) wrong.push(`${p.href}: <${m[1]} id="${id}">`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('every overview page has the six slots in order, with the right ids', () => {
    for (const o of OVERVIEWS.filter((x) => x.docsPage !== null)) {
      const found = [...body(sourceOf(o.docsHref)).matchAll(SLOT_RE)].map((m) => `${m[1]}:${/\bid="([^"]+)"/.exec(m[2] ?? '')?.[1]}`)
      expect(found, o.docsHref).toEqual([
        `ProductPitch:${o.productId}`,
        `LiveDemo:${o.productId}`,
        `BenchCallout:${o.productId}`,
        `ComingFrom:${o.productId}`,
        `InlineSell:${o.crossSell[0]}`,
        `CrossSell:${o.productId}`,
      ])
    }
  })
})
