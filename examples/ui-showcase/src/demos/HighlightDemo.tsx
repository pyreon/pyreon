import { Highlight, Paragraph } from '@pyreon/ui-components'

export function HighlightDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Highlight</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Inline text highlight with color states for emphasizing important content.
      </p>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">All States</h3>
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 13px; color: #6b7280; min-width: 80px;">primary</span>
            <Paragraph {...{ size: 'md' } as any}>
              This text has a <Highlight {...{ state: 'primary' } as any}>primary highlight</Highlight> applied to it.
            </Paragraph>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 13px; color: #6b7280; min-width: 80px;">success</span>
            <Paragraph {...{ size: 'md' } as any}>
              This text has a <Highlight {...{ state: 'success' } as any}>success highlight</Highlight> applied to it.
            </Paragraph>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 13px; color: #6b7280; min-width: 80px;">warning</span>
            <Paragraph {...{ size: 'md' } as any}>
              This text has a <Highlight {...{ state: 'warning' } as any}>warning highlight</Highlight> applied to it.
            </Paragraph>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 13px; color: #6b7280; min-width: 80px;">error</span>
            <Paragraph {...{ size: 'md' } as any}>
              This text has an <Highlight {...{ state: 'error' } as any}>error highlight</Highlight> applied to it.
            </Paragraph>
          </div>
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Standalone Highlights</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          <Highlight {...{ state: 'primary' } as any}>Primary</Highlight>
          <Highlight {...{ state: 'success' } as any}>Success</Highlight>
          <Highlight {...{ state: 'warning' } as any}>Warning</Highlight>
          <Highlight {...{ state: 'error' } as any}>Error</Highlight>
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Mixed in Text</h3>
        <Paragraph {...{ size: 'md', style: 'line-height: 2;' } as any}>
          The deployment was <Highlight {...{ state: 'success' } as any}>successful</Highlight> but there were
          <Highlight {...{ state: 'warning' } as any}>3 warnings</Highlight> detected during the build process.
          The <Highlight {...{ state: 'error' } as any}>database migration</Highlight> failed and needs
          <Highlight {...{ state: 'primary' } as any}>manual intervention</Highlight> from the team.
        </Paragraph>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Search Result Style</h3>
        <div style="padding: 16px; background: #f9fafb; border-radius: 8px;">
          <Paragraph {...{ size: 'md', style: 'margin-bottom: 8px;' } as any}>
            The <Highlight {...{ state: 'warning' } as any}>signal</Highlight> function creates a reactive value.
            You can read a <Highlight {...{ state: 'warning' } as any}>signal</Highlight> by calling it, and write
            to a <Highlight {...{ state: 'warning' } as any}>signal</Highlight> using .set() or .update().
          </Paragraph>
          <Paragraph {...{ size: 'sm' } as any}>
            3 matches found for "<Highlight {...{ state: 'warning' } as any}>signal</Highlight>"
          </Paragraph>
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">State Comparison Grid</h3>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;">
          {(['primary', 'success', 'warning', 'error'] as const).map((state) => (
            <div style="text-align: center; padding: 16px; background: #f9fafb; border-radius: 8px;">
              <Highlight {...{ state } as any}>{state}</Highlight>
              <p style="font-size: 11px; color: #9ca3af; margin-top: 8px;">state="{state}"</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
