import { signal } from '@pyreon/reactivity'
import {
  Title,
  Paragraph,
  Button,
  Modal,
  Drawer,
  Dialog,
  Tooltip,
  Popover,
  Menu,
  MenuItem,
  Divider,
  Card,
} from '@pyreon/ui-components'

function SectionTitle(props: { children: any }) {
  return <Title size="h3" style="margin: 24px 0 12px;">{props.children}</Title>
}

export function OverlaySection() {
  const modalOpen = signal(false)
  const drawerOpen = signal(false)
  const dialogOpen = signal(false)

  return (
    <div style="max-width: 600px;">
      <Title size="h2">Overlays</Title>

      <SectionTitle>Modal</SectionTitle>
      <Button state="primary" onClick={() => modalOpen.set(true)}>Open Modal</Button>
      <Modal
        open={modalOpen()}
        onClose={() => modalOpen.set(false)}
        size="md"
      >
        <Card variant="elevated" style="max-width: 500px; width: 100%;">
          <Title size="h3" style="margin-bottom: 12px;">Modal Title</Title>
          <Paragraph style="margin-bottom: 16px;">
            This is a modal dialog. It traps focus, locks scroll, and closes on ESC.
          </Paragraph>
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <Button variant="ghost" onClick={() => modalOpen.set(false)}>Cancel</Button>
            <Button state="primary" onClick={() => modalOpen.set(false)}>Confirm</Button>
          </div>
        </Card>
      </Modal>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Drawer</SectionTitle>
      <Button state="primary" onClick={() => drawerOpen.set(true)}>Open Drawer</Button>
      <Drawer
        open={drawerOpen()}
        onClose={() => drawerOpen.set(false)}
        variant="right"
        size="md"
      >
        <div style="width: 360px; padding: 24px; background: white; height: 100%;">
          <Title size="h3" style="margin-bottom: 12px;">Drawer</Title>
          <Paragraph>Slides in from the side. Great for settings panels.</Paragraph>
          <Button state="primary" style="margin-top: 16px;" onClick={() => drawerOpen.set(false)}>Close</Button>
        </div>
      </Drawer>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Dialog (Confirmation)</SectionTitle>
      <Button state="danger" onClick={() => dialogOpen.set(true)}>Delete Item</Button>
      <Dialog
        open={dialogOpen()}
        onClose={() => dialogOpen.set(false)}
        size="sm"
      >
        <Card variant="elevated" style="max-width: 400px; width: 100%;">
          <Title size="h4" style="margin-bottom: 8px;">Are you sure?</Title>
          <Paragraph style="margin-bottom: 16px; color: #6b7280;">
            This action cannot be undone.
          </Paragraph>
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <Button variant="ghost" onClick={() => dialogOpen.set(false)}>Cancel</Button>
            <Button state="danger" onClick={() => dialogOpen.set(false)}>Delete</Button>
          </div>
        </Card>
      </Dialog>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Tooltip</SectionTitle>
      <div style="display: flex; gap: 16px;">
        <div style="position: relative; display: inline-block;">
          <Button variant="outline">Hover me</Button>
          <Tooltip style="position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 8px; white-space: nowrap;">
            This is a tooltip
          </Tooltip>
        </div>
      </div>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Popover</SectionTitle>
      <Popover style="padding: 16px; max-width: 280px;">
        <Title size="h5" style="margin-bottom: 8px;">Settings</Title>
        <Paragraph style="font-size: 13px; color: #6b7280;">Configure your notification preferences here.</Paragraph>
      </Popover>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Menu</SectionTitle>
      <Menu style="width: 200px;">
        <MenuItem>Profile</MenuItem>
        <MenuItem>Settings</MenuItem>
        <MenuItem>Help</MenuItem>
        <Divider />
        <MenuItem style="color: #ef4444;">Sign Out</MenuItem>
      </Menu>
    </div>
  )
}
