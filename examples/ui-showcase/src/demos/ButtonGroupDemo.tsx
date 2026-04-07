import { ButtonGroup, Button, Title } from '@pyreon/ui-components'

export function ButtonGroupDemo() {
  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">ButtonGroup</Title>

      <Title size="h3" style="margin-bottom: 12px">Primary Group</Title>
      <div style="margin-bottom: 24px;">
        <ButtonGroup gap="small">
          <Button state="primary">Save</Button>
          <Button state="primary" variant="outline">Cancel</Button>
          <Button state="danger" variant="ghost">Delete</Button>
        </ButtonGroup>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Navigation Group</Title>
      <div style="margin-bottom: 24px;">
        <ButtonGroup gap="small">
          <Button state="secondary" variant="outline">Previous</Button>
          <Button state="secondary" variant="outline">1</Button>
          <Button state="secondary" variant="outline">2</Button>
          <Button state="secondary" variant="outline">3</Button>
          <Button state="secondary" variant="outline">Next</Button>
        </ButtonGroup>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Mixed States</Title>
      <div style="margin-bottom: 24px;">
        <ButtonGroup gap="small">
          <Button state="success">Approve</Button>
          <Button state="danger">Reject</Button>
          <Button state="secondary" variant="outline">Skip</Button>
        </ButtonGroup>
      </div>
    </div>
  )
}
