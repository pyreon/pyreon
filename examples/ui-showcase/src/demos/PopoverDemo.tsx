import { Popover, Title, Paragraph, Button } from '@pyreon/ui-components'

export function PopoverDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Popover</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Content popovers with rich content, borders, and shadow for floating panels.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Basic Popover</h3>
      <div style="margin-bottom: 24px;">
        <Popover style="max-width: 300px;">
          <Title size="h5" style="margin-bottom: 8px;">Popover Title</Title>
          <Paragraph style="font-size: 13px; color: #6b7280;">
            This is a popover with some descriptive content inside.
          </Paragraph>
        </Popover>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Rich Content</h3>
      <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 24px;">
        <Popover style="max-width: 280px;">
          <Title size="h5" style="margin-bottom: 8px;">Settings</Title>
          <Paragraph style="font-size: 13px; color: #6b7280; margin-bottom: 12px;">
            Configure your notification preferences here.
          </Paragraph>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px;">
              <input type="checkbox" checked /> Email notifications
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px;">
              <input type="checkbox" /> Push notifications
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px;">
              <input type="checkbox" checked /> SMS notifications
            </label>
          </div>
        </Popover>

        <Popover style="max-width: 280px;">
          <div style="display: flex; gap: 12px; margin-bottom: 12px;">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: #e0e7ff; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <span style="font-weight: 600; color: #4f46e5;">JD</span>
            </div>
            <div>
              <p style="font-weight: 600; font-size: 14px;">Jane Doe</p>
              <p style="font-size: 12px; color: #6b7280;">Senior Engineer</p>
            </div>
          </div>
          <Paragraph style="font-size: 13px; color: #6b7280; margin-bottom: 12px;">
            Building the future of web frameworks at Pyreon.
          </Paragraph>
          <div style="display: flex; gap: 8px;">
            <Button size="sm" {...{ state: 'primary' } as any}>Follow</Button>
            <Button size="sm" variant="outline">Message</Button>
          </div>
        </Popover>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With List Content</h3>
      <div style="margin-bottom: 24px;">
        <Popover style="max-width: 240px; padding: 8px;">
          <div style="display: flex; flex-direction: column;">
            <a style="padding: 8px 12px; border-radius: 6px; text-decoration: none; color: #111827; font-size: 14px; cursor: pointer;">View Profile</a>
            <a style="padding: 8px 12px; border-radius: 6px; text-decoration: none; color: #111827; font-size: 14px; cursor: pointer;">Edit Settings</a>
            <a style="padding: 8px 12px; border-radius: 6px; text-decoration: none; color: #111827; font-size: 14px; cursor: pointer;">Privacy</a>
            <div style="height: 1px; background: #e5e7eb; margin: 4px 0;" />
            <a style="padding: 8px 12px; border-radius: 6px; text-decoration: none; color: #ef4444; font-size: 14px; cursor: pointer;">Sign Out</a>
          </div>
        </Popover>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Confirmation Popover</h3>
      <div style="margin-bottom: 24px;">
        <Popover style="max-width: 260px;">
          <Title size="h5" style="margin-bottom: 4px;">Delete this item?</Title>
          <Paragraph style="font-size: 13px; color: #6b7280; margin-bottom: 12px;">
            This action cannot be undone.
          </Paragraph>
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <Button size="sm" variant="ghost">Cancel</Button>
            <Button size="sm" {...{ state: 'danger' } as any}>Delete</Button>
          </div>
        </Popover>
      </div>
    </div>
  )
}
