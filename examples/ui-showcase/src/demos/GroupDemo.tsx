import { Group, Button } from '@pyreon/ui-components'

export function GroupDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Group</h2>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Inline items with gap</h3>
      <div style="margin-bottom: 24px;">
        <Group gap="medium">
          <Button state="primary">Save</Button>
          <Button state="secondary">Cancel</Button>
          <Button state="danger" variant="outline">Delete</Button>
        </Group>
      </div>
    </div>
  )
}
