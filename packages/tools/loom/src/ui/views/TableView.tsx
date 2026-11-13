/**
 * Manifest — the report as data. The design's `loom-report.json` block shows
 * a real excerpt of THIS scan (counts, the gate, the first findings) with a
 * download of the full document; under it, every package and external
 * dependency as a dense table (kind, version or ranges, findings, licence,
 * status), narrowed by the package-list filter.
 *
 * A real `<table>` with global classes (`global-css.ts`), not rocketstyle
 * rows: 300+ rows × styled components each cost ~450 ms to enter. Each row's
 * name cell is a real `<button>` stretched over the row, so the whole row is
 * the click target and the keyboard reaches every one.
 */
import { cx } from '@pyreon/core'
import * as C from '../chrome'
import type { NodeStatus, ObservatoryModel } from '../model'
import { findingsLabel } from '../selection-css'
import { reportExcerpt } from '../report-excerpt'

const STATUS_BADGE: Record<NodeStatus, { label: string; variant: 'ok' | 'warn' | 'danger' }> = {
  current: { label: 'current', variant: 'ok' },
  drift: { label: 'drift', variant: 'warn' },
  issue: { label: 'issues', variant: 'danger' },
  circular: { label: 'circular', variant: 'danger' },
}

export function TableView(props: { model: ObservatoryModel }) {
  const m = props.model

  // The full report as a data: URL, built only when the link is clicked
  // (the handler runs before the browser follows the href) — nothing to
  // revoke, nothing held between clicks.
  const download = (e: Event) => {
    const a = e.currentTarget as HTMLAnchorElement
    a.href = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(m.report, null, 2))}`
  }

  return (
    <C.ArticleWide data-testid="table-view">
      <div class="lm-code" data-testid="report-excerpt">
        <div class="lm-code-head">
          <span>loom-report.json</span>
          <span class="lm-sp" />
          <span class="lm-tag lm-col-opt">loom scan . --json</span>
          <a
            class="lm-dl"
            href="#download"
            download="loom-report.json"
            data-testid="report-download"
            onClick={download}
          >
            download
          </a>
        </div>
        <pre>{reportExcerpt(m.report)}</pre>
      </div>

      <table class="lm-tbl" data-testid="manifest-table">
        <caption class="lm-sr">Every package and external dependency</caption>
        <thead>
          <tr>
            <th class="lm-th-name">{() => `package · ${m.shown().length} of ${m.nodes.length}`}</th>
            <th class="lm-th-ver">version / ranges</th>
            <th class="lm-th-find lm-col-opt">findings</th>
            <th class="lm-th-lic lm-col-opt">license</th>
            <th class="lm-th-status">status</th>
          </tr>
        </thead>
        <tbody>
          {() =>
            m.shown().map((n) => {
              const badge = STATUS_BADGE[n.status]
              return (
                <tr
                  data-testid={`row-${n.id}`}
                  class={() => (m.selId() === n.id ? 'lm-tr is-sel' : 'lm-tr')}
                >
                  <td>
                    <button
                      type="button"
                      class="lm-tname"
                      title={n.id}
                      onClick={() => m.select(n.id)}
                    >
                      <span class={cx(['lm-sev', `lm-sev--${n.worst ?? 'none'}`])} aria-hidden="true" />
                      <span>{n.id}</span>
                    </button>
                  </td>
                  <td title={n.version}>{n.version}</td>
                  <td
                    class={cx([
                      'lm-col-opt',
                      n.errors ? 'lm-dangerc' : n.warnings ? 'lm-warnc' : undefined,
                    ])}
                  >
                    {findingsLabel(n)}
                  </td>
                  <td class="lm-col-opt">{n.license}</td>
                  <td>
                    <span class={cx(['lm-tag', `lm-tag--${badge.variant}`])}>{badge.label}</span>
                  </td>
                </tr>
              )
            })
          }
        </tbody>
      </table>
    </C.ArticleWide>
  )
}
