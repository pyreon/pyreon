import { Group, Box } from '@pyreon/ui-components'

export function GroupDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Group</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Horizontal flex layout with wrapping and configurable gap sizes. Groups children left to right.
      </p>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Size: xs (gap: 4px)</h3>
        <Group {...{ size: 'xs' } as any}>
          <Box {...{ style: 'padding: 12px 20px; background: #dcfce7; border-radius: 6px;' } as any}>Item 1</Box>
          <Box {...{ style: 'padding: 12px 20px; background: #dcfce7; border-radius: 6px;' } as any}>Item 2</Box>
          <Box {...{ style: 'padding: 12px 20px; background: #dcfce7; border-radius: 6px;' } as any}>Item 3</Box>
          <Box {...{ style: 'padding: 12px 20px; background: #dcfce7; border-radius: 6px;' } as any}>Item 4</Box>
        </Group>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Size: sm (gap: 8px)</h3>
        <Group {...{ size: 'sm' } as any}>
          <Box {...{ style: 'padding: 12px 20px; background: #bbf7d0; border-radius: 6px;' } as any}>Item 1</Box>
          <Box {...{ style: 'padding: 12px 20px; background: #bbf7d0; border-radius: 6px;' } as any}>Item 2</Box>
          <Box {...{ style: 'padding: 12px 20px; background: #bbf7d0; border-radius: 6px;' } as any}>Item 3</Box>
          <Box {...{ style: 'padding: 12px 20px; background: #bbf7d0; border-radius: 6px;' } as any}>Item 4</Box>
        </Group>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Size: md (gap: 16px)</h3>
        <Group {...{ size: 'md' } as any}>
          <Box {...{ style: 'padding: 12px 20px; background: #86efac; border-radius: 6px;' } as any}>Item 1</Box>
          <Box {...{ style: 'padding: 12px 20px; background: #86efac; border-radius: 6px;' } as any}>Item 2</Box>
          <Box {...{ style: 'padding: 12px 20px; background: #86efac; border-radius: 6px;' } as any}>Item 3</Box>
          <Box {...{ style: 'padding: 12px 20px; background: #86efac; border-radius: 6px;' } as any}>Item 4</Box>
        </Group>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Size: lg (gap: 24px)</h3>
        <Group {...{ size: 'lg' } as any}>
          <Box {...{ style: 'padding: 12px 20px; background: #4ade80; border-radius: 6px;' } as any}>Item 1</Box>
          <Box {...{ style: 'padding: 12px 20px; background: #4ade80; border-radius: 6px;' } as any}>Item 2</Box>
          <Box {...{ style: 'padding: 12px 20px; background: #4ade80; border-radius: 6px;' } as any}>Item 3</Box>
          <Box {...{ style: 'padding: 12px 20px; background: #4ade80; border-radius: 6px;' } as any}>Item 4</Box>
        </Group>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Size: xl (gap: 32px)</h3>
        <Group {...{ size: 'xl' } as any}>
          <Box {...{ style: 'padding: 12px 20px; background: #22c55e; color: #fff; border-radius: 6px;' } as any}>Item 1</Box>
          <Box {...{ style: 'padding: 12px 20px; background: #22c55e; color: #fff; border-radius: 6px;' } as any}>Item 2</Box>
          <Box {...{ style: 'padding: 12px 20px; background: #22c55e; color: #fff; border-radius: 6px;' } as any}>Item 3</Box>
          <Box {...{ style: 'padding: 12px 20px; background: #22c55e; color: #fff; border-radius: 6px;' } as any}>Item 4</Box>
        </Group>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Wrapping Behavior</h3>
        <div style="max-width: 400px; border: 1px dashed #d1d5db; padding: 12px; border-radius: 8px;">
          <Group {...{ size: 'sm' } as any}>
            {['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet'].map((item) => (
              <Box {...{ style: 'padding: 8px 16px; background: #16a34a; color: #fff; border-radius: 6px; font-size: 13px;' } as any}>
                {item}
              </Box>
            ))}
          </Group>
        </div>
        <p style="font-size: 12px; color: #9ca3af; margin-top: 8px;">Container constrained to 400px to show wrapping</p>
      </section>
    </div>
  )
}
