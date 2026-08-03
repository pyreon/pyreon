/**
 * The Lens panel — the compiler's own live/static verdict, per expression.
 *
 * The leapfrog. Storybook cannot show this because React has no per-expression
 * reactivity decision to show; Pyreon's compiler makes one for every JSX read
 * and this surfaces it beside the component you are looking at.
 *
 * What to look for is `STATIC` where you expected live — a value captured once,
 * which is the UI that silently never updates. Ordinarily you find that by
 * poking the app and noticing nothing happened.
 */
import { Show } from '@pyreon/core'
import { batch, signal } from '@pyreon/reactivity'
import * as C from '../../components'
import {
  fetchLens,
  KIND_LABEL,
  lensSummary,
  type LensLine,
  type LensState,
  relevantLines,
} from '../../lens-client'
import type { WorkbenchModel } from '../../model'
import { registerAddonPanel } from '../../panels'

/** Suspect verdicts read as warnings; everything else is informational. */
const stateFor = (kind: string): 'ok' | 'warn' | 'danger' | 'unknown' => {
  if (kind === 'static-text') return 'danger'
  if (kind === 'footgun') return 'warn'
  if (kind.startsWith('reactive')) return 'ok'
  return 'unknown'
}

export function registerLensPanel(): void {
  registerAddonPanel({
    id: 'lens',
    title: 'Lens',
    hint: "The compiler's live/static verdict for each expression",
    render: (model) => {
      const m = model as WorkbenchModel
      const view = signal<LensState>({ state: 'idle' })
      let lastRequested = ''

      const load = async () => {
        const selected = m.sel()
        // The identity KEY, falling back to the name outside a monorepo. Asking
        // by name in a workspace where two packages export a `Button` is
        // ambiguous, and the node side refuses it rather than analysing
        // whichever it found first.
        const name = selected ? (selected.key ?? selected.name) : undefined
        if (!name) return
        lastRequested = name
        view.set({ state: 'loading' })
        const next = await fetchLens(name)
        // A slow answer for a component the user has since navigated away from
        // must not overwrite the current one (leak class F).
        if (lastRequested !== name) return
        view.set(next)
      }

      const lines = (): LensLine[] => {
        const v = view()
        return v.state === 'ready' ? relevantLines(v.result.lines) : []
      }

      return (
        <>
          <C.ActionsHead>
            <C.ActionsHint>
              {() => {
                const v = view()
                if (v.state === 'ready') return lensSummary(v.result)
                if (v.state === 'loading') return 'Analysing…'
                if (v.state === 'unavailable') return v.reason
                return "Read the compiler's verdict for this component's source."
              }}
            </C.ActionsHint>
            <C.ClearBtn data-testid="lens-analyse" onClick={() => void load()}>
              Analyse
            </C.ClearBtn>
          </C.ActionsHead>

          {/*
            Unavailable is its own state, never an empty verdict. An empty list
            would read as "nothing is static here", which is exactly backwards
            when the truth is that nothing was analysed — the same distinction
            the coverage and perf panels make.
          */}
          <Show when={() => view().state === 'unavailable'}>
            <C.ActionsEmpty data-testid="lens-unavailable">
              The Lens could not run. It needs `atlas dev` (it reads the compiler
              in Node, over the dev channel) and `@pyreon/compiler` installed.
            </C.ActionsEmpty>
          </Show>

          <Show when={() => view().state === 'idle'}>
            <C.ActionsEmpty>Press Analyse to read the verdict for this component.</C.ActionsEmpty>
          </Show>

          <Show when={() => view().state === 'ready' && lines().length === 0}>
            <C.ActionsEmpty data-testid="lens-clean">
              No expression in this component carries a reactivity verdict worth
              showing.
            </C.ActionsEmpty>
          </Show>

          <Show when={() => view().state === 'ready' && lines().length > 0}>
            <>
              {() =>
                lines().map((line) => (
                  <C.A11yRow data-testid="lens-line">
                    <C.A11yIcon state={stateFor(line.findings[0]?.kind ?? 'none')}>
                      {String(line.line)}
                    </C.A11yIcon>
                    <C.A11yBody>
                      <C.A11yTitle>{line.text.trim() || '·'}</C.A11yTitle>
                      <C.A11yNote>
                        {line.findings.length === 0
                          ? 'context'
                          : line.findings
                              .map((f) => `${KIND_LABEL[f.kind] ?? f.kind}: ${f.detail}`)
                              .join('  ·  ')}
                      </C.A11yNote>
                    </C.A11yBody>
                  </C.A11yRow>
                ))
              }
            </>
          </Show>

          {/* Selecting another component invalidates the verdict on screen. */}
          {() => {
            const name = m.sel()?.name
            if (name && name !== lastRequested && view().state !== 'idle') {
              batch(() => view.set({ state: 'idle' }))
            }
            return null
          }}
        </>
      )
    },
  })
}
