/**
 * The Reactivity panel — reactive coverage for the selected component.
 *
 * This is the first panel registered THROUGH the seam rather than moved into
 * it, so it doubles as proof the registry works for a plugin-supplied panel.
 *
 * What it answers: after you have poked at a component, which of its reactive
 * edges never fired? Line coverage cannot answer that — a mounted effect that
 * never re-ran is 100% covered by every line-coverage tool, and it is precisely
 * the "UI doesn't update" bug.
 *
 * It renders in the existing a11y chrome vocabulary (summary stats + icon rows)
 * on purpose: a second visual language for a second verdict list would be new
 * styled components with no new meaning.
 */
import { Show } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import type { ReactiveCoverageReport } from '@pyreon/reactivity/coverage'
import * as C from '../chrome'
import type { WorkbenchModel } from '../model'
import { registerAddonPanel } from '../panels'
import {
  type CoverageRow,
  coverageRows,
  coverageSummary,
  createCoverageSession,
  isCoverageAvailable,
} from '../reactive-coverage'

/** Icon per reason — mirrors the a11y panel's status glyphs. */
const ICON: Record<CoverageRow['reason'], string> = {
  covered: '✓',
  'never-changed': '○',
  'ran-once': '!',
  'never-ran': '×',
}

/** `ran-once` is the finding with teeth, so it reads as a warning, not a note. */
const STATE: Record<CoverageRow['reason'], 'ok' | 'warn' | 'danger' | 'unknown'> = {
  covered: 'ok',
  'never-changed': 'unknown',
  'ran-once': 'warn',
  'never-ran': 'danger',
}

export function registerReactiveCoveragePanel(): void {
  registerAddonPanel({
    id: 'reactivity',
    title: 'Reactivity',
    hint: 'Which reactive edges never fired',
    render: (model) => {
      const m = model as WorkbenchModel
      const session = createCoverageSession()
      const report = signal<ReactiveCoverageReport | null>(null)
      const recording = signal(false)

      const refresh = () => report.set(session.sample())

      const start = () => {
        session.start()
        recording.set(true)
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

      const summary = () => {
        const r = report()
        return r ? coverageSummary(r) : null
      }
      const rows = () => {
        const r = report()
        return r ? coverageRows(r) : []
      }

      return (
        <>
          <C.ActionsHead>
            <C.ActionsHint>
              {() =>
                recording()
                  ? 'Recording — interact with the preview, then Stop.'
                  : 'Record, interact with the preview, then Stop to see which reactive edges never fired.'
              }
            </C.ActionsHint>
            <C.ClearBtn
              data-testid="coverage-toggle"
              onClick={() => (recording() ? stop() : start())}
            >
              {() => (recording() ? 'Stop' : 'Record')}
            </C.ClearBtn>
          </C.ActionsHead>

          {/*
            Not available ≠ nothing to report. A production workbench has no
            reactive registry at all, and saying "100%" there would be a
            fabricated pass — the exact class the verify verdict was fixed for.
          */}
          <Show when={() => !available}>
            <C.ActionsEmpty data-testid="coverage-unavailable">
              Reactive coverage needs a development build — the reactive registry
              is tree-shaken in production, so there is nothing to measure.
            </C.ActionsEmpty>
          </Show>

          <Show when={() => available && report() === null}>
            <C.ActionsEmpty>No recording yet — press Record.</C.ActionsEmpty>
          </Show>

          <Show when={() => available && report() !== null}>
            <>
              <C.A11ySummary data-testid="coverage-summary">
                <C.A11yStat>
                  <C.A11yDot state="ok" />
                  {() => `${summary()?.percent ?? 0}% covered`}
                </C.A11yStat>
                <C.A11yStat>
                  <C.A11yDot state="warn" />
                  {() => `${summary()?.ranOnce ?? 0} ran once`}
                </C.A11yStat>
                <C.A11yStat>
                  <C.A11yDot state="unknown" />
                  {() => `${summary()?.neverChanged ?? 0} never changed`}
                </C.A11yStat>
                <C.A11yStat>
                  <C.A11yDot state="ok" />
                  {() => `${summary()?.covered ?? 0}/${summary()?.total ?? 0} nodes`}
                </C.A11yStat>
              </C.A11ySummary>

              <Show when={() => rows().length === 0}>
                <C.ActionsEmpty>
                  Every reactive edge fired. Nothing untested in this session.
                </C.ActionsEmpty>
              </Show>

              {() =>
                rows().map((row) => (
                  <C.A11yRow data-testid="coverage-row">
                    <C.A11yIcon state={STATE[row.reason]}>{ICON[row.reason]}</C.A11yIcon>
                    <C.A11yBody>
                      <C.A11yTitle>{`${row.kind} · ${row.name}`}</C.A11yTitle>
                      <C.A11yNote>{row.where ? `${row.explain} — ${row.where}` : row.explain}</C.A11yNote>
                    </C.A11yBody>
                  </C.A11yRow>
                ))
              }
            </>
          </Show>

          {/* Selecting another component makes the previous reading stale. */}
          {() => {
            void m.selId()
            return null
          }}
        </>
      )
    },
  })
}
