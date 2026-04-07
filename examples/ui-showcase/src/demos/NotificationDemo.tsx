import { Notification } from '@pyreon/ui-components'

export function NotificationDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Notification</h2>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">States</h3>
      <div style="display: flex; flex-direction: column; gap: 12px; max-width: 480px; margin-bottom: 24px;">
        <Notification state="info">
          A new software update is available. See what's new in version 4.0.
        </Notification>
        <Notification state="success">
          Your changes have been saved successfully.
        </Notification>
        <Notification state="warning">
          Your trial expires in 3 days. Upgrade now to keep access.
        </Notification>
        <Notification state="error">
          There was a problem processing your payment. Please try again.
        </Notification>
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Without State</h3>
      <div style="max-width: 480px; margin-bottom: 24px;">
        <Notification>
          This is a neutral notification with no specific state applied.
        </Notification>
      </div>
    </div>
  )
}
