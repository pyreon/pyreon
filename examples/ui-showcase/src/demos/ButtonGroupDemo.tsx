import { ButtonGroup, Button } from '@pyreon/ui-components'

export function ButtonGroupDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">ButtonGroup</h2>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Primary Group</h3>
      <div style="margin-bottom: 24px;">
        <ButtonGroup gap="small">
          <Button state="primary">Save</Button>
          <Button state="primary" variant="outline">Cancel</Button>
          <Button state="danger" variant="ghost">Delete</Button>
        </ButtonGroup>
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Navigation Group</h3>
      <div style="margin-bottom: 24px;">
        <ButtonGroup gap="small">
          <Button state="secondary" variant="outline">Previous</Button>
          <Button state="secondary" variant="outline">1</Button>
          <Button state="secondary" variant="outline">2</Button>
          <Button state="secondary" variant="outline">3</Button>
          <Button state="secondary" variant="outline">Next</Button>
        </ButtonGroup>
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Mixed States</h3>
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
