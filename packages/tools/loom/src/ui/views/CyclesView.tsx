/**
 * Cycles view — every runtime loop as a card: the import chain as clickable
 * chips, severity by length, and the standing break-the-loop advice.
 */
import { Show } from '@pyreon/core'
import * as C from '../chrome'
import type { ObservatoryModel } from '../model'

export function CyclesView(props: { model: ObservatoryModel }) {
  const m = props.model
  const cycles = m.report.graph.cycles

  return (
    <C.Article data-testid="cycles-view">
      <C.Eyebrow>{`03 · cycles · ${cycles.length} loops across ${m.cycleNodes.size} packages`}</C.Eyebrow>
      <C.H1>{cycles.length ? 'Loops that resolve back to themselves.' : 'No loops. The graph is acyclic.'}</C.H1>
      <C.Lead>
        Detected by depth-first traversal over the RUNTIME graph (dev edges deliberately excluded — a monorepo
        legitimately shares test utilities both ways). Each loop below is a real import chain that returns to its own
        origin — resolve one edge and the loop opens.
      </C.Lead>
      <Show when={() => cycles.length === 0}>
        <C.EmptyCard data-testid="cycles-clean">
          <C.EmptyGlyph>{'~>'}</C.EmptyGlyph>
          <span>No circular runtime dependencies in this workspace.</span>
        </C.EmptyCard>
      </Show>
      {cycles.map((loop, i) => (
        <C.CycleCard data-testid={`cycle-${i}`}>
          <C.Row css="gap:10px;margin-bottom:14px;">
            <C.CycleTag>{`LOOP ${String(i + 1).padStart(2, '0')}`}</C.CycleTag>
            <C.CycleMeta>{`${loop.length} packages · ${loop.length} edges`}</C.CycleMeta>
            <C.Spacer />
            <C.CycleSev variant={loop.length > 2 ? 'high' : 'medium'}>{loop.length > 2 ? 'high' : 'medium'}</C.CycleSev>
          </C.Row>
          <C.ChipRow css="align-items:center;gap:8px;">
            {loop.map((id, j) => (
              <>
                <C.CycleChip onClick={() => m.select(id)}>{id}</C.CycleChip>
                <C.CycleArrow>{j === loop.length - 1 ? '↺' : '→'}</C.CycleArrow>
              </>
            ))}
          </C.ChipRow>
          <C.CycleAdvice>
            {`Break this loop by extracting the shared surface used by ${loop[0]} and ${loop[1] ?? loop[0]} into a leaf package, or by inverting the import with a registration seam (the type + slot live in the lower package; the higher one registers at load).`}
          </C.CycleAdvice>
        </C.CycleCard>
      ))}
    </C.Article>
  )
}
