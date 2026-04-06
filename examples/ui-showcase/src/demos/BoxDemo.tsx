import { Box } from '@pyreon/ui-components'

export function BoxDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Box</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        The most basic layout primitive. A styled div that accepts all responsive style props.
      </p>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Basic Usage</h3>
        <Box {...{ style: 'padding: 16px; background: #f3f4f6; border-radius: 8px;' } as any}>
          A simple box with padding and background
        </Box>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Nested Boxes</h3>
        <Box {...{ style: 'padding: 16px; background: #dbeafe; border-radius: 8px;' } as any}>
          Outer Box
          <Box {...{ style: 'padding: 12px; background: #bfdbfe; border-radius: 6px; margin-top: 8px;' } as any}>
            Middle Box
            <Box {...{ style: 'padding: 8px; background: #93c5fd; border-radius: 4px; margin-top: 8px;' } as any}>
              Inner Box
            </Box>
          </Box>
        </Box>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Padding Examples</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-start;">
          <Box {...{ style: 'padding: 4px; background: #e0e7ff; border: 1px dashed #818cf8;' } as any}>
            p: 4px
          </Box>
          <Box {...{ style: 'padding: 8px; background: #e0e7ff; border: 1px dashed #818cf8;' } as any}>
            p: 8px
          </Box>
          <Box {...{ style: 'padding: 16px; background: #e0e7ff; border: 1px dashed #818cf8;' } as any}>
            p: 16px
          </Box>
          <Box {...{ style: 'padding: 24px; background: #e0e7ff; border: 1px dashed #818cf8;' } as any}>
            p: 24px
          </Box>
          <Box {...{ style: 'padding: 32px; background: #e0e7ff; border: 1px dashed #818cf8;' } as any}>
            p: 32px
          </Box>
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Margin Examples</h3>
        <div style="background: #f9fafb; padding: 12px; border-radius: 8px;">
          <Box {...{ style: 'margin-bottom: 4px; padding: 8px; background: #fef3c7; border: 1px solid #fbbf24;' } as any}>
            margin-bottom: 4px
          </Box>
          <Box {...{ style: 'margin-bottom: 8px; padding: 8px; background: #fef3c7; border: 1px solid #fbbf24;' } as any}>
            margin-bottom: 8px
          </Box>
          <Box {...{ style: 'margin-bottom: 16px; padding: 8px; background: #fef3c7; border: 1px solid #fbbf24;' } as any}>
            margin-bottom: 16px
          </Box>
          <Box {...{ style: 'margin-bottom: 24px; padding: 8px; background: #fef3c7; border: 1px solid #fbbf24;' } as any}>
            margin-bottom: 24px
          </Box>
          <Box {...{ style: 'padding: 8px; background: #fef3c7; border: 1px solid #fbbf24;' } as any}>
            (end)
          </Box>
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">As Different Elements</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          <Box {...{ tag: 'section', style: 'padding: 12px; background: #ecfdf5; border-radius: 6px;' } as any}>
            section tag
          </Box>
          <Box {...{ tag: 'article', style: 'padding: 12px; background: #fef2f2; border-radius: 6px;' } as any}>
            article tag
          </Box>
          <Box {...{ tag: 'aside', style: 'padding: 12px; background: #eff6ff; border-radius: 6px;' } as any}>
            aside tag
          </Box>
          <Box {...{ tag: 'main', style: 'padding: 12px; background: #fefce8; border-radius: 6px;' } as any}>
            main tag
          </Box>
        </div>
      </section>
    </div>
  )
}
