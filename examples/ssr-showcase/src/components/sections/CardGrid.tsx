/**
 * CardGrid — expandable grid of cards with a Show/hide toggle.
 * Tests: signal-driven <Show> reactivity, responsive grid columns,
 * card hover lift + shadow, button hover state.
 */

import { Show } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { Background, Button, Card, Section, SectionHeader } from '../base'
import { element } from '../core'
import { workItems } from '../../content'

const Grid = element
  .attrs({ tag: 'div' })
  .theme((t) => ({
    display: 'grid',
    gridTemplateColumns: {
      xs: '1fr',
      md: 'repeat(2, 1fr)',
      lg: 'repeat(3, 1fr)',
    },
    gap: { xs: t.space.large, md: t.space.xLarge },
    maxWidth: 1200,
    width: { xs: '90%', lg: '100%' },
  }))

const ButtonRow = element
  .attrs({ alignX: 'center' })
  .theme((t) => ({
    marginTop: t.space.xLarge,
  }))

const firstBatch = workItems.slice(0, 3)
const restBatch = workItems.slice(3)

const CardGrid = () => {
  const expanded = signal(false)
  const toggle = () => expanded.set(!expanded())

  return (
    <Background variant="secondary">
      <Section id="card-grid">
        <SectionHeader title="Experience Cards">
          Each card uses a hover transition (lift + shadow). The "Show more"
          button is driven by a Pyreon signal — the Show component toggles
          the rest of the grid reactively without a full re-render.
        </SectionHeader>
        <Grid>
          {firstBatch.map((item) => (
            <Card
              title={item.role}
              subtitle={item.company}
              note={item.date}
              list={item.duties}
            />
          ))}
        </Grid>
        <Show when={() => expanded()}>
          <Grid>
            {restBatch.map((item) => (
              <Card
                title={item.role}
                subtitle={item.company}
                note={item.date}
                list={item.duties}
              />
            ))}
          </Grid>
        </Show>
        <ButtonRow>
          <Button onClick={toggle} data-testid="card-grid-toggle">
            <Show when={() => !expanded()}>Show more</Show>
            <Show when={() => expanded()}>Show less</Show>
          </Button>
        </ButtonRow>
      </Section>
    </Background>
  )
}

CardGrid.displayName = 'sections/CardGrid'
export default CardGrid
