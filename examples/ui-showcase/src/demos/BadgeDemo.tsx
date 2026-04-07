import { Badge, Title } from '@pyreon/ui-components'

export function BadgeDemo() {
  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Badge</Title>

      <Title size="h3" style="margin-bottom: 12px">States</Title>
      <div style="display: flex; gap: 8px; margin-bottom: 24px;">
        <Badge state="primary">Primary</Badge>
        <Badge state="secondary">Secondary</Badge>
        <Badge state="success">Success</Badge>
        <Badge state="error">Error</Badge>
        <Badge state="warning">Warning</Badge>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Sizes</Title>
      <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 24px;">
        <Badge state="primary" size="small">Small</Badge>
        <Badge state="primary" size="medium">Medium</Badge>
        <Badge state="primary" size="large">Large</Badge>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Variants</Title>
      <div style="display: flex; gap: 8px; margin-bottom: 24px;">
        <Badge state="primary" variant="solid">Solid</Badge>
        <Badge state="primary" variant="outline">Outline</Badge>
        <Badge state="primary" variant="subtle">Subtle</Badge>
      </div>
    </div>
  )
}
