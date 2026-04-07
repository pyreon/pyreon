import { signal } from '@pyreon/reactivity'
import { Button, Card, Title, Paragraph } from '@pyreon/ui-components'
import { ModalBase } from '@pyreon/ui-primitives'

export function ModalDemo() {
  const open = signal(false)

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Modal</Title>

      <Button state="primary" onClick={() => open.set(true)}>Open Modal</Button>

      <ModalBase
        open={open()}
        onClose={() => open.set(false)}
        closeOnEscape
        closeOnOverlay
        style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 50;"
      >
        <Card style="max-width: 500px; width: 100%; padding: 24px;">
          <Title size="h3">Modal Title</Title>
          <Paragraph style="margin: 12px 0;">
            This is a modal dialog. Press Escape or click outside to close. Scroll is locked while open.
          </Paragraph>
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <Button state="secondary" variant="ghost" onClick={() => open.set(false)}>Cancel</Button>
            <Button state="primary" onClick={() => open.set(false)}>Confirm</Button>
          </div>
        </Card>
      </ModalBase>
    </div>
  )
}
