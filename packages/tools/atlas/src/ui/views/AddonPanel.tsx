/** Addon panel view — the Controls / Actions / A11y tabs alongside the canvas. */
import { Show } from '@pyreon/core'
import { ADDON_TABS, BACKGROUNDS, PSEUDO_STATES, VIEWPORTS, viewportById } from '../addons'
import type { WorkbenchControl } from '../catalog'
import * as C from '../chrome'
import type { WorkbenchModel } from '../model'

export function AddonPanel(props: { model: WorkbenchModel }) {
  const m = props.model
  // a single control row (text / enum / bool)
  const control = (ctrl: WorkbenchControl) => (
    <C.CtrlRow>
      <C.CtrlHead>
        <C.CtrlLabel>{ctrl.label}</C.CtrlLabel>
        <C.CtrlType>{ctrl.type}</C.CtrlType>
      </C.CtrlHead>
      {ctrl.type === 'text' ? (
        <C.TextInput placeholder={String(ctrl.default ?? '')} onInput={(e: Event) => m.setValue(m.selId(), ctrl.key, (e.target as HTMLInputElement).value)} />
      ) : ctrl.type === 'enum' ? (
        <C.EnumWrap>
          {(ctrl.options ?? []).map((opt) => (
            <C.EnumBtn state={() => (m.vals()[ctrl.key] === opt ? 'active' : 'idle')} onClick={() => m.setValue(m.selId(), ctrl.key, opt)}>{opt}</C.EnumBtn>
          ))}
        </C.EnumWrap>
      ) : (
        <C.Switch state={() => (m.vals()[ctrl.key] ? 'on' : 'off')} onClick={() => m.setValue(m.selId(), ctrl.key, !m.vals()[ctrl.key])}>
          <C.Knob state={() => (m.vals()[ctrl.key] ? 'on' : 'off')} />
        </C.Switch>
      )}
    </C.CtrlRow>
  )

  return (
    <C.AddonPanel>
      {/*
        Tabs render FROM `ADDON_TABS`, so a new addon is a data entry in
        ../addons rather than another hand-written button + `<Show>` pair.
      */}
      <C.AddonTabs>
        {ADDON_TABS.map((tab) => (
          <C.SegBtn
            data-testid={`addon-tab-${tab.id}`}
            state={() => (m.addon() === tab.id ? 'active' : 'idle')}
            onClick={() => m.addon.set(tab.id)}
          >
            {tab.title}
          </C.SegBtn>
        ))}
      </C.AddonTabs>
      <C.AddonBody>
        <Show when={() => m.addon() === 'controls'}>
          <>
            {() => m.sel()?.controls.map((ctrl) => control(ctrl)) ?? null}
            <C.ResetBtn onClick={m.reset}>Reset to defaults</C.ResetBtn>
          </>
        </Show>

        <Show when={() => m.addon() === 'actions'}>
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
        </Show>

        <Show when={() => m.addon() === 'a11y'}>
          <>
            <C.A11ySummary>
              <C.A11yStat><C.A11yDot state="ok" />{() => `${m.a11y().passes} passing`}</C.A11yStat>
              <C.A11yStat><C.A11yDot state="warn" />{() => `${m.a11y().warns} warnings`}</C.A11yStat>
              <C.A11yStat><C.A11yDot state="danger" />{() => `${m.a11y().fails} violations`}</C.A11yStat>
            </C.A11ySummary>
            {() =>
              m.a11y().checks.map((ch) => (
                <C.A11yRow>
                  <C.A11yIcon state={ch.status}>{ch.icon}</C.A11yIcon>
                  <C.A11yBody>
                    <C.A11yTitle>{ch.title}</C.A11yTitle>
                    <C.A11yNote>{ch.note}</C.A11yNote>
                  </C.A11yBody>
                </C.A11yRow>
              ))
            }
          </>
        </Show>

        {/*
          Canvas addons — Storybook ships these as four separate packages
          (viewport / backgrounds / pseudo-states / outline); here they are one
          tab driven by the presets in ../addons. Each row is the same
          "label + segmented options" shape, so adding a preset never touches
          this file.
        */}
        <Show when={() => m.addon() === 'canvas'}>
          <>
            <C.CtrlRow>
              <C.CtrlHead>
                <C.CtrlLabel>Viewport</C.CtrlLabel>
                <C.CtrlType>{() => viewportById(m.viewport()).hint}</C.CtrlType>
              </C.CtrlHead>
              <C.EnumWrap>
                {VIEWPORTS.map((v) => (
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
                {BACKGROUNDS.map((b) => (
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
          </>
        </Show>
      </C.AddonBody>
    </C.AddonPanel>
  )
}
