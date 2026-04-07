import { Center, Box } from '@pyreon/ui-components'

export function CenterDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Center</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Centers its children both horizontally and vertically within its bounds.
      </p>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Basic Centering</h3>
        <Center {...{ style: 'height: 200px; background: #f3f4f6; border-radius: 8px; border: 1px dashed #d1d5db;' } as any}>
          <span style="font-size: 16px; font-weight: 600;">Centered Content</span>
        </Center>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Centering a Box</h3>
        <Center {...{ style: 'height: 250px; background: #eff6ff; border-radius: 8px;' } as any}>
          <Box {...{ style: 'padding: 24px; background: #3b82f6; color: #fff; border-radius: 8px; font-weight: 600;' } as any}>
            Centered Box
          </Box>
        </Center>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Centering Icon-like Content</h3>
        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
          {['48px', '64px', '80px', '96px'].map((size) => (
            <Center {...{ style: `width: ${size}; height: ${size}; background: #6366f1; color: #fff; border-radius: 50%; font-size: 20px; font-weight: 700;` } as any}>
              {size.replace('px', '')}
            </Center>
          ))}
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Full-Width Centered</h3>
        <Center {...{ style: 'height: 120px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; color: #fff;' } as any}>
          <div style="text-align: center;">
            <div style="font-size: 20px; font-weight: 700;">Full Width Center</div>
            <div style="font-size: 14px; opacity: 0.8; margin-top: 4px;">Both axes aligned</div>
          </div>
        </Center>
      </section>
    </div>
  )
}
