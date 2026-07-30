/**
 * Adjacency matrix — rows depend on columns; back-edges inside a cycle render
 * red when cycle-highlighting is on. Internal packages only (an external
 * column can never depend on anything, so the interesting quadrant is the
 * internal×internal block — the design's "scope prefix stripped" note).
 */
import * as C from '../chrome'
import { shortName, type ObservatoryModel } from '../model'
import type { LoomTokens } from '../theme'

export function MatrixView(props: { model: ObservatoryModel; theme: () => LoomTokens }) {
  const m = props.model

  return (
    <C.MatrixPad data-testid="matrix-view">
      <C.MatrixNote>
        {`rows depend on columns · ${m.report.stats.edges} edges · red cells are cycle back-edges · scope prefix stripped`}
      </C.MatrixNote>
      {() => {
        const t = props.theme()
        const ids = m
          .shown()
          .filter((n) => n.kind === 'internal')
          .map((n) => n.id)
        const sel = m.selId()
        const cell = 15
        const label = 84
        const rowLabel = 110
        const depthOf = (id: string) => m.byId.get(id)?.depth ?? 0
        const depsOf = (id: string) => new Set(m.byId.get(id)?.deps ?? [])

        const head = ids.map((id) => (
          <div style={`width:${cell}px;height:${label}px;display:flex;align-items:flex-end;justify-content:center`}>
            <span
              style={`font-family:'JetBrains Mono',monospace;font-size:9px;color:${id === sel ? t.accent : t.faint};writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap`}
            >
              {shortName(id)}
            </span>
          </div>
        ))

        const rows = ids.map((r) => {
          const deps = depsOf(r)
          const cells = ids.map((c) => {
            const has = deps.has(c)
            const back = has && depthOf(c) <= depthOf(r) && m.cycleNodes.has(r) && m.cycleNodes.has(c)
            const onSel = r === sel || c === sel
            const bg = !has
              ? 'transparent'
              : back && m.showCycles()
                ? t.danger
                : t.accent
            // A real <button> per edge cell: keyboard-reachable + the a11y
            // rules' point, not just their letter. Empty cells stay inert divs.
            if (!has) {
              return (
                <div style={`width:${cell}px;height:${cell}px;display:flex;align-items:center;justify-content:center`}>
                  <div style={`width:3px;height:3px;border-radius:50%;background:${t.border};opacity:.6`}></div>
                </div>
              )
            }
            return (
              <button
                type="button"
                title={`${r} → ${c}`}
                aria-label={`${r} depends on ${c}`}
                onClick={() => m.select(c)}
                style={`width:${cell}px;height:${cell}px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:none;background:transparent;padding:0`}
              >
                <div
                  style={`width:12px;height:12px;border-radius:3px;background:${bg};opacity:${onSel || !sel ? 1 : 0.55};transition:opacity .15s`}
                ></div>
              </button>
            )
          })
          return (
            <div style="display:flex;align-items:center">
              <button
                type="button"
                onClick={() => m.select(r)}
                style={`width:${rowLabel}px;text-align:right;padding:0 10px 0 0;font-family:'JetBrains Mono',monospace;font-size:10px;color:${r === sel ? t.accent : t.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;border:none;background:transparent`}
              >
                {shortName(r)}
              </button>
              {cells}
            </div>
          )
        })

        return (
          <div style="display:inline-block">
            <div style="display:flex">
              <div style={`width:${rowLabel}px`}></div>
              {head}
            </div>
            <div>{rows}</div>
          </div>
        )
      }}
    </C.MatrixPad>
  )
}
