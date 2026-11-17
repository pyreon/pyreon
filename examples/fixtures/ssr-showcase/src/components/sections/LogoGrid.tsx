/**
 * LogoGrid — responsive grid of logo images. Tests: CSS grid with
 * responsive column count + gap, many images loading, object-fit on
 * circular (border-radius: 50%) images.
 */

import { Background, Image, Section, SectionHeader } from '../base'
import { element } from '../core'
import { logos } from '../../content'

const Grid = element
  .attrs({ tag: 'ul' })
  .theme((t) => ({
    display: 'grid',
    gridTemplateColumns: {
      xs: 'repeat(3, 1fr)',
      sm: 'repeat(4, 1fr)',
      md: 'repeat(5, 1fr)',
      lg: 'repeat(10, 1fr)',
    },
    gap: { xs: t.space.medium, md: t.space.large },
    listStyle: 'none',
    padding: t.space.reset,
    margin: t.space.reset,
    maxWidth: 1200,
    width: { xs: '90%', lg: '100%' },
  }))

const LogoItem = element
  .attrs({ tag: 'li', alignX: 'center', alignY: 'center' })
  .theme(() => ({
    aspectRatio: '1 / 1',
  }))

const LogoGrid = () => (
  <Background variant="secondary">
    <Section id="logo-grid">
      <SectionHeader title="Partners & Clients">
        A grid of random logo placeholders to exercise image loading and
        responsive grid columns. Resize the window to see the column count
        flex through breakpoints.
      </SectionHeader>
      <Grid>
        {logos.map((logo) => (
          <LogoItem>
            <Image seed={logo.seed} width={120} alt={logo.name} circle />
          </LogoItem>
        ))}
      </Grid>
    </Section>
  </Background>
)

LogoGrid.displayName = 'sections/LogoGrid'
export default LogoGrid
