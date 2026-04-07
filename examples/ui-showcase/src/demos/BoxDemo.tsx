import { Box } from '@pyreon/ui-components'

export function BoxDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Box</h2>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Basic Container</h3>
      <Box style="padding: 16px; background: #f3f4f6; border-radius: 8px; margin-bottom: 24px;">
        A simple Box container with a light background.
      </Box>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Nested Boxes</h3>
      <Box style="padding: 16px; background: #dbeafe; border-radius: 8px; margin-bottom: 24px;">
        Outer Box (blue)
        <Box style="padding: 12px; background: #fef3c7; border-radius: 6px; margin-top: 8px;">
          Middle Box (amber)
          <Box style="padding: 8px; background: #dcfce7; border-radius: 4px; margin-top: 8px;">
            Inner Box (green)
          </Box>
        </Box>
      </Box>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Flex Layout</h3>
      <Box style="display: flex; gap: 12px; margin-bottom: 24px;">
        <Box style="flex: 1; padding: 16px; background: #ede9fe; border-radius: 8px; text-align: center;">Column 1</Box>
        <Box style="flex: 1; padding: 16px; background: #fce7f3; border-radius: 8px; text-align: center;">Column 2</Box>
        <Box style="flex: 1; padding: 16px; background: #ecfccb; border-radius: 8px; text-align: center;">Column 3</Box>
      </Box>
    </div>
  )
}
