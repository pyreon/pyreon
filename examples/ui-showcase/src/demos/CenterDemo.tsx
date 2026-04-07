import { Center, Title } from '@pyreon/ui-components'

export function CenterDemo() {
  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Center</Title>

      <Title size="h3" style="margin-bottom: 12px">Small</Title>
      <Center style="height: 80px; background: #f3f4f6; border-radius: 8px; margin-bottom: 24px;">
        Centered content (80px)
      </Center>

      <Title size="h3" style="margin-bottom: 12px">Medium</Title>
      <Center style="height: 120px; background: #dbeafe; border-radius: 8px; margin-bottom: 24px;">
        Centered content (120px)
      </Center>

      <Title size="h3" style="margin-bottom: 12px">Large</Title>
      <Center style="height: 200px; background: #ede9fe; border-radius: 8px; margin-bottom: 24px;">
        Centered content (200px)
      </Center>

      <Title size="h3" style="margin-bottom: 12px">Nested Centers</Title>
      <Center style="height: 160px; background: #fef3c7; border-radius: 8px; margin-bottom: 24px;">
        <Center style="width: 200px; height: 80px; background: #fed7aa; border-radius: 6px;">
          Inner centered
        </Center>
      </Center>
    </div>
  )
}
