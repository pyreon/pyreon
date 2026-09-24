/**
 * Manifest table — the full package list as data: kind, version/ranges,
 * license, per-package finding counts, and the derived status badge.
 *
 * A real `<table>` with global classes (`global-css.ts`), not rocketstyle
 * rows: 300+ rows × 7 styled components each cost ~450 ms to enter, and the
 * old grid-on-a-`<button>` layout collapsed (Element's button fix layer wraps
 * the children, so the grid saw ONE child and stacked the cells). A table
 * aligns its columns by construction and keeps a sticky header for free.
 *
 * Each row's name cell is a real `<button>` (keyboard-reachable), stretched
 * over the row with a pseudo-element so the whole row is the click target.
 */
import { cx } from '@pyreon/core'
import * as C from '../chrome'
import type { NodeStatus, ObservatoryModel } from '../model'
import { findingsLabel } from '../selection-css'

const STATUS_BADGE: Record<NodeStatus, { label: string; variant: 'ok' | 'warn' | 'danger' }> = {
  current: { label: 'current', variant: 'ok' },
  drift: { label: 'drift', variant: 'warn' },
  issue: { label: 'issues', variant: 'danger' },
  circular: { label: 'circular', variant: 'danger' },
}

export function TableView(props: { model: ObservatoryModel }) {
  const m = props.model

  return (
    <C.ArticleWide data-testid="table-view">
      <C.Eyebrow>
        {() => `05 · manifest · ${m.shown().length} of ${m.nodes.length} shown`}
      </C.Eyebrow>
      <C.H1>The full manifest. Read it as data.</C.H1>
      <table class="lm-tbl">
        <thead>
          <tr>
            <th class="lm-th-name">PACKAGE</th>
            <th class="lm-th-ver">VERSION / RANGES</th>
            <th class="lm-th-find lm-col-opt">FINDINGS</th>
            <th class="lm-th-lic lm-col-opt">LICENSE</th>
            <th class="lm-th-status">STATUS</th>
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
                      <i class={cx(['lm-kdot', `lm-kdot--${n.kind}`])} />
                      <span>{n.id}</span>
                    </button>
                  </td>
                  <td title={n.version}>{n.version}</td>
                  <td class={n.errors || n.warnings ? 'lm-col-opt lm-warnc' : 'lm-col-opt'}>
                    {findingsLabel(n)}
                  </td>
                  <td class="lm-col-opt">{n.license}</td>
                  <td>
                    <span class={cx(['lm-badge', `lm-badge--${badge.variant}`])}>
                      {badge.label}
                    </span>
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
