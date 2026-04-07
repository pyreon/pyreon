import { IconButton } from '@pyreon/ui-components'

export function IconButtonDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">IconButton</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        A button optimized for icon-only content. Transparent background with hover effect. Available in 4 sizes.
      </p>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">All Sizes</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          <div style="text-align: center;">
            <IconButton {...{ size: 'xs' } as any}>x</IconButton>
            <p style="font-size: 11px; color: #9ca3af; margin-top: 4px;">xs</p>
          </div>
          <div style="text-align: center;">
            <IconButton {...{ size: 'sm' } as any}>x</IconButton>
            <p style="font-size: 11px; color: #9ca3af; margin-top: 4px;">sm</p>
          </div>
          <div style="text-align: center;">
            <IconButton {...{ size: 'md' } as any}>x</IconButton>
            <p style="font-size: 11px; color: #9ca3af; margin-top: 4px;">md</p>
          </div>
          <div style="text-align: center;">
            <IconButton {...{ size: 'lg' } as any}>x</IconButton>
            <p style="font-size: 11px; color: #9ca3af; margin-top: 4px;">lg</p>
          </div>
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">With Different Icons</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          <IconButton {...{ size: 'md' } as any}>+</IconButton>
          <IconButton {...{ size: 'md' } as any}>-</IconButton>
          <IconButton {...{ size: 'md' } as any}>x</IconButton>
          <IconButton {...{ size: 'md' } as any}>&lt;</IconButton>
          <IconButton {...{ size: 'md' } as any}>&gt;</IconButton>
          <IconButton {...{ size: 'md' } as any}>*</IconButton>
          <IconButton {...{ size: 'md' } as any}>?</IconButton>
          <IconButton {...{ size: 'md' } as any}>=</IconButton>
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Disabled State</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          <IconButton {...{ size: 'xs', disabled: true } as any}>x</IconButton>
          <IconButton {...{ size: 'sm', disabled: true } as any}>x</IconButton>
          <IconButton {...{ size: 'md', disabled: true } as any}>x</IconButton>
          <IconButton {...{ size: 'lg', disabled: true } as any}>x</IconButton>
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Hover Demo</h3>
        <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">Hover over each button to see the highlight effect:</p>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center; padding: 12px; background: #f9fafb; border-radius: 8px;">
          {(['xs', 'sm', 'md', 'lg'] as const).map((size) => (
            <IconButton {...{ size } as any}>*</IconButton>
          ))}
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Size Comparison</h3>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; text-align: center;">
          {(['xs', 'sm', 'md', 'lg'] as const).map((size) => (
            <div style="padding: 16px; background: #f9fafb; border-radius: 8px;">
              <IconButton {...{ size } as any}>+</IconButton>
              <p style="font-size: 11px; color: #9ca3af; margin-top: 8px;">{size}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
