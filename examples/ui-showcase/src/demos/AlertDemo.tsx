import { Alert, Title } from '@pyreon/ui-components'

export function AlertDemo() {
  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Alert</Title>

      <Title size="h3" style="margin-bottom: 12px">States</Title>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <Alert state="info">This is an informational message.</Alert>
        <Alert state="success">Operation completed successfully!</Alert>
        <Alert state="warning">Please review before proceeding.</Alert>
        <Alert state="error">An error occurred. Please try again.</Alert>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Variants</Title>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <Alert state="info" variant="subtle">Subtle</Alert>
        <Alert state="info" variant="solid">Solid</Alert>
        <Alert state="info" variant="outline">Outline</Alert>
      </div>
    </div>
  )
}
