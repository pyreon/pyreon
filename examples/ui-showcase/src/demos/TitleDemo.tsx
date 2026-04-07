import { Title } from '@pyreon/ui-components'

export function TitleDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Title</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Heading component with six size levels (h1-h6) mapped to semantic heading tags.
      </p>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">All Sizes</h3>
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <div style="display: flex; align-items: baseline; gap: 12px;">
            <span style="font-size: 12px; color: #9ca3af; min-width: 24px;">h1</span>
            <Title {...{ size: 'h1', tag: 'h1' } as any}>The quick brown fox jumps</Title>
          </div>
          <div style="display: flex; align-items: baseline; gap: 12px;">
            <span style="font-size: 12px; color: #9ca3af; min-width: 24px;">h2</span>
            <Title {...{ size: 'h2', tag: 'h2' } as any}>The quick brown fox jumps</Title>
          </div>
          <div style="display: flex; align-items: baseline; gap: 12px;">
            <span style="font-size: 12px; color: #9ca3af; min-width: 24px;">h3</span>
            <Title {...{ size: 'h3', tag: 'h3' } as any}>The quick brown fox jumps</Title>
          </div>
          <div style="display: flex; align-items: baseline; gap: 12px;">
            <span style="font-size: 12px; color: #9ca3af; min-width: 24px;">h4</span>
            <Title {...{ size: 'h4', tag: 'h4' } as any}>The quick brown fox jumps</Title>
          </div>
          <div style="display: flex; align-items: baseline; gap: 12px;">
            <span style="font-size: 12px; color: #9ca3af; min-width: 24px;">h5</span>
            <Title {...{ size: 'h5', tag: 'h5' } as any}>The quick brown fox jumps</Title>
          </div>
          <div style="display: flex; align-items: baseline; gap: 12px;">
            <span style="font-size: 12px; color: #9ca3af; min-width: 24px;">h6</span>
            <Title {...{ size: 'h6', tag: 'h6' } as any}>The quick brown fox jumps</Title>
          </div>
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">In Context</h3>
        <div style="padding: 24px; background: #f9fafb; border-radius: 8px;">
          <Title {...{ size: 'h1', tag: 'h1' } as any}>Main Page Title</Title>
          <p style="color: #6b7280; margin: 8px 0 24px;">Introduction paragraph under the main heading.</p>
          <Title {...{ size: 'h2', tag: 'h2' } as any}>Section Heading</Title>
          <p style="color: #6b7280; margin: 8px 0 16px;">Content under the section heading.</p>
          <Title {...{ size: 'h3', tag: 'h3' } as any}>Subsection</Title>
          <p style="color: #6b7280; margin: 8px 0 16px;">Content under the subsection.</p>
          <Title {...{ size: 'h4', tag: 'h4' } as any}>Detail Heading</Title>
          <p style="color: #6b7280; margin: 8px 0;">More detailed content below.</p>
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Size Comparison Strip</h3>
        <div style="display: flex; gap: 24px; align-items: flex-end; flex-wrap: wrap;">
          {(['h6', 'h5', 'h4', 'h3', 'h2', 'h1'] as const).map((size) => (
            <div style="text-align: center;">
              <Title {...{ size } as any}>{size}</Title>
              <p style="font-size: 11px; color: #9ca3af; margin-top: 4px;">{size}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
