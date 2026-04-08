import { attrs, isAttrsComponent } from '@pyreon/attrs'
import { Element } from '@pyreon/elements'
import { Title, Paragraph } from '@pyreon/ui-components'

// 1. .config({ name }) — rename/swap component, preserve chain
const Box = attrs({ name: 'Box', component: Element }).attrs({
  direction: 'rows',
  alignX: 'center',
  alignY: 'center',
  block: true,
})

const Card = Box.config({ name: 'Card' }).attrs({ gap: 8 })
const InfoCard = Card.config({ name: 'InfoCard' }).attrs({ gap: 12 })

// 2. .statics() — attach metadata via .meta
const MetaBox = attrs({ name: 'MetaBox', component: Element })
  .attrs({ direction: 'rows', block: true })
  .statics({ category: 'layout', version: '2.0', tags: ['box', 'container'] })

const cardStyle = 'padding: 16px; background: #f3f4f6; border-radius: 8px; max-width: 360px; margin-bottom: 16px;'

export function AttrsConfigStaticsDemo() {
  const isAttrs = isAttrsComponent(Box)
  const meta = (MetaBox as unknown as { meta: Record<string, unknown> }).meta

  return (
    <div>
      <Title size="h2" style="margin-bottom: 12px">.config(), .statics(), isAttrsComponent()</Title>
      <Paragraph style="margin-bottom: 24px">
        `.config()` immutably branches a component (rename, swap inner). `.statics()` attaches metadata. `isAttrsComponent()` is a runtime type guard.
      </Paragraph>

      <Title size="h3" style="margin-bottom: 12px">.config() — immutable branching</Title>
      <Box style={cardStyle}>Box (original)</Box>
      <Card style={cardStyle}>Card (extends Box, gap=8)</Card>
      <InfoCard style={cardStyle}>InfoCard (extends Card, gap=12)</InfoCard>

      <Title size="h3" style="margin-bottom: 12px">.statics() — attached metadata</Title>
      <MetaBox style={cardStyle}>
        MetaBox.meta = {JSON.stringify(meta)}
      </MetaBox>

      <Title size="h3" style="margin-bottom: 12px">isAttrsComponent()</Title>
      <Paragraph>
        `isAttrsComponent(Box)` returns: <strong>{String(isAttrs)}</strong>
      </Paragraph>
    </div>
  )
}
