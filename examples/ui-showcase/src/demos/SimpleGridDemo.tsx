import { SimpleGrid, Box } from '@pyreon/ui-components'

const coloredBox = (color: string, label: string) => (
  <Box {...{ style: `padding: 24px; background: ${color}; border-radius: 6px; text-align: center; font-weight: 600; color: #fff;` } as any}>
    {label}
  </Box>
)

export function SimpleGridDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">SimpleGrid</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        CSS Grid layout with predefined column counts (1-4). Equal-width columns with consistent gap.
      </p>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">1 Column</h3>
        <SimpleGrid {...{ size: 1 } as any}>
          {coloredBox('#6366f1', '1')}
          {coloredBox('#818cf8', '2')}
          {coloredBox('#a5b4fc', '3')}
        </SimpleGrid>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">2 Columns</h3>
        <SimpleGrid {...{ size: 2 } as any}>
          {coloredBox('#6366f1', '1')}
          {coloredBox('#818cf8', '2')}
          {coloredBox('#a5b4fc', '3')}
          {coloredBox('#c7d2fe', '4')}
        </SimpleGrid>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">3 Columns</h3>
        <SimpleGrid {...{ size: 3 } as any}>
          {coloredBox('#059669', '1')}
          {coloredBox('#10b981', '2')}
          {coloredBox('#34d399', '3')}
          {coloredBox('#6ee7b7', '4')}
          {coloredBox('#a7f3d0', '5')}
          {coloredBox('#d1fae5', '6')}
        </SimpleGrid>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">4 Columns</h3>
        <SimpleGrid {...{ size: 4 } as any}>
          {coloredBox('#dc2626', '1')}
          {coloredBox('#ef4444', '2')}
          {coloredBox('#f87171', '3')}
          {coloredBox('#fca5a5', '4')}
          {coloredBox('#fecaca', '5')}
          {coloredBox('#fee2e2', '6')}
          {coloredBox('#fef2f2', '7')}
          {coloredBox('#f87171', '8')}
        </SimpleGrid>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Card-like Grid (3 columns)</h3>
        <SimpleGrid {...{ size: 3 } as any}>
          {['Dashboard', 'Analytics', 'Reports', 'Settings', 'Users', 'Billing'].map((label) => (
            <Box {...{ style: 'padding: 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;' } as any}>
              <div style="font-weight: 600; margin-bottom: 4px;">{label}</div>
              <div style="font-size: 13px; color: #6b7280;">Description for {label.toLowerCase()}</div>
            </Box>
          ))}
        </SimpleGrid>
      </section>
    </div>
  )
}
