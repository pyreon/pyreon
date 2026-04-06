import { Notification } from '@pyreon/ui-components'

export function NotificationDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Notification</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Notification banners with colored left border for info, success, warning, and error states.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">States</h3>
      <div style="display: flex; flex-direction: column; gap: 12px; max-width: 500px; margin-bottom: 24px;">
        <Notification {...{ state: 'info' } as any}>
          New version available. Update now to get the latest features.
        </Notification>
        <Notification {...{ state: 'success' } as any}>
          Your changes have been saved successfully.
        </Notification>
        <Notification {...{ state: 'warning' } as any}>
          Your trial expires in 3 days. Upgrade to keep full access.
        </Notification>
        <Notification {...{ state: 'error' } as any}>
          Payment failed. Please check your billing information.
        </Notification>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Title and Content</h3>
      <div style="display: flex; flex-direction: column; gap: 12px; max-width: 500px; margin-bottom: 24px;">
        <Notification {...{ state: 'info' } as any}>
          <div>
            <p style="font-weight: 600; margin-bottom: 4px;">System Update</p>
            <p>Scheduled maintenance on April 10th from 2:00 AM to 4:00 AM UTC.</p>
          </div>
        </Notification>
        <Notification {...{ state: 'success' } as any}>
          <div>
            <p style="font-weight: 600; margin-bottom: 4px;">Deployment Complete</p>
            <p>Version 2.4.1 has been deployed to production. All health checks passing.</p>
          </div>
        </Notification>
        <Notification {...{ state: 'warning' } as any}>
          <div>
            <p style="font-weight: 600; margin-bottom: 4px;">Storage Warning</p>
            <p>You have used 85% of your storage quota. Consider archiving old files.</p>
          </div>
        </Notification>
        <Notification {...{ state: 'error' } as any}>
          <div>
            <p style="font-weight: 600; margin-bottom: 4px;">Connection Lost</p>
            <p>Unable to reach the server. Check your network connection and try again.</p>
          </div>
        </Notification>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Actions</h3>
      <div style="display: flex; flex-direction: column; gap: 12px; max-width: 500px; margin-bottom: 24px;">
        <Notification {...{ state: 'info' } as any}>
          <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <span>A new team member has joined your workspace.</span>
            <button style="background: none; border: none; color: #3b82f6; cursor: pointer; font-weight: 500; font-size: 13px; white-space: nowrap; margin-left: 12px;">View</button>
          </div>
        </Notification>
        <Notification {...{ state: 'warning' } as any}>
          <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <span>API rate limit approaching (90% used).</span>
            <button style="background: none; border: none; color: #eab308; cursor: pointer; font-weight: 500; font-size: 13px; white-space: nowrap; margin-left: 12px;">Upgrade</button>
          </div>
        </Notification>
      </div>
    </div>
  )
}
