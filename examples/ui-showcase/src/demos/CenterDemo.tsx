import { Center } from '@pyreon/ui-components'

export function CenterDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Center</h2>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Small</h3>
      <Center style="height: 80px; background: #f3f4f6; border-radius: 8px; margin-bottom: 24px;">
        Centered content (80px)
      </Center>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Medium</h3>
      <Center style="height: 120px; background: #dbeafe; border-radius: 8px; margin-bottom: 24px;">
        Centered content (120px)
      </Center>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Large</h3>
      <Center style="height: 200px; background: #ede9fe; border-radius: 8px; margin-bottom: 24px;">
        Centered content (200px)
      </Center>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Nested Centers</h3>
      <Center style="height: 160px; background: #fef3c7; border-radius: 8px; margin-bottom: 24px;">
        <Center style="width: 200px; height: 80px; background: #fed7aa; border-radius: 6px;">
          Inner centered
        </Center>
      </Center>
    </div>
  )
}
