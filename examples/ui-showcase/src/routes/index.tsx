import { Title, Paragraph } from '@pyreon/ui-components'

export default function HomePage() {
  return (
    <div>
      <Title size="h1">Pyreon UI Showcase</Title>
      <Paragraph style="margin-top: 16px;">
        Browse the sidebar to see all UI component demos. Built with the Pyreon Zero stack —
        file-based routing, SSR, signals, and rocketstyle theming.
      </Paragraph>
    </div>
  )
}

export const meta = {
  title: 'Pyreon UI Showcase',
}
