/**
 * A11y panel (≈ Storybook addon-a11y) — the pipeline's static checks plus
 * on-demand axe-core, both with hover-to-highlight: a verdict points at a box
 * on screen, not at prose.
 */
import { Show } from '@pyreon/core'
import { computed, signal } from '@pyreon/reactivity'
import { plural, previewSubject, summarizeA11y } from '../../a11y'
import { AXE_IDLE, runAxe, type AxeReport } from '../../axe'
import * as C from '../../components'
import type { WorkbenchModel } from '../../model'
import type { AddonPanelDef } from '../../panels'
import { tab } from './shared'

/**
 * Highlight addon, wired to the panel that has findings: hovering an a11y row
 * outlines THE ELEMENT THE CHECKS RAN AGAINST. Imperative outline write,
 * cleared on leave — the same measurement-not-styling rationale as the
 * Measure overlay.
 */
function highlightSubject(m: WorkbenchModel, on: boolean): void {
  const subject = previewSubject(m.previewElement()) as HTMLElement | null
  if (!subject) return
  subject.style.outline = on ? '2px solid #ff2d55' : ''
  subject.style.outlineOffset = on ? '2px' : ''
}

export const a11yPanel: AddonPanelDef = {
  ...tab('a11y'),
  render: (model) => {
    const m = model as WorkbenchModel
    const axe = signal<AxeReport>(AXE_IDLE)
    const audit = async () => {
      const surface = m.previewElement()
      if (!surface) return
      axe.set({ ...AXE_IDLE, status: 'running' })
      axe.set(await runAxe(surface))
    }
    const summary = computed(() => summarizeA11y(m.a11y(), axe()))
    const highlightTarget = (selector: string, on: boolean) => {
      const surface = m.previewElement()
      const el = selector ? (surface?.querySelector(selector) as HTMLElement | null) : null
      const subject = el ?? (previewSubject(surface) as HTMLElement | null)
      if (!subject) return
      subject.style.outline = on ? '2px solid #ff2d55' : ''
      subject.style.outlineOffset = on ? '2px' : ''
    }
    return (
      <>
        {/* ONE summary for the whole panel — the structural checks and, once
            it has run, axe. It used to count the checks alone, so it read
            "0 violations" directly above axe's "1 violation(s)". Every stat is
            labelled; "not determined" appears only when there is one (its dot
            used to render with an empty label beside it). */}
        <C.A11ySummary data-testid="a11y-summary">
          <C.A11yStat data-testid="a11y-passing">
            <C.A11yDot state="ok" />
            {() => `${summary().passes} passing`}
          </C.A11yStat>
          <C.A11yStat data-testid="a11y-warnings">
            <C.A11yDot state="warn" />
            {() => plural(summary().warns, 'warning')}
          </C.A11yStat>
          <C.A11yStat data-testid="a11y-violations">
            <C.A11yDot state="danger" />
            {() => plural(summary().violations, 'violation')}
          </C.A11yStat>
          <Show when={() => summary().unknowns > 0}>
            <C.A11yStat data-testid="a11y-unknowns">
              <C.A11yDot state="unknown" />
              {() => `${summary().unknowns} not determined`}
            </C.A11yStat>
          </Show>
          <C.A11yStat data-testid="a11y-scope">
            <C.A11yNote>
              {() =>
                summary().withAxe
                  ? 'checks + axe'
                  : 'structural checks · run axe for the full audit'
              }
            </C.A11yNote>
          </C.A11yStat>
        </C.A11ySummary>
        {() =>
          m.a11y().checks.map((ch) => (
            <C.A11yRow
              data-testid={`a11y-row-${ch.status}`}
              onMouseEnter={() => highlightSubject(m, true)}
              onMouseLeave={() => highlightSubject(m, false)}
            >
              <C.A11yIcon state={ch.status}>{ch.icon}</C.A11yIcon>
              <C.A11yBody>
                <C.A11yTitle>{ch.title}</C.A11yTitle>
                <C.A11yNote>{ch.note}</C.A11yNote>
              </C.A11yBody>
            </C.A11yRow>
          ))
        }
        <C.ActionsHead>
          <C.ActionsHint>
            {() => {
              const r = axe()
              if (r.status === 'ready') return 'Full audit — axe-core, on demand.'
              if (r.status === 'running') return 'Auditing…'
              if (r.status === 'failed') return `axe failed: ${r.error ?? ''}`
              const inc = r.incomplete > 0 ? ` · ${r.incomplete} need review` : ''
              return `axe: ${plural(r.violations.length, 'violation')}${inc}`
            }}
          </C.ActionsHint>
          <C.ClearBtn data-testid="axe-run" onClick={() => void audit()}>
            Run axe
          </C.ClearBtn>
        </C.ActionsHead>
        {() =>
          axe().violations.map((v) => (
            <C.A11yRow
              data-testid={`axe-${v.id}`}
              data-axe-violation={v.id}
              onMouseEnter={() => highlightTarget(v.target, true)}
              onMouseLeave={() => highlightTarget(v.target, false)}
            >
              <C.A11yIcon state="danger">✕</C.A11yIcon>
              <C.A11yBody>
                <C.A11yTitle>{`${v.id} · ${v.impact}`}</C.A11yTitle>
                <C.A11yNote>{`${v.help}${v.nodes > 1 ? ` (${v.nodes} nodes)` : ''}`}</C.A11yNote>
                {/* WHICH element — the selector axe matched and its markup. */}
                {v.target ? <C.A11yCode data-testid="axe-target">{v.target}</C.A11yCode> : null}
                {v.html ? <C.A11yCode data-testid="axe-html">{v.html}</C.A11yCode> : null}
              </C.A11yBody>
            </C.A11yRow>
          ))
        }
        <Show when={() => axe().status === 'done' && axe().violations.length === 0}>
          <C.ActionsEmpty data-testid="axe-clean">No violations found by axe.</C.ActionsEmpty>
        </Show>
      </>
    )
  },
}
