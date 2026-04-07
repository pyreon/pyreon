import { Group, Button, Title } from '@pyreon/ui-components'

export function GroupDemo() {
  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Group</Title>

      <Title size="h3" style="margin-bottom: 12px">Inline items with gap</Title>
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
