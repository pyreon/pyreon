/**
 * The "Why?" panel — pick a reactive node, see the exact chain that updated it.
 *
 * The inverse of React DevTools' "why did this render?": that answer stops at
 * the component, because in React the component IS the unit of update. Here the
 * unit is a signal, so the answer can name it — and the chain between it and
 * what you are looking at.
 *
 * Like the Reactivity panel, this registers through the panel seam rather than
 * being a built-in, and renders in the existing a11y chrome vocabulary so a
 * second verdict list does not need a second visual language.
 */
import { Show } from '@pyreon/core'
import { batch, signal } from '@pyreon/reactivity'
import * as C from '../../components'
import type { WorkbenchModel } from '../../model'
import { registerAddonPanel } from '../../panels'
import { isCoverageAvailable } from '../../reactive-coverage'
import {
  type CauseCandidate,
  type CauseStep,
  causeSteps,
  causeSummary,
  explain,
  recentCandidates,
} from '../../update-cause'

const ICON: Record<CauseStep['kind'], string> = {
  signal: '◆',
  derived: '∑',
  effect: '⚡',
}

export function registerUpdateCausePanel(): void {
  registerAddonPanel({
    id: 'why',
    title: 'Why?',
    hint: 'The exact signal → computed → effect chain behind an update',
    render: (model) => {
      const m = model as WorkbenchModel
      const candidates = signal<CauseCandidate[]>([])
      const steps = signal<CauseStep[] | null>(null)
      const summary = signal('')
      const picked = signal<number | null>(null)

      // Reading the graph is what activates tracking, so refreshing the
      // candidate list is also what makes subsequent causes reconstructable.
      // Batched: three writes that describe ONE answer. Unbatched, a subscriber
      // reading both `steps` and `summary` observes a torn intermediate state
      // (new steps beside the previous summary) between the writes.
      const refresh = () => {
        batch(() => {
          candidates.set(recentCandidates())
          const id = picked()
          if (id === null) return
          const cause = explain(id)
          if (!cause) {
            steps.set([])
            summary.set('Nothing recorded for that node yet — interact with the preview first.')
            return
          }
          steps.set(causeSteps(cause))
          summary.set(causeSummary(cause))
        })
      }

      const pick = (id: number) => {
        picked.set(id)
        refresh()
      }

      const available = isCoverageAvailable()

      return (
        <>
          <C.ActionsHead>
            <C.ActionsHint>
              Interact with the preview, press Refresh, then pick a node to see what
              updated it.
            </C.ActionsHint>
            <C.ClearBtn data-testid="why-refresh" onClick={refresh}>
              Refresh
            </C.ClearBtn>
          </C.ActionsHead>

          {/* Same reasoning as the coverage panel: the reactive registry is
              tree-shaken in production, and an empty answer there would read as
              "nothing caused this" rather than "this cannot be measured". */}
          <Show when={() => !available}>
            <C.ActionsEmpty data-testid="why-unavailable">
              Causal chains need a development build — the reactive registry is
              tree-shaken in production.
            </C.ActionsEmpty>
          </Show>

          <Show when={() => available && candidates().length === 0}>
            <C.ActionsEmpty>
              No reactive activity recorded yet — interact with the preview, then
              press Refresh.
            </C.ActionsEmpty>
          </Show>

          <Show when={() => available && candidates().length > 0}>
            <>
              <C.CtrlRow>
                <C.CtrlHead>
                  <C.CtrlLabel>Recently updated</C.CtrlLabel>
                  <C.CtrlType>newest first</C.CtrlType>
                </C.CtrlHead>
                <C.EnumWrap>
                  {() =>
                    candidates().map((c) => (
                      <C.EnumBtn
                        data-testid={`why-node-${c.id}`}
                        state={() => (picked() === c.id ? 'active' : 'idle')}
                        onClick={() => pick(c.id)}
                      >
                        {`${c.name} (${c.fires})`}
                      </C.EnumBtn>
                    ))
                  }
                </C.EnumWrap>
              </C.CtrlRow>

              <Show when={() => summary() !== ''}>
                <C.A11ySummary data-testid="why-summary">
                  <C.A11yStat>
                    <C.A11yDot state="ok" />
                    {() => summary()}
                  </C.A11yStat>
                </C.A11ySummary>
              </Show>

              {() =>
                (steps() ?? []).map((step, i) => (
                  <C.A11yRow data-testid="why-step">
                    <C.A11yIcon state={step.isTarget ? 'warn' : 'ok'}>
                      {ICON[step.kind]}
                    </C.A11yIcon>
                    <C.A11yBody>
                      <C.A11yTitle>
                        {`${i + 1}. ${step.name} ${step.relation}${step.isTarget ? '  ← the node you asked about' : ''}`}
                      </C.A11yTitle>
                      <C.A11yNote>{step.where || step.kind}</C.A11yNote>
                    </C.A11yBody>
                  </C.A11yRow>
                ))
              }
            </>
          </Show>

          {/* Switching components invalidates the previous answer. */}
          {() => {
            void m.selId()
            return null
          }}
        </>
      )
    },
  })
}
