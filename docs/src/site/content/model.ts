import type { ProductIndex, ProductPage } from './types'

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
      items: { pkg: string; role: string; text: string }[]
    }
  | {
      kind: 'steps'
      label: string
      title: string
      text?: string
      items: { title: string; text: string }[]
    }
  | {
      kind: 'stats'
      label: string
      title: string
      text?: string
      stats: { value: string; label: string }[]
    }

export type ProductData = Omit<ProductPage, 'difference' | 'comingFrom' | 'recipes'> & {
  difference: null | { title: string; before: HighlightedCode; after: HighlightedCode }
  comingFrom?: { lib: string; title: string; before: string; after: string; note?: string; beforeHtml?: string; afterHtml?: string }[]
  recipes?: { title: string; text: string; code: string; codeHtml?: string; status?: string }[]
  extraSections?: ExtraSection[]
}

export type Benchmarks = NonNullable<ProductPage['benchmarks']>
export type BenchmarkRow = Benchmarks['rows'][number]
export type Verdict = BenchmarkRow['verdict']
