import type { ExtraSectionMore } from './extra-sections.more'
import type { ProductIndex, ProductPage } from './types'
import type { ProductVisuals } from './visuals'

/**
 * The app's view of a product content file.
 *
 * `types.ts` is the content set's own schema, copied verbatim from
 * `pyreon-promo/09-site/types.ts` so a re-sync is a file copy. Everything the
 * site adds on top lives here:
 *
 *   - `…Html` siblings the build adds to code fields (vite-plugins/product-content.ts)
 *   - `extraSections`: typed data replacing the reference-only
 *     `extraSectionsHtml` (rendered with SectionHead + AutoGrid + the kit).
 *     A file that has `extraSectionsHtml` but no `extraSections` renders no
 *     extra section (the HTML is reference, never injected).
 */
export type { ProductIndex }

export interface HighlightedCode {
  label: string
  caption: string
  code: string
  /** Build-time Shiki output (both themes). */
  codeHtml?: string
}

export type ExtraSection =
  | {
      kind: 'packages'
      label: string
      title: string
      text?: string
      /** Fixed column count from 960px; omitted = auto-fit (min 250px). */
      cols?: 1 | 2 | 3
      items: {
        pkg: string
        role: string
        text: string
        /** The card to start with (ember ring). */
        hot?: boolean
        /** A command shown under the text (e.g. the install line). */
        command?: string
        /** A link to the product page that sells this package. */
        link?: { label: string; href: string }
      }[]
    }
  | {
      kind: 'steps'
      label: string
      title: string
      text?: string
      items: { title: string; text: string }[]
      /** Key into the page's `visuals.svgs`: an animated diagram under the steps. */
      visual?: string
    }
  | {
      kind: 'stats'
      label: string
      title: string
      text?: string
      stats: { value: string; label: string }[]
    }
  | {
      /** One ember-ringed card pointing at a companion product. */
      kind: 'callout'
      label: string
      title: string
      text: string
      links: { label: string; href: string; solid?: boolean }[]
    }
  | ExtraSectionMore

export type ProductData = Omit<ProductPage, 'difference' | 'comingFrom' | 'recipes'> & {
  difference: null | { title: string; before: HighlightedCode; after: HighlightedCode }
  comingFrom?: { lib: string; title: string; before: string; after: string; note?: string; beforeHtml?: string; afterHtml?: string }[]
  recipes?: { title: string; text: string; code: string; codeHtml?: string; status?: string }[]
  extraSections?: ExtraSection[]
  /** The page's hero visual, share image and diagrams (content/visuals.ts), attached by the loader. */
  visuals?: ProductVisuals
}

export type Benchmarks = NonNullable<ProductPage['benchmarks']>
export type BenchmarkRow = Benchmarks['rows'][number]
export type Verdict = BenchmarkRow['verdict']
