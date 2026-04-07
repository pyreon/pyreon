import { Highlight, Paragraph, Title } from '@pyreon/ui-components'

export function HighlightDemo() {
  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Highlight</Title>

      <Title size="h3" style="margin-bottom: 12px">States</Title>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <Paragraph>
          This text contains a <Highlight state="primary">primary highlight</Highlight> for emphasis.
        </Paragraph>
        <Paragraph>
          A <Highlight state="success">success highlight</Highlight> indicates something positive.
        </Paragraph>
        <Paragraph>
          Use a <Highlight state="warning">warning highlight</Highlight> to draw attention.
        </Paragraph>
        <Paragraph>
          An <Highlight state="error">error highlight</Highlight> signals a problem.
        </Paragraph>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Multiple Highlights</Title>
      <div style="margin-bottom: 24px;">
        <Paragraph>
          Pyreon's <Highlight state="primary">signal-based reactivity</Highlight> enables <Highlight state="success">fine-grained updates</Highlight> with <Highlight state="warning">zero unnecessary re-renders</Highlight>.
        </Paragraph>
      </div>
    </div>
  )
}
