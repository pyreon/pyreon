import { Show } from '@pyreon/core'
import { useDocsData } from '../data'
import { CodeCard } from '../../site/kit/code'
import { renderInline } from '../../site/kit/type'
import { comingFromOf, SLOT_IDS } from './slots'

/**
 * `<ComingFrom id="form" lib="react-hook-form" />` — the same code in the
 * library a reader uses today and in Pyreon, stacked (side by side is too
 * narrow in the 780px column): plasma rail on the rival, cyan on Pyreon.
 * Data: `content/<id>.json#comingFrom`; `lib` picks an entry by name
 * (case and punctuation ignored), else the one `_docs.json` names for the
 * overview, else the first. Renders nothing when the product has none.
 */
export default function ComingFrom(props: { id: string; lib?: string }) {
  const p = useDocsData().product
  if (!p || p.id !== props.id || !p.comingFrom || p.comingFrom.length === 0) return null
  const c = comingFromOf(p, props.lib)
  if (!c) return null
  return (
    <section class="dx-slot" aria-labelledby={SLOT_IDS.comingFrom}>
      <h2 id={SLOT_IDS.comingFrom}>Coming from {c.lib}?</h2>
      <p class="dx-cf__title">{renderInline(c.title)}</p>
      <div class="dx-cf">
        <CodeCard label={c.lib} code={c.before} html={c.beforeHtml} rail="del" />
        <CodeCard label={p.package} code={c.after} html={c.afterHtml} state="hot" rail="ins" />
      </div>
      <Show when={() => !!c.note}>
        <p class="dx-cf__note">{renderInline(c.note ?? '')}</p>
      </Show>
    </section>
  )
}
