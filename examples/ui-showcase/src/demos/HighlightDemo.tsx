import { Highlight, Paragraph } from '@pyreon/ui-components'

export function HighlightDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Highlight</h2>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">States</h3>
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

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Multiple Highlights</h3>
      <div style="margin-bottom: 24px;">
        <Paragraph>
          Pyreon's <Highlight state="primary">signal-based reactivity</Highlight> enables <Highlight state="success">fine-grained updates</Highlight> with <Highlight state="warning">zero unnecessary re-renders</Highlight>.
        </Paragraph>
      </div>
    </div>
  )
}
