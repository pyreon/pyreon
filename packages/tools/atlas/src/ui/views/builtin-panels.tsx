/**
 * The four built-in addon panels, as registry entries.
 *
 * These bodies used to live inline in `AddonPanel.tsx` as a `<Show>` chain, one
 * branch per tab, which is why nothing outside the shell could add a panel.
 * They are unchanged in behaviour — only their home moved — so the diff that
 * introduced the registry is a MOVE plus a registration, not a rewrite of four
 * working panels.
 *
 * Mapping to Storybook's addon set: `controls` ≈ addon-controls, `actions` ≈
 * addon-actions, `a11y` ≈ addon-a11y, and `canvas` folds together
 * addon-viewport, addon-backgrounds, addon-pseudo-states and addon-outline.
 */
import { Show } from '@pyreon/core'
// Viewport/background/locale lists come from the MODEL (per-project presets
// with shipped defaults), not the addons consts — the pickers must render what
// the project configured.
import { signal } from '@pyreon/reactivity'
import { ADDON_TABS, PSEUDO_STATES } from '../addons'
import { previewSubject } from '../a11y'
import { AXE_IDLE, runAxe, type AxeReport } from '../axe'
import type { WorkbenchControl } from '../catalog'
import * as C from '../chrome'
import type { WorkbenchModel } from '../model'
import { registerAddonPanel } from '../panels'

/** One control row (text / enum / bool). */
function controlRow(m: WorkbenchModel, ctrl: WorkbenchControl) {
  return (
    <C.CtrlRow>
      <C.CtrlHead>
        <C.CtrlLabel>{ctrl.label}</C.CtrlLabel>
        <C.CtrlType>{ctrl.type}</C.CtrlType>
      </C.CtrlHead>
      {ctrl.type === 'text' ? (
        <C.TextInput
          // VALUE-bound, not placeholder-only. The input used to show the
          // default as a placeholder and never reflect the live value, which
          // made it write-only: type, switch component, come back, and the box
          // is empty while `vals()` still holds what you typed. It also meant
          // the box did not agree with what the preview was rendering.
          value={() => String(m.vals()[ctrl.key] ?? '')}
          placeholder={String(ctrl.default ?? '')}
          onInput={(e: Event) =>
            m.setValue(m.selId(), ctrl.key, (e.target as HTMLInputElement).value)
          }
        />
      ) : ctrl.type === 'number' ? (
        <C.NumberInput
          value={() => String(m.vals()[ctrl.key] ?? '')}
          placeholder={String(ctrl.default ?? '')}
          onInput={(e: Event) => {
            // Stored as a NUMBER, because the component's prop is one — a
            // string here silently breaks any arithmetic the component does.
            // An empty/unparsable box falls back to the declared default.
            const raw = (e.target as HTMLInputElement).value
            const n = Number(raw)
            m.setValue(m.selId(), ctrl.key, raw === '' || Number.isNaN(n) ? ctrl.default : n)
          }}
        />
      ) : ctrl.type === 'color' ? (
        <C.ColorRow>
          <C.ColorInput
            data-testid={`color-${ctrl.key}`}
            value={() => String(m.vals()[ctrl.key] ?? ctrl.default ?? '#000000')}
            onInput={(e: Event) =>
              m.setValue(m.selId(), ctrl.key, (e.target as HTMLInputElement).value)
            }
          />
          <C.ColorHex>{() => String(m.vals()[ctrl.key] ?? ctrl.default ?? '')}</C.ColorHex>
        </C.ColorRow>
      ) : ctrl.type === 'enum' ? (
        <C.EnumWrap>
          {(ctrl.options ?? []).map((opt) => (
            <C.EnumBtn
              state={() => (m.vals()[ctrl.key] === opt ? 'active' : 'idle')}
              onClick={() => m.setValue(m.selId(), ctrl.key, opt)}
            >
              {opt}
            </C.EnumBtn>
          ))}
        </C.EnumWrap>
      ) : (
        <C.Switch
          state={() => (m.vals()[ctrl.key] ? 'on' : 'off')}
          onClick={() => m.setValue(m.selId(), ctrl.key, !m.vals()[ctrl.key])}
        >
          <C.Knob state={() => (m.vals()[ctrl.key] ? 'on' : 'off')} />
        </C.Switch>
      )}
    </C.CtrlRow>
  )
}


/**
 * Title + hint come from `ADDON_TABS`, not from this file, so the tab strip's
 * copy has ONE home. A renderer is paired with its entry by id; an id with no
 * entry is a programming error worth failing loudly on rather than rendering a
 * blank tab.
 */
/**
 * Highlight addon, wired to the panel that has findings: hovering an a11y row
 * outlines THE ELEMENT THE CHECKS RAN AGAINST, so a verdict points at a box on
 * screen rather than at prose. Imperative outline write, cleared on leave —
 * the same measurement-not-styling rationale as the Measure overlay.
 */
function highlightSubject(m: WorkbenchModel, on: boolean): void {
  const subject = previewSubject(m.previewElement()) as HTMLElement | null
  if (!subject) return
  subject.style.outline = on ? '2px solid #ff2d55' : ''
  subject.style.outlineOffset = on ? '2px' : ''
}

function tab(id: string): { id: string; title: string; hint: string } {
  const found = ADDON_TABS.find((t) => t.id === id)
  if (!found) throw new Error(`[Pyreon] atlas: no ADDON_TABS entry for built-in panel "${id}"`)
  return { id: found.id, title: found.title, hint: found.hint }
}

/** Register the built-ins. Idempotent — safe if the UI module is evaluated twice. */
export function registerBuiltinPanels(): void {
  registerAddonPanel({
    ...tab('controls'),
    render: (model) => {
      const m = model as WorkbenchModel
      return (
        <>
          {() => m.sel()?.controls.map((ctrl) => controlRow(m, ctrl)) ?? null}
          <C.ResetBtn onClick={m.reset}>Reset to defaults</C.ResetBtn>
        </>
      )
    },
  })

  registerAddonPanel({
    ...tab('actions'),
    render: (model) => {
      const m = model as WorkbenchModel
      return (
        <>
          <C.ActionsHead>
            <C.ActionsHint>Interact with the preview to log events.</C.ActionsHint>
            <C.ClearBtn onClick={m.clearActions}>Clear</C.ClearBtn>
          </C.ActionsHead>
          <Show when={() => m.actions().length === 0}>
            <C.ActionsEmpty>No events yet — click the component.</C.ActionsEmpty>
          </Show>
          {() =>
            m.actions().map((ev) => (
              <C.ActionRow>
                <C.ActionName>{ev.name}</C.ActionName>
                <C.ActionDetail>{ev.detail}</C.ActionDetail>
                <C.ActionTime>{ev.t}</C.ActionTime>
              </C.ActionRow>
            ))
          }
        </>
      )
    },
  })

  registerAddonPanel({
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
          <C.A11ySummary>
            <C.A11yStat>
              <C.A11yDot state="ok" />
              {() => `${m.a11y().passes} passing`}
            </C.A11yStat>
            <C.A11yStat>
              <C.A11yDot state="warn" />
              {() => `${m.a11y().warns} warnings`}
            </C.A11yStat>
            <C.A11yStat>
              <C.A11yDot state="danger" />
              {() => `${m.a11y().fails} violations`}
            </C.A11yStat>
            <C.A11yStat>
              <C.A11yDot state="warn" />
              {() => (m.a11y().unknowns ? `${m.a11y().unknowns} not determined` : '')}
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
                return `${r.violations.length} violation(s)${inc}`
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
                onMouseEnter={() => highlightTarget(v.target, true)}
                onMouseLeave={() => highlightTarget(v.target, false)}
              >
                <C.A11yIcon state="danger">✕</C.A11yIcon>
                <C.A11yBody>
                  <C.A11yTitle>{`${v.id} · ${v.impact}`}</C.A11yTitle>
                  <C.A11yNote>{`${v.help}${v.nodes > 1 ? ` (${v.nodes} nodes)` : ''}`}</C.A11yNote>
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
  })

  registerAddonPanel({
    ...tab('canvas'),
    render: (model) => {
      const m = model as WorkbenchModel
      return (
        <>
          <C.CtrlRow>
            <C.CtrlHead>
              <C.CtrlLabel>Viewport</C.CtrlLabel>
              <C.CtrlType>{() => m.viewportPreset().hint}</C.CtrlType>
            </C.CtrlHead>
            <C.EnumWrap>
              {m.viewports.map((v) => (
                <C.EnumBtn
                  data-testid={`viewport-${v.id}`}
                  state={() => (m.viewport() === v.id ? 'active' : 'idle')}
                  onClick={() => m.viewport.set(v.id)}
                >
                  {v.label}
                </C.EnumBtn>
              ))}
            </C.EnumWrap>
          </C.CtrlRow>

          <C.CtrlRow>
            <C.CtrlHead>
              <C.CtrlLabel>Background</C.CtrlLabel>
              <C.CtrlType>surface</C.CtrlType>
            </C.CtrlHead>
            <C.EnumWrap>
              {m.backgrounds.map((b) => (
                <C.EnumBtn
                  data-testid={`background-${b.id}`}
                  state={() => (m.background() === b.id ? 'active' : 'idle')}
                  onClick={() => m.background.set(b.id)}
                >
                  {b.label}
                </C.EnumBtn>
              ))}
            </C.EnumWrap>
          </C.CtrlRow>

          <C.CtrlRow>
            <C.CtrlHead>
              <C.CtrlLabel>Pseudo state</C.CtrlLabel>
              <C.CtrlType>rocketstyle</C.CtrlType>
            </C.CtrlHead>
            <C.EnumWrap>
              <C.EnumBtn
                data-testid="pseudo-none"
                state={() => (m.pseudo() === null ? 'active' : 'idle')}
                onClick={() => m.pseudo.set(null)}
              >
                None
              </C.EnumBtn>
              {PSEUDO_STATES.map((p) => (
                <C.EnumBtn
                  data-testid={`pseudo-${p.id}`}
                  state={() => (m.pseudo() === p.id ? 'active' : 'idle')}
                  onClick={() => m.pseudo.set(m.pseudo() === p.id ? null : p.id)}
                >
                  {p.label}
                </C.EnumBtn>
              ))}
            </C.EnumWrap>
          </C.CtrlRow>

          <C.CtrlRow>
            <C.CtrlHead>
              <C.CtrlLabel>Locale</C.CtrlLabel>
              <C.CtrlType>{() => m.dir()}</C.CtrlType>
            </C.CtrlHead>
            <C.EnumWrap>
              {m.locales.map((l) => (
                <C.EnumBtn
                  data-testid={`locale-${l.id}`}
                  state={() => (m.locale() === l.id ? 'active' : 'idle')}
                  onClick={() => m.locale.set(l.id)}
                >
                  {l.label}
                </C.EnumBtn>
              ))}
            </C.EnumWrap>
          </C.CtrlRow>

          <C.CtrlRow>
            <C.CtrlHead>
              <C.CtrlLabel>Pseudo-locale</C.CtrlLabel>
              <C.CtrlType>i18n stress</C.CtrlType>
            </C.CtrlHead>
            {/* Sits beside the locale switcher because they answer adjacent
                questions: that one changes writing DIRECTION, this one changes
                every string's LENGTH. German and Finnish routinely run 30-40%
                longer than English, and the layout that clips there clips here
                — without translating anything. */}
            <C.Switch
              data-testid="pseudo-locale-toggle"
              state={() => (m.pseudoLocale() ? 'on' : 'off')}
              onClick={() => m.pseudoLocale.set(!m.pseudoLocale())}
            >
              <C.Knob state={() => (m.pseudoLocale() ? 'on' : 'off')} />
            </C.Switch>
          </C.CtrlRow>

          <C.CtrlRow>
            <C.CtrlHead>
              <C.CtrlLabel>Outline</C.CtrlLabel>
              <C.CtrlType>layout debug</C.CtrlType>
            </C.CtrlHead>
            <C.Switch
              data-testid="outline-toggle"
              state={() => (m.outline() ? 'on' : 'off')}
              onClick={() => m.outline.set(!m.outline())}
            >
              <C.Knob state={() => (m.outline() ? 'on' : 'off')} />
            </C.Switch>
          </C.CtrlRow>

          <C.CtrlRow>
            <C.CtrlHead>
              <C.CtrlLabel>Measure</C.CtrlLabel>
              <C.CtrlType>hover to inspect</C.CtrlType>
            </C.CtrlHead>
            <C.Switch
              data-testid="measure-toggle"
              state={() => (m.measure() ? 'on' : 'off')}
              onClick={() => m.measure.set(!m.measure())}
            >
              <C.Knob state={() => (m.measure() ? 'on' : 'off')} />
            </C.Switch>
          </C.CtrlRow>
        </>
      )
    },
  })
}
