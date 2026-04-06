import { signal } from '@pyreon/reactivity'
import { Modal, Button, Card, Title, Paragraph } from '@pyreon/ui-components'

export function ModalDemo() {
  const smOpen = signal(false)
  const mdOpen = signal(false)
  const lgOpen = signal(false)
  const xlOpen = signal(false)
  const fullOpen = signal(false)
  const formOpen = signal(false)

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Modal</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Modal dialogs with backdrop overlay, focus trapping, and multiple sizes.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px;">
        <Button {...{ state: 'primary' } as any} onClick={() => smOpen.set(true)}>Small (sm)</Button>
        <Button {...{ state: 'primary' } as any} onClick={() => mdOpen.set(true)}>Medium (md)</Button>
        <Button {...{ state: 'primary' } as any} onClick={() => lgOpen.set(true)}>Large (lg)</Button>
        <Button {...{ state: 'primary' } as any} onClick={() => xlOpen.set(true)}>Extra Large (xl)</Button>
        <Button {...{ state: 'primary' } as any} onClick={() => fullOpen.set(true)}>Full</Button>
      </div>

      {/* Small Modal */}
      <Modal open={smOpen()} onClose={() => smOpen.set(false)} size="sm">
        <Card variant="elevated" style="max-width: 400px; width: 100%;">
          <Title size="h4" style="margin-bottom: 8px;">Small Modal</Title>
          <Paragraph style="margin-bottom: 16px; color: #6b7280;">
            A compact modal for simple confirmations.
          </Paragraph>
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <Button variant="ghost" onClick={() => smOpen.set(false)}>Cancel</Button>
            <Button {...{ state: 'primary' } as any} onClick={() => smOpen.set(false)}>OK</Button>
          </div>
        </Card>
      </Modal>

      {/* Medium Modal */}
      <Modal open={mdOpen()} onClose={() => mdOpen.set(false)} size="md">
        <Card variant="elevated" style="max-width: 500px; width: 100%;">
          <Title size="h3" style="margin-bottom: 12px;">Medium Modal</Title>
          <Paragraph style="margin-bottom: 16px;">
            This is a medium-sized modal. Great for displaying forms, details, or information that requires more space than a dialog but less than a full page.
          </Paragraph>
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <Button variant="ghost" onClick={() => mdOpen.set(false)}>Cancel</Button>
            <Button {...{ state: 'primary' } as any} onClick={() => mdOpen.set(false)}>Confirm</Button>
          </div>
        </Card>
      </Modal>

      {/* Large Modal */}
      <Modal open={lgOpen()} onClose={() => lgOpen.set(false)} size="lg">
        <Card variant="elevated" style="max-width: 640px; width: 100%;">
          <Title size="h3" style="margin-bottom: 12px;">Large Modal</Title>
          <Paragraph style="margin-bottom: 16px;">
            A larger modal suitable for complex content like multi-step wizards, detailed forms, or data previews. The content area supports scrolling when content exceeds the viewport.
          </Paragraph>
          <Paragraph style="margin-bottom: 16px; color: #6b7280;">
            Additional content can be placed here to demonstrate the available space. This modal uses size="lg" which sets a max-width of 640px.
          </Paragraph>
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <Button variant="ghost" onClick={() => lgOpen.set(false)}>Cancel</Button>
            <Button {...{ state: 'primary' } as any} onClick={() => lgOpen.set(false)}>Save</Button>
          </div>
        </Card>
      </Modal>

      {/* XL Modal */}
      <Modal open={xlOpen()} onClose={() => xlOpen.set(false)} size="xl">
        <Card variant="elevated" style="max-width: 800px; width: 100%;">
          <Title size="h3" style="margin-bottom: 12px;">Extra Large Modal</Title>
          <Paragraph style="margin-bottom: 16px;">
            The extra-large modal (800px) is ideal for data tables, image galleries, or multi-column layouts.
          </Paragraph>
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <Button variant="ghost" onClick={() => xlOpen.set(false)}>Close</Button>
          </div>
        </Card>
      </Modal>

      {/* Full Modal */}
      <Modal open={fullOpen()} onClose={() => fullOpen.set(false)} size="full">
        <Card variant="elevated" style="width: 100%; max-width: 100%;">
          <Title size="h3" style="margin-bottom: 12px;">Full Width Modal</Title>
          <Paragraph style="margin-bottom: 16px;">
            A full-width modal that spans the entire viewport. Suitable for immersive experiences.
          </Paragraph>
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <Button variant="ghost" onClick={() => fullOpen.set(false)}>Close</Button>
          </div>
        </Card>
      </Modal>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Form Content</h3>
      <Button {...{ state: 'primary' } as any} onClick={() => formOpen.set(true)}>Open Form Modal</Button>

      <Modal open={formOpen()} onClose={() => formOpen.set(false)} size="md">
        <Card variant="elevated" style="max-width: 500px; width: 100%;">
          <Title size="h3" style="margin-bottom: 16px;">Create New Project</Title>
          <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
            <div>
              <label style="display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px;">Project Name</label>
              <input type="text" placeholder="My Project" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; box-sizing: border-box;" />
            </div>
            <div>
              <label style="display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px;">Description</label>
              <textarea placeholder="Describe your project..." style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; min-height: 80px; box-sizing: border-box; resize: vertical;" />
            </div>
            <div>
              <label style="display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px;">Visibility</label>
              <select style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                <option>Public</option>
                <option>Private</option>
                <option>Internal</option>
              </select>
            </div>
          </div>
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <Button variant="ghost" onClick={() => formOpen.set(false)}>Cancel</Button>
            <Button {...{ state: 'primary' } as any} onClick={() => formOpen.set(false)}>Create</Button>
          </div>
        </Card>
      </Modal>
    </div>
  )
}
