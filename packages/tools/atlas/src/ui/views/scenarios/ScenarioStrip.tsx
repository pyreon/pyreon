/**
 * The scenario strip — the selected component's scenarios as tabs above the
 * canvas, with the active one's verify verdict on the right.
 *
 * A scenario is a whole pinned state (the args the pipeline verified), so
 * choosing one applies its args and the canvas renders exactly the state the
 * verdict covers. Editing a control leaves every tab unselected — the canvas
 * no longer shows any scenario verbatim, and the strip says so.
 *
 * WAI-ARIA tabs: one tab in the Tab order (roving tabindex), ←/→ move and
 * select (wrapping), Home/End jump. The canvas below is the tab panel.
 */
import { Show } from '@pyreon/core'
import * as C from '../../components'
import type { WorkbenchModel } from '../../model'

const VERDICT_CHIP = {
  ok: { variant: 'ok', text: '✓ verified', label: 'Scenario verified' },
  fail: { variant: 'fail', text: '✗ check failed', label: 'A check failed for this scenario' },
  unverified: { variant: 'warn', text: 'not verified', label: 'Scenario not verified' },
} as const

const chipFor = (s: { verdict: keyof typeof VERDICT_CHIP } | undefined) =>
  VERDICT_CHIP[s?.verdict ?? 'unverified'] ?? VERDICT_CHIP.unverified

export function ScenarioStrip(props: { model: WorkbenchModel }) {
  const m = props.model
  const tabEls = new Map<string, HTMLElement>()

  const scenarios = () => m.sel()?.scenarios ?? []
  const active = () => scenarios().find((s) => s.id === m.activeScenario())

  const onKey = (e: KeyboardEvent) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(e.key)) return
    const list = scenarios()
    if (list.length === 0) return
    e.preventDefault()
    const i = list.findIndex((s) => s.id === m.activeScenario())
    const n = list.length
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? n - 1
          : i < 0
            ? 0
            : (i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n
    const s = list[next]!
    m.selectScenario(m.selId(), s.id)
    tabEls.get(s.id)?.focus()
  }

  return (
    <C.ScenStrip data-testid="scenario-strip">
      {() => {
        const list = scenarios()
        if (list.length === 0) {
          return (
            <C.ScenNote data-testid="scenarios-none">
              {`${m.sel()?.name ?? ''} — no scenarios`}
            </C.ScenNote>
          )
        }
        // The first tab is focusable when nothing is selected (edited args),
        // so the strip is always reachable with Tab.
        const focusId = () => m.activeScenario() ?? list[0]!.id
        return (
          <C.Segment role="tablist" aria-label="Scenarios" onKeyDown={onKey}>
            {list.map((s) => (
              <C.ScenTab
                role="tab"
                id={`atlas-scenario-${s.id}`}
                data-testid={`scenario-${s.id}`}
                data-verdict={s.verdict}
                aria-controls="atlas-canvas-panel"
                aria-selected={() => (m.activeScenario() === s.id ? 'true' : 'false')}
                tabIndex={() => (focusId() === s.id ? 0 : -1)}
                state={() => (m.activeScenario() === s.id ? 'active' : 'idle')}
                ref={(el: HTMLElement | null) => {
                  if (el) tabEls.set(s.id, el)
                  else tabEls.delete(s.id)
                }}
                onClick={() => m.selectScenario(m.selId(), s.id)}
              >
                <C.ScenDot variant={s.verdict} data-verdict={s.verdict} aria-hidden="true" />
                {s.name}
              </C.ScenTab>
            ))}
          </C.Segment>
        )
      }}
      <C.Spacer />
      <Show when={() => scenarios().length > 0 && !active()}>
        <C.ScenNote data-testid="scenario-edited">edited args</C.ScenNote>
      </Show>
      {/* Guarded accessors, not a closure over a captured scenario: a
          compiled prop getter outlives the render that made it, and reading
          a captured `s.verdict` after an edit cleared the active scenario
          threw. Every read re-asks `active()`. */}
      <Show when={() => active()?.play !== undefined}>
        <C.PlayBtn
          data-testid={() => `play-${active()?.id ?? ''}`}
          aria-label={() => `Play ${active()?.name ?? ''}`}
          onClick={() => {
            const s = active()
            if (s) void m.runPlay(m.selId(), s.id)
          }}
        >
          ▶ play
        </C.PlayBtn>
      </Show>
      <Show when={() => active() !== undefined}>
        <C.CountPill
          data-testid="scenario-verdict"
          variant={() => chipFor(active()).variant}
          title={() => chipFor(active()).label}
        >
          {() => chipFor(active()).text}
        </C.CountPill>
      </Show>
    </C.ScenStrip>
  )
}
