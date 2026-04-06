import {
  Title,
  Badge,
  Chip,
  Card,
  Avatar,
  AvatarGroup,
  Kbd,
  Code,
  Highlight,
  Indicator,
  Divider,
  Paragraph,
  Timeline,
} from '@pyreon/ui-components'

function SectionTitle(props: { children: any }) {
  return <Title size="h3" style="margin: 24px 0 12px;">{props.children}</Title>
}

function Row(props: { children: any }) {
  return <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 16px;">{props.children}</div>
}

export function DataDisplaySection() {
  return (
    <div>
      <Title size="h2">Data Display</Title>

      <SectionTitle>Badges</SectionTitle>
      <Row>
        <Badge state="primary">Primary</Badge>
        <Badge state="secondary">Secondary</Badge>
        <Badge state="success">Success</Badge>
        <Badge state="error">Error</Badge>
        <Badge state="warning">Warning</Badge>
      </Row>
      <Row>
        <Badge variant="outline" state="primary">Outline</Badge>
        <Badge variant="subtle" state="success">Subtle</Badge>
      </Row>
      <Row>
        <Badge size="sm">Small</Badge>
        <Badge size="md">Medium</Badge>
        <Badge size="lg">Large</Badge>
      </Row>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Chips</SectionTitle>
      <Row>
        <Chip state="primary">React</Chip>
        <Chip state="success">Pyreon</Chip>
        <Chip state="error">Deprecated</Chip>
        <Chip variant="outline" state="primary">Outline</Chip>
      </Row>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Cards</SectionTitle>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; margin-bottom: 16px;">
        <Card variant="elevated">
          <Title size="h4">Elevated Card</Title>
          <Paragraph>With box shadow for depth.</Paragraph>
        </Card>
        <Card variant="outline">
          <Title size="h4">Outline Card</Title>
          <Paragraph>With border for subtle containment.</Paragraph>
        </Card>
        <Card variant="filled">
          <Title size="h4">Filled Card</Title>
          <Paragraph>With background fill.</Paragraph>
        </Card>
      </div>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Avatars</SectionTitle>
      <Row>
        <Avatar size="xs">A</Avatar>
        <Avatar size="sm">B</Avatar>
        <Avatar size="md">C</Avatar>
        <Avatar size="lg">D</Avatar>
        <Avatar size="xl">E</Avatar>
      </Row>

      <SectionTitle>Avatar Group</SectionTitle>
      <Row>
        <AvatarGroup>
          <Avatar size="md">A</Avatar>
          <Avatar size="md">B</Avatar>
          <Avatar size="md">C</Avatar>
          <Avatar size="md">+3</Avatar>
        </AvatarGroup>
      </Row>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Keyboard Shortcuts</SectionTitle>
      <Row>
        <span>Save: <Kbd>Ctrl</Kbd> + <Kbd>S</Kbd></span>
        <span>Undo: <Kbd>Ctrl</Kbd> + <Kbd>Z</Kbd></span>
        <span>Search: <Kbd>/</Kbd></span>
      </Row>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Code</SectionTitle>
      <Paragraph>
        Install with <Code variant="inline">bun add @pyreon/ui-components</Code> and import what you need.
      </Paragraph>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Highlight</SectionTitle>
      <Paragraph>
        This is <Highlight>highlighted text</Highlight> and this is{' '}
        <Highlight state="success">success highlighted</Highlight> and{' '}
        <Highlight state="error">error highlighted</Highlight>.
      </Paragraph>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Indicator</SectionTitle>
      <Row>
        <div style="position: relative; display: inline-block;">
          <Avatar size="lg">U</Avatar>
          <Indicator state="success" size="md" style="position: absolute; top: 0; right: 0;" />
        </div>
        <div style="position: relative; display: inline-block;">
          <Avatar size="lg">A</Avatar>
          <Indicator state="error" size="md" style="position: absolute; top: 0; right: 0;" />
        </div>
      </Row>
    </div>
  )
}
