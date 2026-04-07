import { Notification, Title } from '@pyreon/ui-components'

export function NotificationDemo() {
  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Notification</Title>

      <Title size="h3" style="margin-bottom: 12px">States</Title>
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

      <Title size="h3" style="margin-bottom: 12px">Without State</Title>
      <div style="max-width: 480px; margin-bottom: 24px;">
        <Notification>
          This is a neutral notification with no specific state applied.
        </Notification>
      </div>
    </div>
  )
}
