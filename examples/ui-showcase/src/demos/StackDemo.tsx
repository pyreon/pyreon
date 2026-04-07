import { Stack, Title } from '@pyreon/ui-components'

export function StackDemo() {
  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Stack</Title>

      <Title size="h3" style="margin-bottom: 12px">Gap sizes</Title>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 24px;">
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">small</p>
          <Stack gap="small">
            <div style="padding: 12px; background: #dbeafe; border-radius: 6px; text-align: center;">A</div>
            <div style="padding: 12px; background: #dbeafe; border-radius: 6px; text-align: center;">B</div>
            <div style="padding: 12px; background: #dbeafe; border-radius: 6px; text-align: center;">C</div>
          </Stack>
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">medium</p>
          <Stack gap="medium">
            <div style="padding: 12px; background: #e0e7ff; border-radius: 6px; text-align: center;">A</div>
            <div style="padding: 12px; background: #e0e7ff; border-radius: 6px; text-align: center;">B</div>
            <div style="padding: 12px; background: #e0e7ff; border-radius: 6px; text-align: center;">C</div>
          </Stack>
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">large</p>
          <Stack gap="large">
            <div style="padding: 12px; background: #c7d2fe; border-radius: 6px; text-align: center;">A</div>
            <div style="padding: 12px; background: #c7d2fe; border-radius: 6px; text-align: center;">B</div>
            <div style="padding: 12px; background: #c7d2fe; border-radius: 6px; text-align: center;">C</div>
          </Stack>
        </div>
      </div>
    </div>
  )
}
