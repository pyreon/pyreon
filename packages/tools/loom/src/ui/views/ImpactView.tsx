/**
 * Impact view — blast radius, counted not guessed: transitive internal
 * dependents per package, ranked, with the workspace-level stat cards.
 */
import * as C from '../chrome'
import { impactRows, type ObservatoryModel } from '../model'

export function ImpactView(props: { model: ObservatoryModel }) {
  const m = props.model
  const ranked = impactRows(m)
  const maxReach = Math.max(1, ...ranked.map((r) => r.reach))
  const inLoop = m.cycleNodes.size

  const stats: { label: string; value: string; variant: 'plain' | 'accent' | 'danger' | 'ok' }[] = [
    { label: 'PACKAGES', value: String(m.report.stats.internal), variant: 'plain' },
    { label: 'DEEPEST CHAIN', value: String(m.report.stats.depth), variant: 'plain' },
    { label: 'MOST DEPENDED ON', value: String(ranked[0]?.reach ?? 0), variant: 'accent' },
    { label: 'IN A LOOP', value: String(inLoop), variant: inLoop ? 'danger' : 'ok' },
  ]

  return (
    <C.Article data-testid="impact-view">
      <C.Eyebrow>{`04 · impact · ${ranked.length} packages ranked by reach`}</C.Eyebrow>
      <C.H1>Blast radius, counted not guessed.</C.H1>
      <C.Lead>
        How many packages break if this one breaks — transitive dependents, measured across the whole runtime graph.
        Sorted by reach.
      </C.Lead>
      <C.StatGrid>
        {stats.map((s) => (
          <C.StatCard>
            <C.StatLabel>{s.label}</C.StatLabel>
            <C.StatValue variant={s.variant}>{s.value}</C.StatValue>
          </C.StatCard>
        ))}
      </C.StatGrid>
      {ranked.map((r, i) => (
        <C.ImpactRow
          data-testid={`impact-${r.node.id}`}
          state={() => (m.selId() === r.node.id ? 'active' : 'idle')}
          onClick={() => m.select(r.node.id)}
        >
          <C.ImpactRank>{String(i + 1).padStart(2, '0')}</C.ImpactRank>
          <C.ImpactName>{r.node.id}</C.ImpactName>
          <C.ImpactTrack>
            <C.ImpactFill
              variant={m.cycleNodes.has(r.node.id) ? 'danger' : 'accent'}
              css={`width:${Math.round((r.reach / maxReach) * 100)}%;`}
            />
          </C.ImpactTrack>
          <C.ImpactCount>{`${r.reach} dependents`}</C.ImpactCount>
        </C.ImpactRow>
      ))}
    </C.Article>
  )
}
