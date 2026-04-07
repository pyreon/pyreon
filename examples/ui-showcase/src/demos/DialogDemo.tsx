import { signal } from '@pyreon/reactivity'
import { Dialog, Button, Card, Title, Paragraph } from '@pyreon/ui-components'

export function DialogDemo() {
  const smOpen = signal(false)
  const mdOpen = signal(false)
  const dangerOpen = signal(false)
  const infoOpen = signal(false)

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Dialog</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Confirmation dialogs for user decisions. Compact and focused compared to modals.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px;">
        <Button {...{ state: 'primary' } as any} onClick={() => smOpen.set(true)}>Small (sm)</Button>
        <Button {...{ state: 'primary' } as any} onClick={() => mdOpen.set(true)}>Medium (md)</Button>
      </div>

      {/* Small Dialog */}
      <Dialog open={smOpen()} onClose={() => smOpen.set(false)} size="sm">
        <Card variant="elevated" style="max-width: 360px; width: 100%;">
          <Title size="h4" style="margin-bottom: 8px;">Confirm Action</Title>
          <Paragraph style="margin-bottom: 16px; color: #6b7280;">
            Are you sure you want to proceed?
          </Paragraph>
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <Button variant="ghost" onClick={() => smOpen.set(false)}>No</Button>
            <Button {...{ state: 'primary' } as any} onClick={() => smOpen.set(false)}>Yes</Button>
          </div>
        </Card>
      </Dialog>

      {/* Medium Dialog */}
      <Dialog open={mdOpen()} onClose={() => mdOpen.set(false)} size="md">
        <Card variant="elevated" style="max-width: 420px; width: 100%;">
          <Title size="h4" style="margin-bottom: 8px;">Save Changes?</Title>
          <Paragraph style="margin-bottom: 16px; color: #6b7280;">
            You have unsaved changes. Would you like to save them before leaving this page?
          </Paragraph>
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <Button variant="ghost" onClick={() => mdOpen.set(false)}>Discard</Button>
            <Button variant="outline" onClick={() => mdOpen.set(false)}>Cancel</Button>
            <Button {...{ state: 'primary' } as any} onClick={() => mdOpen.set(false)}>Save</Button>
          </div>
        </Card>
      </Dialog>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Danger Confirmation</h3>
      <div style="margin-bottom: 24px;">
        <Button {...{ state: 'danger' } as any} onClick={() => dangerOpen.set(true)}>Delete Account</Button>
      </div>

      <Dialog open={dangerOpen()} onClose={() => dangerOpen.set(false)} size="sm">
        <Card variant="elevated" style="max-width: 400px; width: 100%;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
            <div style="width: 40px; height: 40px; border-radius: 50%; background: #fef2f2; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <span style="color: #ef4444; font-size: 20px; font-weight: 700;">!</span>
            </div>
            <Title size="h4">Delete Account</Title>
          </div>
          <Paragraph style="margin-bottom: 16px; color: #6b7280;">
            This will permanently delete your account and all associated data. This action cannot be undone.
          </Paragraph>
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <Button variant="ghost" onClick={() => dangerOpen.set(false)}>Cancel</Button>
            <Button {...{ state: 'danger' } as any} onClick={() => dangerOpen.set(false)}>Delete</Button>
          </div>
        </Card>
      </Dialog>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Informational Dialog</h3>
      <div style="margin-bottom: 24px;">
        <Button variant="outline" onClick={() => infoOpen.set(true)}>Show Info</Button>
      </div>

      <Dialog open={infoOpen()} onClose={() => infoOpen.set(false)} size="sm">
        <Card variant="elevated" style="max-width: 400px; width: 100%;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
            <div style="width: 40px; height: 40px; border-radius: 50%; background: #eff6ff; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <span style="color: #3b82f6; font-size: 20px; font-weight: 700;">i</span>
            </div>
            <Title size="h4">Information</Title>
          </div>
          <Paragraph style="margin-bottom: 16px; color: #6b7280;">
            Your session will expire in 5 minutes. Please save your work to avoid losing any unsaved changes.
          </Paragraph>
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <Button {...{ state: 'primary' } as any} onClick={() => infoOpen.set(false)}>Got it</Button>
          </div>
        </Card>
      </Dialog>
    </div>
  )
}
