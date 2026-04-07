import { signal } from '@pyreon/reactivity'
import { Switch, Title } from '@pyreon/ui-components'

function SwitchItem(props: { label: string }) {
  const on = signal(false)

  return (
    <div style="display: flex; align-items: center; gap: 12px;">
      <Switch
        checked={on()}
        onChange={(v: boolean) => on.set(v)}
        size="large"
      />
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
        <Switch
          checked={enabled()}
          onChange={(v: boolean) => enabled.set(v)}
          size="large"
        />
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
