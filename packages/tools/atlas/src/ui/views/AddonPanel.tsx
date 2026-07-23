/** Addon panel view — the Controls / Actions / A11y tabs alongside the canvas. */
import { Show } from '@pyreon/core'
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
            <C.EnumBtn state={m.vals()[ctrl.key] === opt ? 'active' : 'idle'} onClick={() => m.setValue(m.selId(), ctrl.key, opt)}>{opt}</C.EnumBtn>
          ))}
        </C.EnumWrap>
      ) : (
        <C.Switch state={m.vals()[ctrl.key] ? 'on' : 'off'} onClick={() => m.setValue(m.selId(), ctrl.key, !m.vals()[ctrl.key])}>
          <C.Knob state={m.vals()[ctrl.key] ? 'on' : 'off'} />
        </C.Switch>
      )}
    </C.CtrlRow>
  )

  return (
    <C.AddonPanel>
      <C.AddonTabs>
        <C.SegBtn state={m.addon() === 'controls' ? 'active' : 'idle'} onClick={() => m.addon.set('controls')}>Controls</C.SegBtn>
        <C.SegBtn state={m.addon() === 'actions' ? 'active' : 'idle'} onClick={() => m.addon.set('actions')}>Actions</C.SegBtn>
        <C.SegBtn state={m.addon() === 'a11y' ? 'active' : 'idle'} onClick={() => m.addon.set('a11y')}>A11y</C.SegBtn>
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
      </C.AddonBody>
    </C.AddonPanel>
  )
}
