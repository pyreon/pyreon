import { signal } from '@pyreon/reactivity'
import { Drawer, Button, Title, Paragraph } from '@pyreon/ui-components'

export function DrawerDemo() {
  const leftOpen = signal(false)
  const rightOpen = signal(false)
  const topOpen = signal(false)
  const bottomOpen = signal(false)
  const lgOpen = signal(false)

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Drawer</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Slide-in panel from any edge with multiple sizes and variants.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Variants (Direction)</h3>
      <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px;">
        <Button {...{ state: 'primary' } as any} onClick={() => leftOpen.set(true)}>Left</Button>
        <Button {...{ state: 'primary' } as any} onClick={() => rightOpen.set(true)}>Right</Button>
        <Button {...{ state: 'primary' } as any} onClick={() => topOpen.set(true)}>Top</Button>
        <Button {...{ state: 'primary' } as any} onClick={() => bottomOpen.set(true)}>Bottom</Button>
      </div>

      {/* Left Drawer */}
      <Drawer open={leftOpen()} onClose={() => leftOpen.set(false)} variant="left" size="md">
        <div style="width: 360px; padding: 24px; background: white; height: 100%;">
          <Title size="h3" style="margin-bottom: 12px;">Left Drawer</Title>
          <Paragraph style="color: #6b7280; margin-bottom: 16px;">
            Slides in from the left edge. Common for navigation menus and sidebars.
          </Paragraph>
          <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
            <a style="padding: 8px 12px; border-radius: 6px; background: #f3f4f6; text-decoration: none; color: #111827;">Dashboard</a>
            <a style="padding: 8px 12px; border-radius: 6px; text-decoration: none; color: #6b7280;">Projects</a>
            <a style="padding: 8px 12px; border-radius: 6px; text-decoration: none; color: #6b7280;">Settings</a>
          </div>
          <Button {...{ state: 'primary' } as any} onClick={() => leftOpen.set(false)}>Close</Button>
        </div>
      </Drawer>

      {/* Right Drawer */}
      <Drawer open={rightOpen()} onClose={() => rightOpen.set(false)} variant="right" size="md">
        <div style="width: 360px; padding: 24px; background: white; height: 100%;">
          <Title size="h3" style="margin-bottom: 12px;">Right Drawer</Title>
          <Paragraph style="color: #6b7280; margin-bottom: 16px;">
            Slides in from the right. Ideal for settings panels, detail views, or notifications.
          </Paragraph>
          <div style="padding: 12px; background: #f9fafb; border-radius: 8px; margin-bottom: 16px;">
            <p style="font-weight: 500; margin-bottom: 4px;">Notification Settings</p>
            <p style="font-size: 13px; color: #6b7280;">Configure how you receive alerts.</p>
          </div>
          <Button {...{ state: 'primary' } as any} onClick={() => rightOpen.set(false)}>Close</Button>
        </div>
      </Drawer>

      {/* Top Drawer */}
      <Drawer open={topOpen()} onClose={() => topOpen.set(false)} variant="top" size="md">
        <div style="width: 100%; padding: 24px; background: white;">
          <Title size="h3" style="margin-bottom: 12px;">Top Drawer</Title>
          <Paragraph style="color: #6b7280; margin-bottom: 16px;">
            Drops down from the top. Useful for search bars or announcements.
          </Paragraph>
          <Button {...{ state: 'primary' } as any} onClick={() => topOpen.set(false)}>Close</Button>
        </div>
      </Drawer>

      {/* Bottom Drawer */}
      <Drawer open={bottomOpen()} onClose={() => bottomOpen.set(false)} variant="bottom" size="md">
        <div style="width: 100%; padding: 24px; background: white;">
          <Title size="h3" style="margin-bottom: 12px;">Bottom Drawer</Title>
          <Paragraph style="color: #6b7280; margin-bottom: 16px;">
            Slides up from the bottom. Popular on mobile for action sheets and bottom sheets.
          </Paragraph>
          <div style="display: flex; gap: 8px;">
            <Button variant="ghost" onClick={() => bottomOpen.set(false)}>Cancel</Button>
            <Button {...{ state: 'primary' } as any} onClick={() => bottomOpen.set(false)}>Confirm</Button>
          </div>
        </div>
      </Drawer>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <p style="font-size: 13px; color: #6b7280; margin-bottom: 12px;">
        Drawers support sm (280px), md (360px), lg (480px), and xl (640px) sizes.
      </p>
      <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px;">
        <Button variant="outline" onClick={() => lgOpen.set(true)}>Large Right Drawer</Button>
      </div>

      <Drawer open={lgOpen()} onClose={() => lgOpen.set(false)} variant="right" size="lg">
        <div style="width: 480px; padding: 24px; background: white; height: 100%;">
          <Title size="h3" style="margin-bottom: 12px;">Large Drawer (480px)</Title>
          <Paragraph style="color: #6b7280; margin-bottom: 16px;">
            The large size provides more room for complex content like forms or data displays.
          </Paragraph>
          <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;">
            <div>
              <label style="display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px;">Name</label>
              <input type="text" placeholder="Enter name" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; box-sizing: border-box;" />
            </div>
            <div>
              <label style="display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px;">Email</label>
              <input type="email" placeholder="Enter email" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; box-sizing: border-box;" />
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <Button variant="ghost" onClick={() => lgOpen.set(false)}>Cancel</Button>
            <Button {...{ state: 'primary' } as any} onClick={() => lgOpen.set(false)}>Save</Button>
          </div>
        </div>
      </Drawer>
    </div>
  )
}
