import { Chip, Title } from '@pyreon/ui-components'

export function ChipDemo() {
  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Chip</Title>

      <Title size="h3" style="margin-bottom: 12px">States (filled)</Title>
      <div style="display: flex; gap: 8px; margin-bottom: 24px;">
        <Chip state="primary" variant="filled">Primary</Chip>
        <Chip state="secondary" variant="filled">Secondary</Chip>
        <Chip state="success" variant="filled">Success</Chip>
        <Chip state="error" variant="filled">Error</Chip>
      </div>

      <Title size="h3" style="margin-bottom: 12px">States (outline)</Title>
      <div style="display: flex; gap: 8px; margin-bottom: 24px;">
        <Chip state="primary" variant="outline">Primary</Chip>
        <Chip state="secondary" variant="outline">Secondary</Chip>
        <Chip state="success" variant="outline">Success</Chip>
        <Chip state="error" variant="outline">Error</Chip>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Sizes</Title>
      <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 24px;">
        <Chip state="primary" size="small">Small</Chip>
        <Chip state="primary" size="medium">Medium</Chip>
        <Chip state="primary" size="large">Large</Chip>
      </div>

      <Title size="h3" style="margin-bottom: 12px">All Combinations</Title>
      <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px;">
        <Chip state="primary" size="small" variant="filled">S/Filled</Chip>
        <Chip state="success" size="medium" variant="filled">M/Filled</Chip>
        <Chip state="error" size="large" variant="filled">L/Filled</Chip>
        <Chip state="primary" size="small" variant="outline">S/Outline</Chip>
        <Chip state="success" size="medium" variant="outline">M/Outline</Chip>
        <Chip state="error" size="large" variant="outline">L/Outline</Chip>
      </div>
    </div>
  )
}
