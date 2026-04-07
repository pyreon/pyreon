import { AspectRatio, Box } from '@pyreon/ui-components'

export function AspectRatioDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">AspectRatio</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Constrains content to a specific aspect ratio. Useful for images, videos, and embeds.
      </p>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">16:9 Aspect Ratio</h3>
        <div style="max-width: 500px;">
          <AspectRatio {...{ style: 'padding-bottom: 56.25%;' } as any}>
            <Box {...{ style: 'position: absolute; inset: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 20px; font-weight: 700;' } as any}>
              16:9
            </Box>
          </AspectRatio>
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">4:3 Aspect Ratio</h3>
        <div style="max-width: 400px;">
          <AspectRatio {...{ style: 'padding-bottom: 75%;' } as any}>
            <Box {...{ style: 'position: absolute; inset: 0; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 20px; font-weight: 700;' } as any}>
              4:3
            </Box>
          </AspectRatio>
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">1:1 (Square)</h3>
        <div style="max-width: 300px;">
          <AspectRatio {...{ style: 'padding-bottom: 100%;' } as any}>
            <Box {...{ style: 'position: absolute; inset: 0; background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 20px; font-weight: 700;' } as any}>
              1:1
            </Box>
          </AspectRatio>
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">21:9 (Ultrawide)</h3>
        <div style="max-width: 600px;">
          <AspectRatio {...{ style: 'padding-bottom: 42.86%;' } as any}>
            <Box {...{ style: 'position: absolute; inset: 0; background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 20px; font-weight: 700;' } as any}>
              21:9
            </Box>
          </AspectRatio>
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Side-by-Side Comparison</h3>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
          {[
            { ratio: '56.25%', label: '16:9' },
            { ratio: '75%', label: '4:3' },
            { ratio: '100%', label: '1:1' },
          ].map(({ ratio, label }) => (
            <div>
              <p style="font-size: 12px; font-weight: 600; text-align: center; margin-bottom: 8px;">{label}</p>
              <AspectRatio {...{ style: `padding-bottom: ${ratio};` } as any}>
                <Box {...{ style: 'position: absolute; inset: 0; background: #6366f1; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 600;' } as any}>
                  {label}
                </Box>
              </AspectRatio>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
