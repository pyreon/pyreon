import { Alert } from '@pyreon/ui-components'

export function AlertDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Alert</h2>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">States</h3>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <Alert state="info">This is an informational message.</Alert>
        <Alert state="success">Operation completed successfully!</Alert>
        <Alert state="warning">Please review before proceeding.</Alert>
        <Alert state="error">An error occurred. Please try again.</Alert>
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Variants</h3>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <Alert state="info" variant="subtle">Subtle</Alert>
        <Alert state="info" variant="solid">Solid</Alert>
        <Alert state="info" variant="outline">Outline</Alert>
      </div>
    </div>
  )
}
