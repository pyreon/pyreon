import { signal } from '@pyreon/reactivity'
import { Button, Title, Paragraph } from '@pyreon/ui-components'

export function ModalDemo() {
  const open = signal(false)

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Modal</Title>

      <Button state="primary" onClick={() => open.set(true)}>Open Modal</Button>

      {() => open() ? (
        <div
          style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 50;"
          onClick={(e: MouseEvent) => { if (e.target === e.currentTarget) open.set(false) }}
        >
          <div style="max-width: 500px; width: 100%; padding: 24px; background: white; border-radius: 12px; box-shadow: 0 25px 50px rgba(0,0,0,0.25);">
            <Title size="h3">Modal Title</Title>
            <Paragraph style="margin: 12px 0;">This is a modal dialog. Click outside or press buttons to close.</Paragraph>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
              <Button state="secondary" variant="ghost" onClick={() => open.set(false)}>Cancel</Button>
              <Button state="primary" onClick={() => open.set(false)}>Confirm</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
