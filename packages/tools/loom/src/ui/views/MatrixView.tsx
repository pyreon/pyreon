/**
 * Adjacency matrix — rows depend on columns; back-edges inside a cycle render
 * red when cycle-highlighting is on. Internal packages only (an external
 * column can never depend on anything, so the interesting quadrant is the
 * internal×internal block — the design's "scope prefix stripped" note).
 *
 * Cell geometry (16px cells, 96px label band, 112px row labels) lives on the
 * chrome components; this view only maps data onto them.
 */
import * as C from '../chrome'
import { shortName, type ObservatoryModel } from '../model'

export function MatrixView(props: { model: ObservatoryModel }) {
  const m = props.model

  return (
    <C.MatrixPad data-testid="matrix-view">
      <C.MatrixNote>
        {`rows depend on columns · ${m.report.stats.edges} edges · red cells are cycle back-edges · scope prefix stripped`}
      </C.MatrixNote>
      {() => {
        const ids = m
          .shown()
          .filter((n) => n.kind === 'internal')
          .map((n) => n.id)
        const sel = m.selId()
        const depthOf = (id: string) => m.byId.get(id)?.depth ?? 0
        const depsOf = (id: string) => new Set(m.byId.get(id)?.deps ?? [])

        const head = ids.map((id) => {
          const full = shortName(id)
          // The rotated labels are nowrap in a fixed-height band — untruncated
          // long ids overflowed upward straight through the view's eyebrow
          // line. Clip to the band and truncate; the full id stays hoverable.
          const name = full.length > 14 ? `${full.slice(0, 13)}…` : full
          return (
            <C.MatrixColHead title={id}>
              <C.MatrixColLabel state={id === sel ? 'active' : 'idle'}>{name}</C.MatrixColLabel>
            </C.MatrixColHead>
          )
        })

        const rows = ids.map((r) => {
          const rowName = shortName(r)
          const deps = depsOf(r)
          const cells = ids.map((c) => {
            const has = deps.has(c)
            const back = has && depthOf(c) <= depthOf(r) && m.cycleNodes.has(r) && m.cycleNodes.has(c)
            const onSel = r === sel || c === sel
            // A real <button> per edge cell: keyboard-reachable + the a11y
            // rules' point, not just their letter. Empty cells stay inert divs.
            if (!has) {
              return <C.MatrixBlank>{r === c ? <C.MatrixDiag /> : null}</C.MatrixBlank>
            }
            return (
              <C.MatrixCellBtn
                title={`${r} → ${c}`}
                aria-label={`${r} depends on ${c}`}
                onClick={() => m.select(c)}
              >
                <C.MatrixCellDot
                  variant={back && m.showCycles() ? 'back' : 'dep'}
                  state={onSel || !sel ? 'lit' : 'dim'}
                />
              </C.MatrixCellBtn>
            )
          })
          return (
            <C.MatrixRow>
              <C.MatrixRowLabel state={r === sel ? 'active' : 'idle'} onClick={() => m.select(r)}>
                {rowName}
              </C.MatrixRowLabel>
              {cells}
            </C.MatrixRow>
          )
        })

        return (
          <div>
            <C.MatrixHeadRow>
              <C.MatrixCorner />
              {head}
            </C.MatrixHeadRow>
            <div>{rows}</div>
          </div>
        )
      }}
    </C.MatrixPad>
  )
}
