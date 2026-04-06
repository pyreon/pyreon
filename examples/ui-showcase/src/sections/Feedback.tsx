import {
  Title,
  Alert,
  Progress,
  Loader,
  Skeleton,
  Notification,
  Divider,
} from '@pyreon/ui-components'

function SectionTitle(props: { children: any }) {
  return <Title size="h3" style="margin: 24px 0 12px;">{props.children}</Title>
}

export function FeedbackSection() {
  return (
    <div style="max-width: 600px;">
      <Title size="h2">Feedback</Title>

      <SectionTitle>Alerts</SectionTitle>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;">
        <Alert state="info">This is an informational message.</Alert>
        <Alert state="success">Operation completed successfully!</Alert>
        <Alert state="warning">Please review before proceeding.</Alert>
        <Alert state="error">An error occurred. Please try again.</Alert>
      </div>

      <SectionTitle>Alert Variants</SectionTitle>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;">
        <Alert state="info" variant="subtle">Subtle info alert</Alert>
        <Alert state="info" variant="solid">Solid info alert</Alert>
        <Alert state="info" variant="outline">Outline info alert</Alert>
      </div>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Progress</SectionTitle>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;">
        <div>
          <span style="font-size: 13px; color: #6b7280;">25%</span>
          <Progress state="primary" size="sm" style="margin-top: 4px;" />
        </div>
        <div>
          <span style="font-size: 13px; color: #6b7280;">60%</span>
          <Progress state="success" size="md" style="margin-top: 4px;" />
        </div>
        <div>
          <span style="font-size: 13px; color: #6b7280;">90%</span>
          <Progress state="error" size="lg" style="margin-top: 4px;" />
        </div>
      </div>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Loaders</SectionTitle>
      <div style="display: flex; gap: 24px; align-items: center; margin-bottom: 16px;">
        <Loader size="sm" state="primary" />
        <Loader size="md" state="primary" />
        <Loader size="lg" state="primary" />
        <Loader size="xl" state="primary" />
      </div>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Skeleton</SectionTitle>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;">
        <div style="display: flex; gap: 12px; align-items: center;">
          <Skeleton variant="circle" style="width: 48px; height: 48px;" />
          <div style="flex: 1;">
            <Skeleton variant="text" style="width: 60%; height: 16px; margin-bottom: 8px;" />
            <Skeleton variant="text" style="width: 40%; height: 14px;" />
          </div>
        </div>
        <Skeleton variant="rect" style="width: 100%; height: 120px; border-radius: 8px;" />
      </div>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Notifications</SectionTitle>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <Notification state="info">New message from the team.</Notification>
        <Notification state="success">Your changes have been saved.</Notification>
        <Notification state="warning">Storage is almost full.</Notification>
        <Notification state="error">Failed to sync. Retrying...</Notification>
      </div>
    </div>
  )
}
