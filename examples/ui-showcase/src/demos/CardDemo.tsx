import { Card, Title, Paragraph } from '@pyreon/ui-components'

export function CardDemo() {
  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Card</Title>

      <Title size="h3" style="margin-bottom: 12px">Variants</Title>
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
