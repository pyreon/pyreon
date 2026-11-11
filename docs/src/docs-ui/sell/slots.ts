import type { ProductData } from '../../site/content/model'
import { DEMOS } from '../../site/demos/registry'
import { OVERVIEWS } from '../nav'
import type { TocHeading } from '../toc'

/**
 * The selling slots of a product overview page, in the order a page places
 * them (`sell-placement.test.ts` checks the Markdown):
 *
 *   top     <ProductPitch>  <LiveDemo>
 *   bottom  <BenchCallout>  <ComingFrom>  <InlineSell>  <CrossSell>
 *
 * Each slot renders its own heading, and only when its data exists, so a
 * missing demo or benchmark leaves no empty section. The TOC gets the same
 * headings from here (the Markdown's own headings come from the compiler).
 */
export const SLOT_IDS = {
  demo: 'try-it',
  bench: 'product-benchmarks',
  comingFrom: 'coming-from',
  learnMore: 'learn-more',
} as const

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

/** The `comingFrom` entry the overview names in `_docs.json` (else the product's first). */
export function comingFromOf(p: ProductData, lib?: string): NonNullable<ProductData['comingFrom']>[number] | undefined {
  const list = p.comingFrom ?? []
  const want = lib ?? OVERVIEWS.find((o) => o.productId === p.id)?.comingFrom?.lib
  return (want ? list.find((c) => norm(c.lib) === norm(want)) : undefined) ?? list[0]
}

export const hasDemo = (p: ProductData): boolean => DEMOS[p.demo.component] !== undefined

/** Headings the slots add above and below the page's own content. Pure. */
export function slotHeadings(p: ProductData | undefined): { before: TocHeading[]; after: TocHeading[] } {
  if (!p) return { before: [], after: [] }
  const before: TocHeading[] = hasDemo(p) ? [{ level: 2, text: 'Try it', slug: SLOT_IDS.demo }] : []
  const after: TocHeading[] = []
  if (p.benchmarks) after.push({ level: 2, text: 'Benchmarks', slug: SLOT_IDS.bench })
  const cf = comingFromOf(p)
  if (cf) after.push({ level: 2, text: `Coming from ${cf.lib}`, slug: SLOT_IDS.comingFrom })
  if (p.related.length > 0) after.push({ level: 2, text: 'Learn more', slug: SLOT_IDS.learnMore })
  return { before, after }
}
