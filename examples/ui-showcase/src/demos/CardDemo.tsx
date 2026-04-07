import { Card, Title, Paragraph } from '@pyreon/ui-components'

export function CardDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Card</h2>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Variants</h3>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px;">
        <Card variant="elevated">
          <Title size="h4">Elevated</Title>
          <Paragraph>Card with shadow.</Paragraph>
        </Card>
        <Card variant="outline">
          <Title size="h4">Outline</Title>
          <Paragraph>Card with border.</Paragraph>
        </Card>
        <Card variant="filled">
          <Title size="h4">Filled</Title>
          <Paragraph>Card with background.</Paragraph>
        </Card>
      </div>
    </div>
  )
}
