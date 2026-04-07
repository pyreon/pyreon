import { CloseButton, Box } from '@pyreon/ui-components'

export function CloseButtonDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">CloseButton</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        A specialized button for dismiss/close actions. Pre-configured with aria-label="Close". Available in 3 sizes.
      </p>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">All Sizes</h3>
        <div style="display: flex; gap: 16px; flex-wrap: wrap; align-items: center;">
          <div style="text-align: center;">
            <CloseButton {...{ size: 'sm' } as any}>x</CloseButton>
            <p style="font-size: 11px; color: #9ca3af; margin-top: 4px;">sm</p>
          </div>
          <div style="text-align: center;">
            <CloseButton {...{ size: 'md' } as any}>x</CloseButton>
            <p style="font-size: 11px; color: #9ca3af; margin-top: 4px;">md</p>
          </div>
          <div style="text-align: center;">
            <CloseButton {...{ size: 'lg' } as any}>x</CloseButton>
            <p style="font-size: 11px; color: #9ca3af; margin-top: 4px;">lg</p>
          </div>
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Disabled State</h3>
        <div style="display: flex; gap: 16px; flex-wrap: wrap; align-items: center;">
          <div style="text-align: center;">
            <CloseButton {...{ size: 'sm', disabled: true } as any}>x</CloseButton>
            <p style="font-size: 11px; color: #9ca3af; margin-top: 4px;">sm disabled</p>
          </div>
          <div style="text-align: center;">
            <CloseButton {...{ size: 'md', disabled: true } as any}>x</CloseButton>
            <p style="font-size: 11px; color: #9ca3af; margin-top: 4px;">md disabled</p>
          </div>
          <div style="text-align: center;">
            <CloseButton {...{ size: 'lg', disabled: true } as any}>x</CloseButton>
            <p style="font-size: 11px; color: #9ca3af; margin-top: 4px;">lg disabled</p>
          </div>
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">In Context — Card Header</h3>
        <div style="display: flex; flex-direction: column; gap: 12px; max-width: 400px;">
          {(['sm', 'md', 'lg'] as const).map((size) => (
            <Box {...{ style: 'padding: 12px 16px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;' } as any}>
              <span style="font-weight: 600;">Card Title ({size})</span>
              <CloseButton {...{ size } as any}>x</CloseButton>
            </Box>
          ))}
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">In Context — Notification</h3>
        <div style="max-width: 500px;">
          <Box {...{ style: 'padding: 16px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;' } as any}>
            <div>
              <p style="font-weight: 600; margin-bottom: 4px;">New notification</p>
              <p style="font-size: 13px; color: #6b7280;">You have 3 unread messages in your inbox.</p>
            </div>
            <CloseButton {...{ size: 'sm' } as any}>x</CloseButton>
          </Box>
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Size Comparison Grid</h3>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; text-align: center;">
          {(['sm', 'md', 'lg'] as const).map((size) => (
            <div style="padding: 24px; background: #f9fafb; border-radius: 8px;">
              <CloseButton {...{ size } as any}>x</CloseButton>
              <p style="font-size: 11px; color: #9ca3af; margin-top: 8px;">{size}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
