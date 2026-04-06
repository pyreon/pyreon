import { signal } from '@pyreon/reactivity'
import { Switch } from '@pyreon/ui-components'

export function SwitchDemo() {
  const darkMode = signal(false)
  const notifications = signal(true)
  const autoSave = signal(false)

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Switch</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Toggle switch with controlled state, sizes, disabled, and label patterns.
      </p>

      {/* Controlled toggle */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Controlled Toggle</h3>
      <div style="margin-bottom: 32px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <Switch
            checked={darkMode()}
            onChange={(v: boolean) => darkMode.set(v)}
          />
          <span>Dark Mode: {() => darkMode() ? 'On' : 'Off'}</span>
        </div>
      </div>

      {/* Sizes */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <Switch size="sm" defaultChecked />
          <span style="font-size: 14px;">Small</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <Switch size="md" defaultChecked />
          <span style="font-size: 14px;">Medium (default)</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <Switch size="lg" defaultChecked />
          <span style="font-size: 14px;">Large</span>
        </div>
      </div>

      {/* Disabled */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Disabled</h3>
      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <Switch disabled />
          <span style="color: #9ca3af;">Disabled Off</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <Switch disabled defaultChecked />
          <span style="color: #9ca3af;">Disabled On</span>
        </div>
      </div>

      {/* With label */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Labels</h3>
      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px; max-width: 400px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <p style="font-weight: 500;">Notifications</p>
            <p style="font-size: 13px; color: #6b7280;">Receive push notifications</p>
          </div>
          <Switch
            checked={notifications()}
            onChange={(v: boolean) => notifications.set(v)}
          />
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <p style="font-weight: 500;">Auto-save</p>
            <p style="font-size: 13px; color: #6b7280;">Automatically save changes</p>
          </div>
          <Switch
            checked={autoSave()}
            onChange={(v: boolean) => autoSave.set(v)}
          />
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <p style="font-weight: 500;">Dark Mode</p>
            <p style="font-size: 13px; color: #6b7280;">Use dark theme</p>
          </div>
          <Switch
            checked={darkMode()}
            onChange={(v: boolean) => darkMode.set(v)}
          />
        </div>
      </div>

      {/* Multiple toggles state display */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">State Summary</h3>
      <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin-bottom: 32px; max-width: 400px;">
        <p style="font-size: 14px;">Dark Mode: {() => darkMode() ? 'enabled' : 'disabled'}</p>
        <p style="font-size: 14px;">Notifications: {() => notifications() ? 'enabled' : 'disabled'}</p>
        <p style="font-size: 14px;">Auto-save: {() => autoSave() ? 'enabled' : 'disabled'}</p>
      </div>
    </div>
  )
}
