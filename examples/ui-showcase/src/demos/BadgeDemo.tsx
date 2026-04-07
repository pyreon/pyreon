import { Badge } from '@pyreon/ui-components'

export function BadgeDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Badge</h2>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">States</h3>
      <div style="display: flex; gap: 8px; margin-bottom: 24px;">
        <Badge state="primary">Primary</Badge>
        <Badge state="secondary">Secondary</Badge>
        <Badge state="success">Success</Badge>
        <Badge state="error">Error</Badge>
        <Badge state="warning">Warning</Badge>
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 24px;">
        <Badge state="primary" size="small">Small</Badge>
        <Badge state="primary" size="medium">Medium</Badge>
        <Badge state="primary" size="large">Large</Badge>
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Variants</h3>
      <div style="display: flex; gap: 8px; margin-bottom: 24px;">
        <Badge state="primary" variant="solid">Solid</Badge>
        <Badge state="primary" variant="outline">Outline</Badge>
        <Badge state="primary" variant="subtle">Subtle</Badge>
      </div>
    </div>
  )
}
