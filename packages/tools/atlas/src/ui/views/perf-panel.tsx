/**
 * The Perf panel — what the framework DID during an interaction.
 *
 * A timing number says something got slower. A counter says WHAT happened:
 * "this interaction resolved 22 styles and mounted 40 components" is a
 * diagnosis. It is the signal the rocketstyle-collapse work moved
 * (`styler.resolve` 22 → 0), and a regression there is invisible to wall-clock
 * on a fast machine while being obvious here.
 *
 * Registered through the panel seam, like the Reactivity and Why panels.
 */
import { Show } from '@pyreon/core'
import { batch, signal } from '@pyreon/reactivity'
import * as C from '../chrome'
import type { WorkbenchModel } from '../model'
import { registerAddonPanel } from '../panels'
import {
  areCountersAvailable,
  type CounterRow,
  counterDelta,
  installCounterSink,
  resetCounters,
  snapshotCounters,
  uninstallCounterSink,
} from '../perf-counters'

export function registerPerfPanel(): void {
  registerAddonPanel({
    id: 'perf',
    title: 'Perf',
    hint: 'Framework work done per interaction (counters, not timings)',
    render: (model) => {
      const m = model as WorkbenchModel
      const rows = signal<CounterRow[] | null>(null)
      const recording = signal(false)
      let before: Record<string, number> = {}

      const start = () => {
        installCounterSink()
        resetCounters()
        before = snapshotCounters()
        batch(() => {
          recording.set(true)
          rows.set(null)
        })
      }

      const stop = () => {
        const after = snapshotCounters()
        // Uninstall AFTER snapshotting — the other order drops whatever the
        // final render emitted, which is usually the interesting part.
        uninstallCounterSink()
        batch(() => {
          rows.set(counterDelta(before, after))
          recording.set(false)
        })
      }

      const available = areCountersAvailable()

      return (
        <>
          <C.ActionsHead>
            <C.ActionsHint>
              {() =>
                recording()
                  ? 'Recording — interact with the preview, then Stop.'
                  : 'Record, interact with the preview, then Stop to see the framework work it caused.'
              }
            </C.ActionsHint>
            <C.ClearBtn data-testid="perf-toggle" onClick={() => (recording() ? stop() : start())}>
              {() => (recording() ? 'Stop' : 'Record')}
            </C.ClearBtn>
          </C.ActionsHead>

          {/* Counters are dev-gated at every emit site, so a production build
              records nothing — and zero rows there means "not measurable",
              not "this interaction was free". */}
          <Show when={() => !available}>
            <C.ActionsEmpty data-testid="perf-unavailable">
              Counters need a development build — every emit site is behind a
              production gate, so there is nothing to collect.
            </C.ActionsEmpty>
          </Show>

          <Show when={() => available && rows() === null}>
            <C.ActionsEmpty>No recording yet — press Record.</C.ActionsEmpty>
          </Show>

          <Show when={() => available && rows() !== null && (rows() ?? []).length === 0}>
            <C.ActionsEmpty data-testid="perf-empty">
              No counters fired. Either nothing re-rendered, or the work happened
              outside an instrumented path.
            </C.ActionsEmpty>
          </Show>

          <Show when={() => available && (rows() ?? []).length > 0}>
            <>
              <C.A11ySummary data-testid="perf-summary">
                <C.A11yStat>
                  <C.A11yDot state="ok" />
                  {() => `${(rows() ?? []).length} counter(s) fired`}
                </C.A11yStat>
                <C.A11yStat>
                  <C.A11yDot state="warn" />
                  {() => `${(rows() ?? []).reduce((n, r) => n + r.delta, 0)} total operations`}
                </C.A11yStat>
              </C.A11ySummary>
              {() =>
                (rows() ?? []).map((row) => (
                  <C.A11yRow data-testid="perf-row">
                    <C.A11yIcon state="ok">{String(row.delta)}</C.A11yIcon>
                    <C.A11yBody>
                      <C.A11yTitle>{row.name}</C.A11yTitle>
                      <C.A11yNote>during this interaction</C.A11yNote>
                    </C.A11yBody>
                  </C.A11yRow>
                ))
              }
            </>
          </Show>

          {() => {
            void m.selId()
            return null
          }}
        </>
      )
    },
  })
}
