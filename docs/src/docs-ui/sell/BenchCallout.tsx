import { For } from '@pyreon/core'
import { useDocsData } from '../data'
import { benchHeadline } from './headline'
import { When } from '../when'
import { SLOT_IDS } from './slots'
import { VerdictChip } from '../../site/kit/bench'
import { useLinkClick } from '../../site/kit/link'
import { formatMeasure, RECORD_LINE } from '../../site/kit/verdict'

/**
 * `<BenchCallout id="form" />` — the product's benchmark result inside its
 * docs: the headline numeral (timed wins out of timed rows), the section
 * headline and intro, every row with its value pair, ratio and verdict chip
 * (ties and losses stay in), and the record line with the run condition.
 * Data: `content/<id>.json#benchmarks`, the same rows the product page and
 * /benchmarks print. Renders nothing without a published head-to-head.
 */
export default function BenchCallout(props: { id: string }) {
  const p = useDocsData().product
  const click = useLinkClick()
  if (!p || p.id !== props.id || !p.benchmarks) return null
  const b = p.benchmarks
  const big = benchHeadline(b)
  return (
    <section class="dx-slot" aria-labelledby={SLOT_IDS.bench}>
      <h2 id={SLOT_IDS.bench}>Benchmarks</h2>
      <div class="dx-bench">
      <div class="dx-bench__head">
        <When on={big}>
          <span class="dx-bench__big" aria-hidden="true">
            {big}
          </span>
        </When>
        <div>
          <b>{b.h}</b>
          <p>{b.p}</p>
        </div>
      </div>
      <ul class="dx-bench__rows">
        <For each={b.rows} by={(r) => r.op}>
          {(r) => (
            <li class="dx-bench__row">
              <span class="dx-bench__op">{r.op}</span>
              <span class="dx-bench__vals">
                <When on={r.pyreon != null && r.rival != null && r.unit !== 'x'}>
                  <b>{formatMeasure(r.pyreon ?? 0, r.unit)}</b> vs {formatMeasure(r.rival ?? 0, r.unit)}
                </When>
              </span>
              <span class="dx-bench__lab">{r.label}</span>
              <VerdictChip verdict={r.verdict} />
            </li>
          )}
        </For>
      </ul>
      <p class="dx-caveat">
        <span>{`${b.rival} · ${RECORD_LINE} · ${b.run} · author-run, synthetic · `}</span>
        <a href="/benchmarks" onClick={click('/benchmarks')}>
          Every result, including where we lose →
        </a>
      </p>
      </div>
    </section>
  )
}
