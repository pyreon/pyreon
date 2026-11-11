/**
 * The Reactive coverage panel — every DOM binding of the selected component,
 * by name, and whether it ever updated.
 *
 * What it answers: after you have poked at a component, which of its
 * bindings never re-ran? Line coverage cannot answer that — a binding that
 * rendered once is 100% covered by every line-coverage tool, and a binding
 * that never re-runs is precisely the "UI doesn't update" bug.
 *
 * A row is `aria-busy ← loading`: what the binding writes, and the control
 * values or signals it reads. Fires count updates AFTER the binding's first
 * run (its mount), summed over every mount of it in the recording. The bar
 * and the list read from the same rows, so they cannot disagree.
 *
 * Recording re-mounts the preview: a coverage session counts only nodes
 * created inside it, so the component already on screen would otherwise be
 * invisible to it. Control edits then update the mounted component in place
 * (see ../../live-args), which is what makes a binding's fire countable.
 */
import { onUnmount, Show } from '@pyreon/core'
import { computeReactiveCoverage, type ReactiveCoverageReport } from '@pyreon/reactivity/coverage'
import { batch, effect, getReactiveGraph, isReactiveDevtoolsActive, signal, untrack } from '@pyreon/reactivity'
import * as C from '../../components'
import { createInsightSession, type InsightRow, insightSummary } from '../../graph-insights'
import type { WorkbenchModel } from '../../model'
import type { AddonPanelRender } from '../../panels'
import {
  type BindingRow,
  type BindingStatus,
  bindingRows,
  bindingSummary,
  componentNodes,
} from '../../binding-rows'
import {
  type CoverageRow,
  coverageRows,
  createCoverageSession,
  isCoverageAvailable,
} from '../../reactive-coverage'

/**
 * Status as a SHAPE and a word, not a colour alone: ✓ fired, ○ never fired
 * (hollow — nothing happened), ↻ rebuilt by a re-mount instead of updated.
 */
const STATUS: Record<BindingStatus, { glyph: string; word: string; state: 'ok' | 'danger' | 'warn' }> = {
  covered: { glyph: '✓', word: 'covered', state: 'ok' },
  never: { glyph: '○', word: 'never fired', state: 'danger' },
  rebuilt: { glyph: '↻', word: 'rebuilt', state: 'warn' },
}

const GROUP: Record<BindingStatus, string> = {
  never: 'Never fired',
  rebuilt: 'Rebuilt, never updated in place',
  covered: 'Fired',
}

/** Icon per reason for the secondary node list — mirrors the a11y panel's glyphs. */
const ICON: Record<CoverageRow['reason'], string> = {
  covered: '✓',
  'never-changed': '○',
  'ran-once': '!',
  'never-ran': '×',
}
const NODE_STATE: Record<CoverageRow['reason'], 'ok' | 'warn' | 'danger' | 'unknown'> = {
  covered: 'ok',
  'never-changed': 'unknown',
  'ran-once': 'warn',
  'never-ran': 'danger',
}

/**
 * Re-samples while it is mounted: on every settled preview render (a binding
 * that fired changed the DOM) and on a component switch. A component, not a
 * build-time `effect()`, because the shell re-mounts a kept panel body on a
 * tab switch — an effect created at build time would be disposed by the
 * first switch, and this one is re-created with the body.
 */
function LiveRefresh(props: { model: WorkbenchModel; refresh: () => void }): null {
  const e = effect(() => {
    props.model.renderTick()
    props.model.previewMounts()
    props.model.selId()
    untrack(props.refresh)
  })
  onUnmount(() => e.dispose())
  return null
}

/** The panel body — loaded on first open (see ./lazy). */
export const render: AddonPanelRender = (model) => {
  const m = model as WorkbenchModel
  const session = createCoverageSession()
  const shape = createInsightSession()
  const rows = signal<BindingRow[] | null>(null)
  const others = signal<ReactiveCoverageReport | null>(null)
  const insights = signal<InsightRow[]>([])
  const recording = signal(false)
  // The preview has mounted inside this recording (a scope exists).
  const mounted = signal(false)
  // Something else deactivated the reactive graph mid-recording.
  const interrupted = signal(false)

  const refresh = () => {
    if (!recording.peek()) return
    if (!isReactiveDevtoolsActive()) {
      interrupted.set(true)
      return
    }
    const graph = getReactiveGraph()
    const scope = m.previewScope()
    const controls = m.sel()?.controls ?? []
    const members = componentNodes(graph, scope)
    batch(() => {
      mounted.set(scope.mounts.length > 0)
      rows.set(bindingRows(graph, scope, controls))
      // Everything else the component created — derived values, plain
      // effects, its own signals — scored the node-level way, for the reader
      // who wants it. The live control values are the workbench's, not the
      // component's, so they are left out.
      others.set(
        computeReactiveCoverage(
          graph.nodes.filter((n) => members.has(n.id) && n.binding === undefined && !scope.props.has(n.id)),
        ),
      )
      insights.set(shape.sample(members))
    })
    paint()
  }

  const start = () => {
    session.start()
    interrupted.set(false)
    recording.set(true)
    // Re-mount AFTER the session began, so the component's nodes are inside it.
    m.restartPreview()
    refresh()
  }
  const stop = () => {
    refresh() // sample BEFORE ending the session, or the session's data is gone
    session.stop()
    recording.set(false)
  }

  // Read once per render: a production build tree-shakes the reactive
  // registry, and an empty graph would otherwise compute as a perfect 100%.
  const available = isCoverageAvailable()

  const summary = () => bindingSummary(rows() ?? [])

  // The bar's fill width is a measurement, written onto the element (see
  // CovFill): when the bar mounts, and on every new sample while it is mounted.
  let fill: HTMLElement | null = null
  const fillRef = (el: HTMLElement | null) => {
    fill = el
    paint()
  }
  const paint = () => {
    const pct = summary().percent ?? 0
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, pct))}%`
  }

  const firstOpen = () => (rows() ?? []).find((r) => r.status !== 'covered')
  const groups = () => {
    const list = rows() ?? []
    return (['never', 'rebuilt', 'covered'] as const)
      .map((status) => ({ status, items: list.filter((r) => r.status === status) }))
      .filter((g) => g.items.length > 0)
  }
  const otherRows = () => {
    const r = others()
    return r ? coverageRows(r) : []
  }

  return (
    <>
      {/* No Record in a production build: there is nothing it could record. */}
      <Show when={() => available}>
      <C.ActionsHead>
        <C.ActionsHint>
          {() =>
            recording()
              ? 'Recording — change controls and use the preview; the list updates as bindings fire. Stop to freeze it.'
              : 'Record re-mounts the preview, then counts every update of each of its bindings until you stop.'
          }
        </C.ActionsHint>
        <C.ClearBtn
          data-testid="coverage-toggle"
          aria-pressed={() => (recording() ? 'true' : 'false')}
          onClick={() => (recording() ? stop() : start())}
        >
          {() => (recording() ? 'Stop' : 'Record')}
        </C.ClearBtn>
      </C.ActionsHead>
      </Show>

      {/*
        Not available ≠ nothing to report. A production workbench has no
        reactive registry at all, and saying "100%" there would be a
        fabricated pass.
      */}
      <Show when={() => !available}>
        <C.ActionsEmpty data-testid="coverage-unavailable">
          Reactive coverage needs a development build. The reactive graph is
          removed from production builds, so there is nothing to measure here.
          Run atlas dev to record this component.
        </C.ActionsEmpty>
      </Show>

      <Show when={() => available && rows() === null}>
        <C.ActionsEmpty data-testid="coverage-idle">
          No recording yet — press Record, then change controls and use the preview.
        </C.ActionsEmpty>
      </Show>

      <Show when={() => available && recording() && interrupted()}>
        <C.Callout state="danger" role="alert" data-testid="coverage-interrupted">
          The recording stopped counting: another tool switched the reactive
          graph off. Press Stop, then Record again.
        </C.Callout>
      </Show>

      <Show when={() => available && rows() !== null && !mounted()}>
        <C.ActionsEmpty data-testid="coverage-no-mount">
          Waiting for the preview to mount in this recording — its bindings
          are counted from their first run. If the component is not on
          screen, open the Canvas view.
        </C.ActionsEmpty>
      </Show>

      <Show when={() => available && mounted() && rows() !== null && summary().total === 0}>
        <C.ActionsEmpty data-testid="coverage-no-bindings">
          This component has no live bindings: everything it rendered was read
          once, so nothing in it can update. If a value should follow a
          control, read it inside the JSX — Lens shows which reads are static.
        </C.ActionsEmpty>
      </Show>

      {/* Live re-sampling while the panel is open and recording. */}
      <Show when={recording}>
        <LiveRefresh model={m} refresh={refresh} />
      </Show>

      <Show when={() => available && summary().total > 0}>
        <>
          <C.CovHead data-testid="coverage-head">
            {/* Decorative: the number beside it and the caption say it in text. */}
            <C.CovBar aria-hidden="true" data-testid="coverage-bar">
              <C.CovFill ref={fillRef} data-testid="coverage-fill" />
            </C.CovBar>
            <C.CovNum data-testid="coverage-percent">{() => `${summary().percent ?? 0}%`}</C.CovNum>
            <C.CovCaption data-testid="coverage-summary">
              {() => {
                const s = summary()
                const open = [
                  s.never > 0 ? `${s.never} never fired` : '',
                  s.rebuilt > 0 ? `${s.rebuilt} rebuilt by a re-mount` : '',
                ].filter(Boolean)
                return (
                  `${s.covered}/${s.total} of this component's reactive bindings fired during this recording` +
                  (open.length > 0 ? ` (${open.join(', ')})` : '') +
                  ` — a binding's first run is its mount, not an update.`
                )
              }}
            </C.CovCaption>
          </C.CovHead>

          <C.DataTable data-testid="coverage-bindings">
            <table aria-label="Reactive bindings of the selected component, those that never fired first">
              <thead>
                <tr>
                  <th scope="col">binding</th>
                  <th scope="col">kind</th>
                  <th scope="col" data-v="num">fires</th>
                  <th scope="col">status</th>
                </tr>
              </thead>
              {() =>
                groups().map((g) => (
                  <tbody data-testid={`coverage-group-${g.status}`}>
                    <tr>
                      <th scope="rowgroup" colSpan={4}>{`${GROUP[g.status]} · ${g.items.length}`}</th>
                    </tr>
                    {g.items.map((row) => (
                      <tr
                        data-testid="binding-row"
                        data-status={row.status}
                        data-flag={row.status === 'never' ? '' : undefined}
                      >
                        <td data-v="key">
                          <span data-testid="binding-name">{row.name}</span>
                          {row.element ? <C.Chip state="plain">{row.element}</C.Chip> : null}
                          {row.hint ? <small data-testid="binding-hint">{row.hint}</small> : null}
                        </td>
                        <td>{row.kindLabel}</td>
                        <td data-v="num" data-testid="binding-fires">
                          {String(row.fires)}
                        </td>
                        <td data-v="nowrap">
                          <C.Chip state={STATUS[row.status].state} data-testid="binding-status">
                            <span aria-hidden="true">{`${STATUS[row.status].glyph} `}</span>
                            {STATUS[row.status].word}
                          </C.Chip>
                          {row.mounts > 1 ? (
                            <small>{`${row.mounts} mounts`}</small>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))
              }
            </table>
          </C.DataTable>

          {/* The finding with teeth, said in words: the first binding nothing exercised. */}
          {() => {
            const open = firstOpen()
            if (!open) {
              return (
                <C.Callout state="plain" data-testid="coverage-all-fired">
                  Every binding fired at least once in this recording.
                </C.Callout>
              )
            }
            return (
              <C.Callout state="danger" data-testid="coverage-callout">
                <b>{`${open.name} ${open.status === 'rebuilt' ? 'was only ever rebuilt' : 'never updated'}.`}</b>
                {` Line coverage calls it covered: it rendered. ${open.hint}`}
              </C.Callout>
            )
          }}
        </>
      </Show>

      {/*
        Graph SHAPE, distinct from coverage: orphan state, fan-out, deep
        chains — of the component's own nodes only.
      */}
      <Show when={() => available && insights().length > 0}>
        <>
          <C.A11ySummary data-testid="insights-summary">
            <C.A11yStat>
              <C.A11yDot state="warn" />
              {() => insightSummary(insights())}
            </C.A11yStat>
          </C.A11ySummary>
          {() =>
            insights().map((row) => (
              <C.A11yRow data-testid="insight-row">
                <C.A11yIcon state={row.kind === 'orphan-signal' ? 'danger' : 'warn'}>!</C.A11yIcon>
                <C.A11yBody>
                  <C.A11yTitle>{`${row.kind} · ${row.name}`}</C.A11yTitle>
                  <C.A11yNote>{`${row.detail} — ${row.meaning}`}</C.A11yNote>
                </C.A11yBody>
              </C.A11yRow>
            ))
          }
        </>
      </Show>

      {/* The component's other reactive nodes, node-level, for the curious. */}
      <Show when={() => available && otherRows().length > 0}>
        <C.Callout state="plain" data-testid="coverage-others">
          <details>
            <summary>
              {() => {
                const r = others()
                const n = otherRows().length
                return `${n} of the component's ${r?.total ?? 0} other reactive nodes (derived values, effects, signals) never re-ran`
              }}
            </summary>
            {() =>
              otherRows().map((row) => (
                <C.A11yRow data-testid="coverage-row">
                  <C.A11yIcon state={NODE_STATE[row.reason]}>{ICON[row.reason]}</C.A11yIcon>
                  <C.A11yBody>
                    <C.A11yTitle>{`${row.kind} · ${row.name}`}</C.A11yTitle>
                    <C.A11yNote>{row.where ? `${row.explain} — ${row.where}` : row.explain}</C.A11yNote>
                  </C.A11yBody>
                </C.A11yRow>
              ))
            }
          </details>
        </C.Callout>
      </Show>
    </>
  )
}
