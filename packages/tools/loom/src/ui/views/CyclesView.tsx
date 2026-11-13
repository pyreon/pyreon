/**
 * Cycles — every runtime loop as a card: the ring of packages (clickable,
 * closing back on its origin) and how to open it. A workspace with no loop
 * gets the same card shape in the ok tone, saying what was checked.
 */
import * as C from '../chrome'
import type { ObservatoryModel } from '../model'

export function CyclesView(props: { model: ObservatoryModel }) {
  const m = props.model
  const cycles = m.report.graph.cycles

  if (cycles.length === 0) {
    return (
      <C.Article data-testid="cycles-view">
        <C.Card variant="ok" data-testid="cycles-clean">
          <C.CardHead>
            <span class="lm-sev lm-sev--ok" aria-hidden="true" />
            {`no runtime cycles · ${m.report.stats.internal} packages · ${m.report.stats.edges} edges checked`}
            <C.CardSev variant="ok">clean</C.CardSev>
          </C.CardHead>
          <C.CardText>
            Every import chain terminates, so the packages layer and initialise in dependency
            order. Runtime imports only — dev edges are excluded because shared test utilities
            legitimately cycle.
          </C.CardText>
        </C.Card>
      </C.Article>
    )
  }

  return (
    <C.Article data-testid="cycles-view">
      {cycles.map((loop, i) => (
        <C.Card variant="error" data-testid={`cycle-${i}`}>
          <C.CardHead>
            <span class="lm-sev lm-sev--error" aria-hidden="true" />
            {`cycle · ${loop.length} package${loop.length === 1 ? '' : 's'}`}
            <C.CardSev variant="error">error</C.CardSev>
          </C.CardHead>
          <div class="lm-ring">
            {[...loop, loop[0]!].map((id, j) => (
              <>
                {j > 0 ? <i aria-hidden="true">→</i> : null}
                <button
                  type="button"
                  class="lm-chip lm-chip--cyc"
                  title={id}
                  aria-label={j === loop.length ? `${id} (back to the start)` : id}
                  onClick={() => m.select(id)}
                >
                  {id}
                </button>
              </>
            ))}
          </div>
          <C.CardText>
            {`Runtime imports only — dev edges are excluded because shared test utilities legitimately cycle. Open the loop at one edge: move what ${loop[0]} and ${loop[1] ?? loop[0]} share into a leaf package, or invert the import with a registration seam (the type and the slot live in the lower package; the higher one registers at load).`}
          </C.CardText>
        </C.Card>
      ))}
    </C.Article>
  )
}
