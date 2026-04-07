import { signal } from '@pyreon/reactivity'
import { Switch, Title } from '@pyreon/ui-components'

function SwitchTrack(props: { checked: boolean }) {
  return (
    <span style={() => `width: 44px; height: 24px; border-radius: 12px; background: ${props.checked ? '#3b82f6' : '#d1d5db'}; display: inline-flex; align-items: center; padding: 2px; transition: all 0.15s; flex-shrink: 0;`}>
      <span style={() => `width: 20px; height: 20px; border-radius: 50%; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.2); transform: translateX(${props.checked ? '20px' : '0'}); transition: transform 0.15s;`} />
    </span>
  )
}

function SwitchItem(props: { label: string }) {
  const on = signal(false)

  return (
    <div style="display: flex; align-items: center; gap: 12px;">
      <Switch checked={on()} onChange={(v: boolean) => on.set(v)}>
        <SwitchTrack checked={on()} />
      </Switch>
      <span style="font-size: 14px;">{props.label}</span>
    </div>
  )
}

export function SwitchDemo() {
  const enabled = signal(false)

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Switch</Title>

      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
        <Switch checked={enabled()} onChange={(v: boolean) => enabled.set(v)}>
          <SwitchTrack checked={enabled()} />
        </Switch>
        <span style="font-size: 14px;">{() => enabled() ? 'On' : 'Off'}</span>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Multiple switches</Title>
      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px;">
        <SwitchItem label="Notifications" />
        <SwitchItem label="Dark mode" />
        <SwitchItem label="Auto-save" />
      </div>
    </div>
  )
}
