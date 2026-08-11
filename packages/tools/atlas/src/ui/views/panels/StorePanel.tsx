/**
 * The Store panel — the writes an interaction actually made, steppable.
 *
 * `@pyreon/store` publishes a MUTATION STREAM: every write announces its store,
 * whether it was a `patch` or a direct set, and the per-key old/new values.
 * Storybook has no equivalent, because React state changes are private to the
 * component that owns them — there is nothing to subscribe to.
 *
 * That stream is what makes this panel possible: record the writes, then STEP
 * BACK through them and see the store as it was at each one. "What actually
 * happened when I clicked" stops being a guess.
 *
 * Recording is explicit (Record / Stop) rather than always-on, for the same
 * reason as the Perf panel: `addStorePlugin` attaches to every store created
 * afterwards, and a workbench that subscribes for the whole session pays for
 * every write on every component whether anyone is looking or not.
 */
import { For, Show } from '@pyreon/core'
import { batch, signal } from '@pyreon/reactivity'
import * as C from '../../components'
import type { WorkbenchModel } from '../../model'
import { registerAddonPanel } from '../../panels'
import {
  describeStep,
  emptyTimeline,
  hotKeys,
  isLive,
  record as recordStep,
  seek,
  stateAt,
  stepBack,
  stepForward,
  type StoreTimeline,
} from '../../store-timeline'
import { installStoreRecorder, isStoreAvailable, uninstallStoreRecorder } from '../../store-bridge'

/** A value rendered for scanning, not for round-tripping. */
function preview(value: unknown): string {
  if (typeof value === 'string') return value.length > 60 ? `${value.slice(0, 60)}…` : value
  if (value === null || value === undefined || typeof value !== 'object') return String(value)
  try {
    const json = JSON.stringify(value)
    return json.length > 60 ? `${json.slice(0, 60)}…` : json
  } catch {
    // A store may legitimately hold something uncloneable (a class instance, a
    // DOM node). Saying so beats an empty cell or a thrown panel.
    return '[unserialisable]'
  }
}

export function registerStorePanel(): void {
  registerAddonPanel({
    id: 'store',
    title: 'Store',
    hint: 'Writes this interaction made, steppable — @pyreon/store only',
    render: (model) => {
      void (model as WorkbenchModel)
      const timeline = signal<StoreTimeline>(emptyTimeline())
      const recording = signal(false)

      const start = () => {
        // Cleared on START, not on stop: the previous recording stays readable
        // until you deliberately begin a new one.
        batch(() => {
          timeline.set(emptyTimeline())
          recording.set(true)
        })
        installStoreRecorder((mutation, state) => {
          timeline.set(
            recordStep(timeline.peek(), {
              storeId: mutation.storeId,
              type: mutation.type,
              changes: mutation.events.map((e) => ({
                key: e.key,
                oldValue: e.oldValue,
                newValue: e.newValue,
              })),
              state: { ...state },
            }),
          )
        })
      }

      const stop = () => {
        uninstallStoreRecorder()
        recording.set(false)
      }

      const available = isStoreAvailable()

      return (
        <>
          <C.ActionsHead>
            <C.ActionsHint>
              {() =>
                recording()
                  ? 'Recording — interact with the preview, then Stop to step through the writes.'
                  : 'Record, interact with the preview, then step back through what changed.'
              }
            </C.ActionsHint>
            <C.ClearBtn data-testid="store-toggle" onClick={() => (recording() ? stop() : start())}>
              {() => (recording() ? 'Stop' : 'Record')}
            </C.ClearBtn>
          </C.ActionsHead>

          {/* A component that uses no store is the common case, not a fault —
              said plainly so an empty panel is not read as a broken one. */}
          <Show when={() => !available}>
            <C.ActionsEmpty data-testid="store-unavailable">
              `@pyreon/store` is not loaded in this workbench, so there are no
              stores to observe. This panel is for components backed by one.
            </C.ActionsEmpty>
          </Show>

          <Show when={() => available && timeline().steps.length === 0}>
            <C.ActionsEmpty data-testid="store-empty">
              {() =>
                recording()
                  ? 'No writes yet — interact with the preview.'
                  : 'No recording yet — press Record.'
              }
            </C.ActionsEmpty>
          </Show>

          <Show when={() => timeline().steps.length > 0}>
            <C.ActionsHead>
              <C.ActionsHint data-testid="store-position">
                {() =>
                  `step ${timeline().cursor + 1} of ${timeline().steps.length}` +
                  (isLive(timeline()) ? ' (live)' : ' — stepped back')
                }
              </C.ActionsHint>
              <C.ClearBtn
                data-testid="store-back"
                onClick={() => timeline.set(stepBack(timeline.peek()))}
              >
                ‹ Back
              </C.ClearBtn>
              <C.ClearBtn
                data-testid="store-forward"
                onClick={() => timeline.set(stepForward(timeline.peek()))}
              >
                Forward ›
              </C.ClearBtn>
            </C.ActionsHead>

            {/* The steps, newest last — clicking one jumps to it. */}
            <C.PropsTable data-testid="store-steps">
              <For each={() => [...timeline().steps]} by={(s) => s.index}>
                {(step) => (
                  <C.PropsRow
                    data-atlas-selected={() =>
                      step.index === timeline().cursor ? 'true' : 'false'
                    }
                    onClick={() => timeline.set(seek(timeline.peek(), step.index))}
                  >
                    <C.PropName>{() => `#${step.index + 1}`}</C.PropName>
                    <C.PropKind>{() => describeStep(step)}</C.PropKind>
                    <C.PropDef>
                      {() => step.changes.map((c) => preview(c.newValue)).join(', ')}
                    </C.PropDef>
                  </C.PropsRow>
                )}
              </For>
            </C.PropsTable>

            {/* The store AS OF the selected step — the point of stepping back. */}
            <C.DocsH2>State at this step</C.DocsH2>
            <C.PropsTable data-testid="store-state">
              <For each={() => Object.entries(stateAt(timeline()) ?? {})} by={(e) => e[0]}>
                {(entry) => (
                  <C.PropsRow>
                    <C.PropName>{() => entry[0]}</C.PropName>
                    <C.PropDef>{() => preview(entry[1])}</C.PropDef>
                  </C.PropsRow>
                )}
              </For>
            </C.PropsTable>

            <Show when={() => hotKeys(timeline()).length > 0}>
              <C.DocsH2>Written more than once</C.DocsH2>
              <C.ActionsHint>
                A key written repeatedly in one interaction is a loop or a chain
                of dependent writes. Both are worth seeing; neither is
                automatically wrong.
              </C.ActionsHint>
              <C.PropsTable data-testid="store-hot">
                <For each={() => hotKeys(timeline())} by={(k) => k.key}>
                  {(hot) => (
                    <C.PropsRow>
                      <C.PropName>{() => hot.key}</C.PropName>
                      <C.PropDef>{() => `${hot.writes} writes`}</C.PropDef>
                    </C.PropsRow>
                  )}
                </For>
              </C.PropsTable>
            </Show>
          </Show>
        </>
      )
    },
  })
}
