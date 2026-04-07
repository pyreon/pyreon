import { ActionIcon } from '@pyreon/ui-components'

export function ActionIconDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">ActionIcon</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        A square icon button with full state, size, and variant support. 3 states, 5 sizes, 4 variants.
      </p>

      {/* States */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">States</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          <div style="text-align: center;">
            <ActionIcon {...{ state: 'primary', size: 'md' } as any}>+</ActionIcon>
            <p style="font-size: 11px; color: #9ca3af; margin-top: 4px;">primary</p>
          </div>
          <div style="text-align: center;">
            <ActionIcon {...{ state: 'secondary', size: 'md' } as any}>+</ActionIcon>
            <p style="font-size: 11px; color: #9ca3af; margin-top: 4px;">secondary</p>
          </div>
          <div style="text-align: center;">
            <ActionIcon {...{ state: 'danger', size: 'md' } as any}>+</ActionIcon>
            <p style="font-size: 11px; color: #9ca3af; margin-top: 4px;">danger</p>
          </div>
        </div>
      </section>

      {/* Sizes */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((size) => (
            <div style="text-align: center;">
              <ActionIcon {...{ state: 'primary', size } as any}>+</ActionIcon>
              <p style="font-size: 11px; color: #9ca3af; margin-top: 4px;">{size}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Variants */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Variants</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          {(['filled', 'outline', 'subtle', 'transparent'] as const).map((variant) => (
            <div style="text-align: center;">
              <ActionIcon {...{ state: 'primary', size: 'md', variant } as any}>+</ActionIcon>
              <p style="font-size: 11px; color: #9ca3af; margin-top: 4px;">{variant}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Disabled */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Disabled</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          <ActionIcon {...{ state: 'primary', size: 'md', disabled: true } as any}>+</ActionIcon>
          <ActionIcon {...{ state: 'secondary', size: 'md', disabled: true } as any}>+</ActionIcon>
          <ActionIcon {...{ state: 'danger', size: 'md', disabled: true } as any}>+</ActionIcon>
        </div>
      </section>

      {/* State x Variant Matrix */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">State x Variant Matrix</h3>
        <div style="overflow-x: auto;">
          <table style="border-collapse: separate; border-spacing: 12px;">
            <thead>
              <tr>
                <th style="font-size: 12px; font-weight: 600; text-align: left; padding: 4px 8px; color: #6b7280;"></th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">filled</th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">outline</th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">subtle</th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">transparent</th>
              </tr>
            </thead>
            <tbody>
              {(['primary', 'secondary', 'danger'] as const).map((state) => (
                <tr>
                  <td style="font-size: 12px; font-weight: 600; padding: 4px 8px; color: #6b7280; vertical-align: middle;">{state}</td>
                  {(['filled', 'outline', 'subtle', 'transparent'] as const).map((variant) => (
                    <td style="padding: 4px 8px; text-align: center;">
                      <ActionIcon {...{ state, variant, size: 'md' } as any}>+</ActionIcon>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Size x State Matrix */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Size x State Matrix</h3>
        <div style="overflow-x: auto;">
          <table style="border-collapse: separate; border-spacing: 12px;">
            <thead>
              <tr>
                <th style="font-size: 12px; font-weight: 600; text-align: left; padding: 4px 8px; color: #6b7280;"></th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">primary</th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">secondary</th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">danger</th>
              </tr>
            </thead>
            <tbody>
              {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((size) => (
                <tr>
                  <td style="font-size: 12px; font-weight: 600; padding: 4px 8px; color: #6b7280; vertical-align: middle;">{size}</td>
                  {(['primary', 'secondary', 'danger'] as const).map((state) => (
                    <td style="padding: 4px 8px; text-align: center;">
                      <ActionIcon {...{ state, size } as any}>+</ActionIcon>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* With Different Icons */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Different Icon Content</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          <ActionIcon {...{ state: 'primary', size: 'md' } as any}>+</ActionIcon>
          <ActionIcon {...{ state: 'primary', size: 'md' } as any}>-</ActionIcon>
          <ActionIcon {...{ state: 'primary', size: 'md' } as any}>x</ActionIcon>
          <ActionIcon {...{ state: 'primary', size: 'md' } as any}>?</ActionIcon>
          <ActionIcon {...{ state: 'primary', size: 'md' } as any}>!</ActionIcon>
          <ActionIcon {...{ state: 'primary', size: 'md' } as any}>*</ActionIcon>
          <ActionIcon {...{ state: 'primary', size: 'md' } as any}>&lt;</ActionIcon>
          <ActionIcon {...{ state: 'primary', size: 'md' } as any}>&gt;</ActionIcon>
        </div>
      </section>
    </div>
  )
}
