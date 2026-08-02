/**
 * Manifest table — the full package list as data: kind, version/ranges,
 * license, per-package finding counts, and the derived status badge.
 */
import * as C from '../chrome'
import type { NodeStatus, ObservatoryModel } from '../model'

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
      <C.Eyebrow>{() => `05 · manifest · ${m.shown().length} of ${m.nodes.length} shown`}</C.Eyebrow>
      <C.H1>The full manifest. Read it as data.</C.H1>
      <C.TableWrap>
        <C.TableHead>
          <span>PACKAGE</span>
          <span>VERSION / RANGES</span>
          <span>FINDINGS</span>
          <span>LICENSE</span>
          <span>STATUS</span>
        </C.TableHead>
        {() =>
          m.shown().map((n) => {
            const badge = STATUS_BADGE[n.status]
            return (
              <C.TableRow
                data-testid={`row-${n.id}`}
                state={() => (m.selId() === n.id ? 'active' : 'idle')}
                onClick={() => m.select(n.id)}
              >
                <C.CellName>
                  <C.KindDot variant={n.kind} />
                  <C.CellText variant={() => (m.selId() === n.id ? 'accent' : 'plain') as never}>{n.id}</C.CellText>
                </C.CellName>
                <C.CellText variant="muted">{n.version}</C.CellText>
                <C.CellText variant={n.errors > 0 ? 'warn' : 'faint'}>
                  {n.errors + n.warnings > 0 ? `${n.errors} err · ${n.warnings} warn` : '—'}
                </C.CellText>
                <C.CellText variant="faint">{n.license}</C.CellText>
                <C.StatusBadge variant={badge.variant}>{badge.label}</C.StatusBadge>
              </C.TableRow>
            )
          })
        }
      </C.TableWrap>
    </C.ArticleWide>
  )
}
