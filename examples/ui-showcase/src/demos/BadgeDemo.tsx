import { Badge } from '@pyreon/ui-components'

export function BadgeDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Badge</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Inline status indicator. 5 states, 3 sizes, 3 variants for displaying labels, counts, and statuses.
      </p>

      {/* States */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">States</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          <Badge {...{ state: 'primary' } as any}>Primary</Badge>
          <Badge {...{ state: 'secondary' } as any}>Secondary</Badge>
          <Badge {...{ state: 'success' } as any}>Success</Badge>
          <Badge {...{ state: 'error' } as any}>Error</Badge>
          <Badge {...{ state: 'warning' } as any}>Warning</Badge>
        </div>
      </section>

      {/* Sizes */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          <Badge {...{ state: 'primary', size: 'sm' } as any}>Small</Badge>
          <Badge {...{ state: 'primary', size: 'md' } as any}>Medium</Badge>
          <Badge {...{ state: 'primary', size: 'lg' } as any}>Large</Badge>
        </div>
      </section>

      {/* Variants */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Variants</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          <Badge {...{ state: 'primary', variant: 'solid' } as any}>Solid</Badge>
          <Badge {...{ state: 'primary', variant: 'outline' } as any}>Outline</Badge>
          <Badge {...{ state: 'primary', variant: 'subtle' } as any}>Subtle</Badge>
        </div>
      </section>

      {/* State x Variant Matrix */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">State x Variant Matrix</h3>
        <div style="overflow-x: auto;">
          <table style="border-collapse: separate; border-spacing: 8px;">
            <thead>
              <tr>
                <th style="font-size: 12px; font-weight: 600; text-align: left; padding: 4px 8px; color: #6b7280;"></th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">solid</th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">outline</th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">subtle</th>
              </tr>
            </thead>
            <tbody>
              {(['primary', 'secondary', 'success', 'error', 'warning'] as const).map((state) => (
                <tr>
                  <td style="font-size: 12px; font-weight: 600; padding: 4px 8px; color: #6b7280; vertical-align: middle;">{state}</td>
                  {(['solid', 'outline', 'subtle'] as const).map((variant) => (
                    <td style="padding: 4px 8px; text-align: center;">
                      <Badge {...{ state, variant } as any}>{state}</Badge>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* State x Size Matrix */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">State x Size Matrix</h3>
        <div style="overflow-x: auto;">
          <table style="border-collapse: separate; border-spacing: 8px;">
            <thead>
              <tr>
                <th style="font-size: 12px; font-weight: 600; text-align: left; padding: 4px 8px; color: #6b7280;"></th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">sm</th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">md</th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">lg</th>
              </tr>
            </thead>
            <tbody>
              {(['primary', 'secondary', 'success', 'error', 'warning'] as const).map((state) => (
                <tr>
                  <td style="font-size: 12px; font-weight: 600; padding: 4px 8px; color: #6b7280; vertical-align: middle;">{state}</td>
                  {(['sm', 'md', 'lg'] as const).map((size) => (
                    <td style="padding: 4px 8px; text-align: center;">
                      <Badge {...{ state, size } as any}>{state}</Badge>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Practical Examples */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Practical Examples</h3>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>Status:</span>
            <Badge {...{ state: 'success', size: 'sm' } as any}>Active</Badge>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>Priority:</span>
            <Badge {...{ state: 'error', size: 'sm' } as any}>Critical</Badge>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>Version:</span>
            <Badge {...{ state: 'primary', size: 'sm', variant: 'outline' } as any}>v2.1.0</Badge>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>Notifications:</span>
            <Badge {...{ state: 'warning', size: 'sm' } as any}>12</Badge>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>Environment:</span>
            <Badge {...{ state: 'secondary', size: 'sm' } as any}>Production</Badge>
          </div>
        </div>
      </section>
    </div>
  )
}
