import { Paragraph } from '@pyreon/ui-components'

export function ParagraphDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Paragraph</h2>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Small</h3>
      <div style="margin-bottom: 24px;">
        <Paragraph size="small">
          This is a small paragraph. Ideal for captions, footnotes, and secondary information that supports the main content without competing for attention.
        </Paragraph>
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Medium (default)</h3>
      <div style="margin-bottom: 24px;">
        <Paragraph size="medium">
          This is a medium paragraph. The default size for body text, optimized for comfortable reading across devices. Pyreon's signal-based reactivity enables fine-grained DOM updates.
        </Paragraph>
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Large</h3>
      <div style="margin-bottom: 24px;">
        <Paragraph size="large">
          This is a large paragraph. Use for introductory text, lead paragraphs, or any content that needs extra prominence on the page.
        </Paragraph>
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Multiple Paragraphs</h3>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <Paragraph size="large">Pyreon is a full-stack UI framework built on signals.</Paragraph>
        <Paragraph size="medium">It provides fine-grained reactivity with zero unnecessary re-renders. Components run once, and only the DOM nodes that depend on changed signals are updated.</Paragraph>
        <Paragraph size="small">Released under the MIT license. See the documentation for more details.</Paragraph>
      </div>
    </div>
  )
}
