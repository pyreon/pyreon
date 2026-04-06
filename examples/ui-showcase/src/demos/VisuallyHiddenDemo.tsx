import { VisuallyHidden, Button, Paragraph } from '@pyreon/ui-components'

export function VisuallyHiddenDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">VisuallyHidden</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Hides content visually while keeping it accessible to screen readers.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Screen Reader Only Text</h3>
      <div style="margin-bottom: 24px;">
        <div style="padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; max-width: 400px;">
          <Paragraph>
            The text below is visually hidden but accessible to screen readers:
          </Paragraph>
          <VisuallyHidden>
            This text is only visible to screen readers and assistive technology.
          </VisuallyHidden>
          <Paragraph style="font-size: 13px; color: #6b7280; margin-top: 8px;">
            (There is hidden text between these paragraphs — inspect the DOM to see it.)
          </Paragraph>
        </div>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Icon Button with Label</h3>
      <div style="display: flex; gap: 12px; margin-bottom: 24px;">
        <Button {...{ state: 'primary' } as any}>
          + <VisuallyHidden>Add new item</VisuallyHidden>
        </Button>
        <Button {...{ state: 'danger' } as any}>
          x <VisuallyHidden>Close dialog</VisuallyHidden>
        </Button>
        <Button variant="outline">
          ... <VisuallyHidden>More options</VisuallyHidden>
        </Button>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Form Labels</h3>
      <div style="max-width: 300px; margin-bottom: 24px;">
        <div style="margin-bottom: 12px;">
          <VisuallyHidden>
            <label>Search the documentation</label>
          </VisuallyHidden>
          <input
            type="search"
            placeholder="Search..."
            style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; box-sizing: border-box;"
          />
          <p style="font-size: 12px; color: #6b7280; margin-top: 4px;">
            Label is visually hidden but read by screen readers.
          </p>
        </div>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Skip Navigation Link</h3>
      <div style="padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; max-width: 400px; margin-bottom: 24px;">
        <VisuallyHidden>
          <a href="#main-content">Skip to main content</a>
        </VisuallyHidden>
        <Paragraph style="font-size: 13px; color: #6b7280;">
          A "Skip to main content" link is hidden above. Screen readers will announce it,
          allowing keyboard users to bypass navigation.
        </Paragraph>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Live Region Announcement</h3>
      <div style="padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; max-width: 400px; margin-bottom: 24px;">
        <VisuallyHidden>
          <div aria-live="polite" aria-atomic="true">
            3 new notifications
          </div>
        </VisuallyHidden>
        <Paragraph style="font-size: 13px; color: #6b7280;">
          A live region is hidden here. Screen readers will announce "3 new notifications"
          to the user without any visual change.
        </Paragraph>
      </div>
    </div>
  )
}
