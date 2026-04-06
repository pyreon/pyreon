import {
  ActionIcon,
  Button,
  CloseButton,
  IconButton,
  Title,
  Paragraph,
  Divider,
  Badge,
} from '@pyreon/ui-components'

function SectionTitle(props: { children: any }) {
  return <Title size="h3" style="margin: 24px 0 12px;">{props.children}</Title>
}

function Row(props: { children: any; label?: string }) {
  return (
    <div style="margin-bottom: 16px;">
      {props.label && <Paragraph style="color: #6b7280; font-size: 13px; margin-bottom: 8px;">{props.label}</Paragraph>}
      <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
        {props.children}
      </div>
    </div>
  )
}

export function ButtonsSection() {
  return (
    <div>
      <Title size="h2">Buttons</Title>

      <SectionTitle>States</SectionTitle>
      <Row>
        <Button state="primary">Primary</Button>
        <Button state="secondary">Secondary</Button>
        <Button state="danger">Danger</Button>
        <Button state="success">Success</Button>
      </Row>

      <SectionTitle>Variants</SectionTitle>
      <Row>
        <Button variant="solid" state="primary">Solid</Button>
        <Button variant="outline" state="primary">Outline</Button>
        <Button variant="subtle" state="primary">Subtle</Button>
        <Button variant="ghost" state="primary">Ghost</Button>
        <Button variant="link" state="primary">Link</Button>
      </Row>

      <SectionTitle>Sizes</SectionTitle>
      <Row>
        <Button size="xs" state="primary">Extra Small</Button>
        <Button size="sm" state="primary">Small</Button>
        <Button size="md" state="primary">Medium</Button>
        <Button size="lg" state="primary">Large</Button>
        <Button size="xl" state="primary">Extra Large</Button>
      </Row>

      <SectionTitle>With Icons</SectionTitle>
      <Row>
        <Button state="primary" beforeContent="+">{() => 'Add Item'}</Button>
        <Button state="secondary" afterContent={<Badge state="primary" size="sm">3</Badge>}>
          {() => 'Notifications'}
        </Button>
      </Row>

      <SectionTitle>Disabled</SectionTitle>
      <Row>
        <Button state="primary" disabled>Disabled Primary</Button>
        <Button variant="outline" disabled>Disabled Outline</Button>
      </Row>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Icon Buttons</SectionTitle>
      <Row>
        <IconButton size="xs">x</IconButton>
        <IconButton size="sm">+</IconButton>
        <IconButton size="md">...</IconButton>
        <IconButton size="lg">?</IconButton>
      </Row>

      <SectionTitle>Close Button</SectionTitle>
      <Row>
        <CloseButton size="sm">x</CloseButton>
        <CloseButton size="md">x</CloseButton>
        <CloseButton size="lg">x</CloseButton>
      </Row>

      <SectionTitle>Action Icons</SectionTitle>
      <Row>
        <ActionIcon state="primary" variant="filled">+</ActionIcon>
        <ActionIcon state="primary" variant="outline">+</ActionIcon>
        <ActionIcon state="primary" variant="subtle">+</ActionIcon>
        <ActionIcon state="danger" variant="filled">x</ActionIcon>
      </Row>
    </div>
  )
}
