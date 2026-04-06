import { Paragraph, Title } from '@pyreon/ui-components'

export function ParagraphDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Paragraph</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Body text component with three size levels for consistent typography.
      </p>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Size: sm</h3>
        <Paragraph {...{ size: 'sm' } as any}>
          Small paragraph text. Perfect for captions, footnotes, and secondary information. The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.
        </Paragraph>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Size: md (default)</h3>
        <Paragraph {...{ size: 'md' } as any}>
          Medium paragraph text. The standard body text size for most content. The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump.
        </Paragraph>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Size: lg</h3>
        <Paragraph {...{ size: 'lg' } as any}>
          Large paragraph text. Best for introductory text, lead paragraphs, and emphasized content. The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.
        </Paragraph>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">All Sizes Side by Side</h3>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;">
          {(['sm', 'md', 'lg'] as const).map((size) => (
            <div style="padding: 16px; background: #f9fafb; border-radius: 8px;">
              <p style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #9ca3af; margin-bottom: 8px;">{size}</p>
              <Paragraph {...{ size } as any}>
                The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.
              </Paragraph>
            </div>
          ))}
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">In Context with Title</h3>
        <div style="padding: 24px; background: #f9fafb; border-radius: 8px;">
          <Title {...{ size: 'h2' } as any}>Article Heading</Title>
          <Paragraph {...{ size: 'lg', style: 'margin-top: 8px; margin-bottom: 16px;' } as any}>
            This is a lead paragraph with large text. It introduces the article topic and catches the reader's attention.
          </Paragraph>
          <Paragraph {...{ size: 'md', style: 'margin-bottom: 12px;' } as any}>
            This is standard body text. Most article content uses this size for comfortable reading. It provides a good balance between readability and information density.
          </Paragraph>
          <Paragraph {...{ size: 'sm' } as any}>
            This is small text used for supplementary information, metadata, or fine print that doesn't need to be prominently displayed.
          </Paragraph>
        </div>
      </section>
    </div>
  )
}
