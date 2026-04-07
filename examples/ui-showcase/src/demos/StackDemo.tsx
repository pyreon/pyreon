import { Stack, Box } from '@pyreon/ui-components'

export function StackDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Stack</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Vertical flex layout with configurable gap sizes. Stacks children top to bottom.
      </p>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Size: xs (gap: 4px)</h3>
        <Stack {...{ size: 'xs' } as any}>
          <Box {...{ style: 'padding: 12px; background: #dbeafe; border-radius: 6px; text-align: center;' } as any}>Item 1</Box>
          <Box {...{ style: 'padding: 12px; background: #dbeafe; border-radius: 6px; text-align: center;' } as any}>Item 2</Box>
          <Box {...{ style: 'padding: 12px; background: #dbeafe; border-radius: 6px; text-align: center;' } as any}>Item 3</Box>
        </Stack>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Size: sm (gap: 8px)</h3>
        <Stack {...{ size: 'sm' } as any}>
          <Box {...{ style: 'padding: 12px; background: #e0e7ff; border-radius: 6px; text-align: center;' } as any}>Item 1</Box>
          <Box {...{ style: 'padding: 12px; background: #e0e7ff; border-radius: 6px; text-align: center;' } as any}>Item 2</Box>
          <Box {...{ style: 'padding: 12px; background: #e0e7ff; border-radius: 6px; text-align: center;' } as any}>Item 3</Box>
        </Stack>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Size: md (gap: 16px)</h3>
        <Stack {...{ size: 'md' } as any}>
          <Box {...{ style: 'padding: 12px; background: #c7d2fe; border-radius: 6px; text-align: center;' } as any}>Item 1</Box>
          <Box {...{ style: 'padding: 12px; background: #c7d2fe; border-radius: 6px; text-align: center;' } as any}>Item 2</Box>
          <Box {...{ style: 'padding: 12px; background: #c7d2fe; border-radius: 6px; text-align: center;' } as any}>Item 3</Box>
        </Stack>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Size: lg (gap: 24px)</h3>
        <Stack {...{ size: 'lg' } as any}>
          <Box {...{ style: 'padding: 12px; background: #a5b4fc; border-radius: 6px; text-align: center;' } as any}>Item 1</Box>
          <Box {...{ style: 'padding: 12px; background: #a5b4fc; border-radius: 6px; text-align: center;' } as any}>Item 2</Box>
          <Box {...{ style: 'padding: 12px; background: #a5b4fc; border-radius: 6px; text-align: center;' } as any}>Item 3</Box>
        </Stack>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Size: xl (gap: 32px)</h3>
        <Stack {...{ size: 'xl' } as any}>
          <Box {...{ style: 'padding: 12px; background: #818cf8; color: #fff; border-radius: 6px; text-align: center;' } as any}>Item 1</Box>
          <Box {...{ style: 'padding: 12px; background: #818cf8; color: #fff; border-radius: 6px; text-align: center;' } as any}>Item 2</Box>
          <Box {...{ style: 'padding: 12px; background: #818cf8; color: #fff; border-radius: 6px; text-align: center;' } as any}>Item 3</Box>
        </Stack>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">All Sizes Comparison</h3>
        <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px;">
          {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((size) => (
            <div>
              <p style="font-size: 12px; font-weight: 600; margin-bottom: 8px; text-align: center;">{size}</p>
              <Stack {...{ size } as any}>
                <Box {...{ style: 'padding: 8px; background: #6366f1; color: #fff; border-radius: 4px; text-align: center; font-size: 12px;' } as any}>A</Box>
                <Box {...{ style: 'padding: 8px; background: #6366f1; color: #fff; border-radius: 4px; text-align: center; font-size: 12px;' } as any}>B</Box>
                <Box {...{ style: 'padding: 8px; background: #6366f1; color: #fff; border-radius: 4px; text-align: center; font-size: 12px;' } as any}>C</Box>
              </Stack>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
