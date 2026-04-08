import { RouterLink } from '@pyreon/router'
import { Card, Paragraph, Title } from '@pyreon/ui-components'

const stats = [
  { value: '75', label: 'UI Components' },
  { value: '122', label: 'Animation Presets' },
  { value: '25+', label: 'Hooks' },
  { value: '38', label: 'Component Demos' },
  { value: '11', label: 'Categories' },
  { value: '0', label: 'Build Step (dev)' },
]

const featured = [
  {
    title: 'UI Components',
    desc: '75 production-ready components: Button, Input, Card, Modal, Combobox, Calendar, Table, and more.',
    path: '/button',
  },
  {
    title: 'Animations',
    desc: '122 ready-made presets, factories, composition utilities, group/stagger/collapse modes.',
    path: '/animations/gallery',
  },
  {
    title: 'Hooks',
    desc: 'Interaction, state, DOM observers, responsive — all signal-based and SSR-safe.',
    path: '/hooks/interaction',
  },
  {
    title: 'Composition',
    desc: 'Attrs HOC factory and rocketstyle multi-state styling — the building blocks under every component.',
    path: '/composition/attrs-basic',
  },
  {
    title: 'Styling',
    desc: 'CSS-in-JS via styled() tagged templates, css fragments, keyframes, theme variables.',
    path: '/styler',
  },
  {
    title: 'Layout',
    desc: 'Box, Stack, Group, Center, Divider, Breadcrumb, ButtonGroup, plus 12-col responsive Grid.',
    path: '/box',
  },
]

const cardStyle =
  'padding: 20px; min-height: 140px; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; text-decoration: none; color: inherit; display: block;'

export default function HomePage() {
  return (
    <div>
      <Title size="h1" style="margin-bottom: 12px">Pyreon UI Showcase</Title>
      <Paragraph style="margin-bottom: 32px; font-size: 16px; color: #4b5563;">
        A live catalog of every UI primitive, component, hook, and animation in the Pyreon framework.
        Built with the Pyreon Zero stack — file-based routing, SSR, signals, and rocketstyle theming.
      </Paragraph>

      {/* Stats grid */}
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; margin-bottom: 40px;">
        {stats.map((s) => (
          <div style="padding: 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; text-align: center;">
            <div style="font-size: 32px; font-weight: 700; color: #0070f3; line-height: 1;">{s.value}</div>
            <div style="font-size: 13px; color: #6b7280; margin-top: 6px;">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Featured categories */}
      <Title size="h2" style="margin-bottom: 16px">Browse by category</Title>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 32px;">
        {featured.map((f) => (
          <RouterLink to={f.path} style={cardStyle}>
            <Card style="height: 100%;">
              <Title size="h3" style="margin-bottom: 8px; color: #0070f3;">{f.title} →</Title>
              <Paragraph style="font-size: 14px; color: #4b5563;">{f.desc}</Paragraph>
            </Card>
          </RouterLink>
        ))}
      </div>

      <Paragraph style="font-size: 13px; color: #9ca3af;">
        Use the sidebar to navigate. Every component, primitive, and hook has its own page.
      </Paragraph>
    </div>
  )
}

export const meta = {
  title: 'Pyreon UI Showcase',
}
