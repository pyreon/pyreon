/**
 * BadgeGrid — flexbox wrap of text badges with hover state.
 * Tests: flex-wrap, responsive gap, hover transitions on every child.
 */

import { Section, SectionHeader } from '../base'
import { element } from '../core'
import { badges } from '../../content'

const Wrap = element
  .attrs({ tag: 'ul', alignX: 'center' })
  .theme((t) => ({
    display: 'flex',
    flexWrap: 'wrap',
    gap: { xs: t.space.small, md: t.space.medium },
    listStyle: 'none',
    padding: t.space.reset,
    margin: t.space.reset,
    maxWidth: 1200,
    width: { xs: '90%', lg: '100%' },
  }))

const Badge = element
  .attrs({ tag: 'li' })
  .theme((t) => ({
    paddingX: t.space.medium,
    paddingY: t.space.xSmall,
    fontFamily: t.fontFamily.base,
    fontSize: t.fontSize.small,
    fontWeight: 500,
    borderRadius: t.borderRadius.base,
    borderWidth: t.borderWidth.base,
    borderStyle: t.borderStyle.base,
    borderColor: t.color.light.border,
    background: t.color.light.base,
    color: t.color.dark.base,
    transition: t.transition.base,
    hover: {
      background: t.color.primary.base,
      color: t.color.light.base,
      borderColor: t.color.primary.base,
    },
  }))

const BadgeGrid = () => (
  <Section id="badge-grid">
    <SectionHeader title="Skills & Tags">
      A responsive badge row. Hover any badge — the color swap tests the
      hover theme pipeline (base + hover via makeItResponsive, inside
      @layer rocketstyle).
    </SectionHeader>
    <Wrap>
      {badges.map((label) => (
        <Badge>{label}</Badge>
      ))}
    </Wrap>
  </Section>
)

BadgeGrid.displayName = 'sections/BadgeGrid'
export default BadgeGrid
