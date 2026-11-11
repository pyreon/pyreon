/**
 * Impact — the selected package's blast radius as the design's card (every
 * package that rebuilds, retests or republishes if it changes), then every
 * internal package ranked by that reach in a dense table.
 */
import * as C from '../chrome'
import { impactRows, type ObservatoryModel } from '../model'

const MAX_CHIPS = 120

export function ImpactView(props: { model: ObservatoryModel }) {
  const m = props.model
  const ranked = impactRows(m)
  const maxReach = Math.max(1, ...ranked.map((r) => r.reach))

  return (
    <C.ArticleWide data-testid="impact-view">
      <C.Card variant="plain" data-testid="impact-card">
        {() => {
          const blast = m.blast()
          return (
            <>
              <C.CardTitle>
                {'Blast radius of '}
                <C.Mono data-testid="impact-name">{m.selId()}</C.Mono>
                {` · ${blast.length}`}
              </C.CardTitle>
              <C.CardText>
                Everything that rebuilds, retests or republishes if this package changes —
                transitive dependents over runtime edges.
              </C.CardText>
              <div class="lm-chips" data-testid="impact-blast">
                {blast.length === 0 ? (
                  <C.Note>Nothing in the workspace depends on it.</C.Note>
                ) : (
                  blast.slice(0, MAX_CHIPS).map((id) => (
                    <button type="button" class="lm-chip" title={id} onClick={() => m.select(id)}>
                      {id}
                    </button>
                  ))
                )}
              </div>
              {blast.length > MAX_CHIPS ? (
                <div class="lm-more">{`+ ${blast.length - MAX_CHIPS} more in the ranking below`}</div>
              ) : null}
            </>
          )
        }}
      </C.Card>

      <table class="lm-tbl" data-testid="impact-table">
        <caption class="lm-sr">Internal packages ranked by blast radius</caption>
        <thead>
          <tr>
            <th class="lm-th-rank">#</th>
            <th>package</th>
            <th class="lm-th-bar lm-col-opt">reach</th>
            <th class="lm-th-n lm-num">dependents</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r, i) => (
            <tr
              data-testid={`impact-${r.node.id}`}
              class={() => (m.selId() === r.node.id ? 'lm-tr is-sel' : 'lm-tr')}
            >
              <td>{String(i + 1).padStart(2, '0')}</td>
              <td>
                <button
                  type="button"
                  class="lm-tname"
                  title={r.node.id}
                  onClick={() => m.select(r.node.id)}
                >
                  <span>{r.node.id}</span>
                </button>
              </td>
              <td class="lm-col-opt">
                <span class="lm-bar" aria-hidden="true">
                  <i
                    class={m.cycleNodes.has(r.node.id) ? 'is-cyc' : undefined}
                    style={`width:${Math.round((r.reach / maxReach) * 100)}%`}
                  />
                </span>
              </td>
              <td class="lm-num">{String(r.reach)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </C.ArticleWide>
  )
}
