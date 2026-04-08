import { attrs } from '@pyreon/attrs'
import { Element } from '@pyreon/elements'
import { Title, Paragraph } from '@pyreon/ui-components'

// 1. Basic .attrs() — static defaults injected into the component
const Box = attrs({ name: 'Box', component: Element }).attrs({
  direction: 'rows',
  alignX: 'center',
  alignY: 'center',
  block: true,
})

// 2. Chained .attrs() — multiple calls stack defaults left-to-right
const Badge = attrs({ name: 'Badge', component: Element })
  .attrs({ direction: 'inline', alignX: 'center', alignY: 'center' })
  .attrs({ gap: 4 })

const cardStyle = 'padding: 16px; background: #f3f4f6; border-radius: 8px; max-width: 320px; margin-bottom: 16px;'

export function AttrsBasicDemo() {
  return (
    <div>
      <Title size="h2" style="margin-bottom: 12px">Basic .attrs()</Title>
      <Paragraph style="margin-bottom: 24px">
        attrs(component).attrs(...) injects default props into a component. Multiple .attrs() calls stack left-to-right — later calls override earlier ones.
      </Paragraph>

      <Title size="h3" style="margin-bottom: 12px">Single .attrs()</Title>
      <Box style={cardStyle}>
        Box has direction="rows", alignX/Y="center", block=true baked in.
      </Box>

      <Title size="h3" style="margin-bottom: 12px">Chained .attrs()</Title>
      <Badge style={cardStyle}>
        Badge: direction="inline", alignX/Y="center", gap=4 — composed across two .attrs() calls.
      </Badge>
    </div>
  )
}
