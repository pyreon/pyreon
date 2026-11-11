import { products } from '../../site/content/_products.json'
import type { ProductSummary } from '../data'
import { DocsGlyph as Glyph } from '../glyph'
import { Inline } from '../inline'

const SUMMARIES = products as ProductSummary[]

/**
 * `<InlineSell id="validation" />` — one row pointing at ANOTHER product
 * where it is directly relevant (Validation inside a forms page): glyph,
 * name, its one-line pitch from `_products.json`, "Open →". At most one per
 * page: `sell-placement.test.ts` fails a page with two.
 */
export default function InlineSell(props: { id: string }) {
  const s = SUMMARIES.find((x) => x.id === props.id)
  if (!s) return null
  return (
    <aside class="dx-sell" aria-label={`Related product: ${s.name}`}>
      <span class="dx-tile">
        <Glyph id={s.id} size={22} />
      </span>
      <div>
        <b>{s.name}</b>
        <p><Inline text={s.pitch} /></p>
      </div>
      <a class="dx-pitch__link" href={s.href} aria-label={`Open ${s.name}`}>
        Open →
      </a>
    </aside>
  )
}
