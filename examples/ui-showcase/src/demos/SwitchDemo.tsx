import { signal } from '@pyreon/reactivity'
import { SwitchBase } from '@pyreon/ui-primitives'

function SwitchItem(props: { label: string }) {
  const on = signal(false)

  return (
    <div style="display: flex; align-items: center; gap: 12px;">
      <SwitchBase
        checked={on()}
        onChange={(v: boolean) => on.set(v)}
        style={() => `width: 44px; height: 24px; padding: 2px; border-radius: 9999px; border: none; cursor: pointer; transition: all 0.2s; background: ${on() ? '#3b82f6' : '#d1d5db'};`}
      >
        <span style={() => `display: block; width: 20px; height: 20px; border-radius: 50%; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.2); transition: transform 0.2s; transform: translateX(${on() ? '20px' : '0'});`} />
      </SwitchBase>
      <span style="font-size: 14px;">{props.label}</span>
    </div>
  )
}

export function SwitchDemo() {
  const enabled = signal(false)

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Switch</h2>

      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
        <SwitchBase
          checked={enabled()}
          onChange={(v: boolean) => enabled.set(v)}
          style={() => `width: 44px; height: 24px; padding: 2px; border-radius: 9999px; border: none; cursor: pointer; transition: all 0.2s; background: ${enabled() ? '#3b82f6' : '#d1d5db'};`}
        >
          <span style={() => `display: block; width: 20px; height: 20px; border-radius: 50%; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.2); transition: transform 0.2s; transform: translateX(${enabled() ? '20px' : '0'});`} />
        </SwitchBase>
        <span style="font-size: 14px;">{() => enabled() ? 'On' : 'Off'}</span>
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Multiple switches</h3>
      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px;">
        <SwitchItem label="Notifications" />
        <SwitchItem label="Dark mode" />
        <SwitchItem label="Auto-save" />
      </div>
    </div>
  )
}
