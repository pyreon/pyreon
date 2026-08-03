/**
 * Detail panel — the selected node: kind, version/status chips, the circular
 * warning when it sits in a loop, metrics, depends-on / required-by chips,
 * per-node findings, and the resolution path from the nearest entry point.
 */
import { Show } from '@pyreon/core'
import * as C from '../chrome'
import { pathTo, type ObservatoryModel } from '../model'

export function DetailPanel(props: { model: ObservatoryModel }) {
  const m = props.model

  return (
    <C.Panel data-testid="loom-panel">
      {() => {
        const n = m.sel()
        const badgeVariant = n.status === 'current' ? 'ok' : n.status === 'drift' ? 'warn' : 'danger'
        const issues = m.report.issues.filter((i) => i.pkg === n.id || i.dep === n.id)
        const path = n.kind === 'internal' ? pathTo(m, n.id) : [n.id]
        const reach = m.report.graph.reach[n.id]

        return (
          <>
            <C.PanelHead>
              <C.PanelKind>{n.kind === 'internal' ? 'INTERNAL PACKAGE' : 'EXTERNAL DEPENDENCY'}</C.PanelKind>
              <C.PanelName data-testid="panel-name">{n.id}</C.PanelName>
              <C.ChipRow>
                <C.MetaChip>{n.kind === 'internal' ? `v${n.version}` : n.version}</C.MetaChip>
                <C.MetaChip>{n.license}</C.MetaChip>
                <C.StatusBadge data-testid="panel-status" variant={badgeVariant}>
                  {n.status}
                </C.StatusBadge>
              </C.ChipRow>
            </C.PanelHead>
            <C.PanelBody>
              <Show when={() => m.cycleNodes.has(n.id)}>
                <C.CycleWarn>
                  <C.CycleWarnTitle>CIRCULAR</C.CycleWarnTitle>
                  <C.CycleWarnText>
                    This package participates in a runtime dependency loop. Imports resolve back to itself, which
                    blocks layering and can break module initialisation order.
                  </C.CycleWarnText>
                </C.CycleWarn>
              </Show>

              <C.PanelSection>METRICS</C.PanelSection>
              <C.MetricRow>
                <C.MetricLabel>Resolution depth</C.MetricLabel>
                <C.MetricValue variant="plain">{String(n.depth)}</C.MetricValue>
              </C.MetricRow>
              <C.MetricRow>
                <C.MetricLabel>Direct dependencies</C.MetricLabel>
                <C.MetricValue variant="plain">{String(n.deps.length)}</C.MetricValue>
              </C.MetricRow>
              <C.MetricRow>
                <C.MetricLabel>Direct dependents</C.MetricLabel>
                <C.MetricValue variant="plain">{String(n.dependents.length)}</C.MetricValue>
              </C.MetricRow>
              {reach !== undefined ? (
                <C.MetricRow>
                  <C.MetricLabel>Transitive reach</C.MetricLabel>
                  <C.MetricValue variant={reach > 10 ? 'warn' : 'plain'}>{`${reach} pkg`}</C.MetricValue>
                </C.MetricRow>
              ) : null}
              <C.MetricRow>
                <C.MetricLabel>Findings</C.MetricLabel>
                <C.MetricValue variant={n.errors ? 'danger' : n.warnings ? 'warn' : 'ok'}>
                  {`${n.errors} err · ${n.warnings} warn`}
                </C.MetricValue>
              </C.MetricRow>

              <C.PanelSection>{`DEPENDS ON · ${n.deps.length}`}</C.PanelSection>
              <Show when={() => n.deps.length === 0}>
                <C.PanelNote>Leaf package — no runtime dependencies.</C.PanelNote>
              </Show>
              <C.ChipRow>
                {n.deps.map((d) => (
                  <C.DepChip
                    variant={(m.byId.get(d)?.kind ?? 'external') as never}
                    onClick={() => m.byId.has(d) && m.select(d)}
                  >
                    {d}
                  </C.DepChip>
                ))}
              </C.ChipRow>

              <C.PanelSection>{`REQUIRED BY · ${n.dependents.length}`}</C.PanelSection>
              <Show when={() => n.dependents.length === 0}>
                <C.PanelNote>Entry point — nothing in the workspace depends on this.</C.PanelNote>
              </Show>
              <C.ChipRow>
                {n.dependents.map((d) => (
                  <C.DepChip variant="internal" onClick={() => m.byId.has(d) && m.select(d)}>
                    {d}
                  </C.DepChip>
                ))}
              </C.ChipRow>

              <Show when={() => issues.length > 0}>
                <C.PanelSection>{`FINDINGS · ${issues.length}`}</C.PanelSection>
                {issues.slice(0, 8).map((issue) => (
                  <C.FindingCard variant={issue.severity} data-testid={`finding-${issue.code}`}>
                    <C.FindingTitle variant={issue.severity}>{`${issue.severity.toUpperCase()} · ${issue.code}`}</C.FindingTitle>
                    <C.FindingText>{issue.message}</C.FindingText>
                  </C.FindingCard>
                ))}
              </Show>

              <C.PanelSection>RESOLUTION PATH</C.PanelSection>
              <C.PathBlock data-testid="panel-path">
                {path.map((x, i) => (i ? '  '.repeat(i) + '└─ ' : '') + x).join('\n')}
              </C.PathBlock>
            </C.PanelBody>
          </>
        )
      }}
    </C.Panel>
  )
}
