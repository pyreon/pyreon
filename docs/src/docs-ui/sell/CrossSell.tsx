import { products } from '../../site/content/_products.json'
import { useDocsData, type ProductSummary } from '../data'
import { DocsGlyph as Glyph } from '../glyph'
import { useLinkClick } from '../../site/kit/link'
import { renderInline } from '../../site/kit/type'
import { SLOT_IDS } from './slots'

const SUMMARIES = products as ProductSummary[]

interface Card {
  id: string | undefined
  name: string
  href: string
  text: string
}

/**
 * "Learn more" / next steps: three cards.
 *
 *   <CrossSell id="form" />            the product's own `related` list (content/<id>.json)
 *   <CrossSell ids="query,store,i18n" />  those products' pitches (_products.json)
 *
 * Unknown ids are skipped; nothing renders when no card is left.
 */
export default function CrossSell(props: { id?: string; ids?: string | string[] }) {
  const p = useDocsData().product
  const click = useLinkClick()
  let cards: Card[] = []
  if (props.ids !== undefined) {
    const ids = Array.isArray(props.ids) ? props.ids : props.ids.split(',').map((x) => x.trim())
    cards = ids
      .map((id) => SUMMARIES.find((s) => s.id === id))
      .filter((s): s is ProductSummary => s !== undefined)
      .map((s) => ({ id: s.id, name: s.name, href: s.href, text: s.pitch }))
  } else if (p && p.id === props.id) {
    cards = p.related.map((r) => ({ id: /^\/products\/([a-z0-9-]+)$/.exec(r.href)?.[1], name: r.name, href: r.href, text: r.text }))
  }
  if (cards.length === 0) return null
  return (
    <section class="dx-slot" aria-labelledby={SLOT_IDS.learnMore}>
      <h2 id={SLOT_IDS.learnMore}>Learn more</h2>
    <ul class="dx-lm">
      {cards.map((c) => (
        <li>
          <a href={c.href} onClick={click(c.href)}>
            <b>
              {c.id ? <Glyph id={c.id} size={16} /> : null}
              {c.name}
            </b>
            <span>{renderInline(c.text)}</span>
          </a>
        </li>
      ))}
    </ul>
    </section>
  )
}
