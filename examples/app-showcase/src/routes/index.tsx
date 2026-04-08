import { RouterLink } from '@pyreon/router'
import { Card, Paragraph, Title } from '@pyreon/ui-components'
import { sections } from '../sections'

const stats = [
  { value: String(sections.length), label: 'Sections' },
  { value: String(sections.filter((s) => s.available).length), label: 'Available' },
  { value: '1', label: 'Zero app' },
  { value: '0', label: 'Build step (dev)' },
]

export default function HomePage() {
  return (
    <div style="padding: 48px 56px; max-width: 1080px;">
      <Title size="h1" style="margin-bottom: 12px">Pyreon App Showcase</Title>
      <Paragraph style="margin-bottom: 32px; font-size: 16px; color: #4b5563; max-width: 720px;">
        A single Pyreon Zero app hosting multiple real-world feature areas — todos, blog, dashboard,
        chat, kanban, forms, e-commerce, and more. Every section is built with the same stack and
        showcases a focused slice of the framework, so you can compare patterns side by side.
      </Paragraph>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; margin-bottom: 40px;">
        {stats.map((s) => (
          <div style="padding: 20px; background: white; border: 1px solid #e5e7eb; border-radius: 12px; text-align: center;">
            <div style="font-size: 32px; font-weight: 700; color: #4338ca; line-height: 1;">{s.value}</div>
            <div style="font-size: 13px; color: #6b7280; margin-top: 6px;">{s.label}</div>
          </div>
        ))}
      </div>

      <Title size="h2" style="margin-bottom: 16px">Sections</Title>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
        {sections.map((s) => {
          const cardStyle = `padding: 20px; height: 100%; opacity: ${s.available ? '1' : '0.6'};`
          const linkStyle = `display: block; text-decoration: none; color: inherit; ${s.available ? 'cursor: pointer;' : 'cursor: not-allowed;'}`
          const inner = (
            <Card style={cardStyle}>
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                <Title size="h3" style="color: #4338ca;">{s.label} {s.available ? '→' : ''}</Title>
                {s.available ? null : (
                  <span style="font-size: 10px; padding: 3px 8px; background: #f3f4f6; border-radius: 999px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">
                    soon
                  </span>
                )}
              </div>
              <Paragraph style="font-size: 14px; color: #4b5563; margin-bottom: 12px;">
                {s.tagline}
              </Paragraph>
              <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                {s.features.map((f) => (
                  <span style="font-size: 11px; padding: 2px 8px; background: #eef2ff; color: #4338ca; border-radius: 4px; font-family: ui-monospace, monospace;">
                    {f}
                  </span>
                ))}
              </div>
            </Card>
          )
          if (s.available) {
            return (
              <RouterLink to={s.path} style={linkStyle}>
                {inner}
              </RouterLink>
            )
          }
          return <div style={linkStyle}>{inner}</div>
        })}
      </div>

      <Paragraph style="margin-top: 32px; font-size: 13px; color: #9ca3af;">
        Each section ships in its own PR. Use the sidebar to jump between available sections.
      </Paragraph>
    </div>
  )
}

export const meta = {
  title: 'Pyreon App Showcase',
}
