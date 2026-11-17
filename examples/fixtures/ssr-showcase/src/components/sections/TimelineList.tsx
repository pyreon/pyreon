/**
 * TimelineList — vertical list of cards with side image. Tests: two-column
 * responsive layout (image left, content right on md+; stacked on xs),
 * card hover, responsive image sizing.
 */

import { Image, Section, SectionHeader } from '../base'
import { element, text } from '../core'
import { timelineItems } from '../../content'

const List = element
  .attrs({ tag: 'ol', direction: 'rows', gap: 24 })
  .theme((t) => ({
    listStyle: 'none',
    padding: t.space.reset,
    margin: t.space.reset,
    maxWidth: 900,
    width: { xs: '90%', lg: '100%' },
  }))

const Item = element
  .attrs({ tag: 'li', direction: 'inline', alignY: 'center', gap: 24 })
  .theme((t) => ({
    padding: { xs: t.space.medium, md: t.space.large },
    borderWidth: t.borderWidth.base,
    borderStyle: t.borderStyle.base,
    borderColor: t.color.light.border,
    borderRadius: t.borderRadius.base,
    background: t.color.light.base,
    transition: t.transition.base,
    // Stack vertically on xs, side-by-side on md+
    flexDirection: { xs: 'column', md: 'row' },
    hover: {
      borderColor: t.color.primary.base,
    },
  }))

const ItemBody = element
  .attrs({ direction: 'rows', alignX: 'left' })
  .theme(() => ({
    flex: 1,
  }))

const ItemTitle = element
  .attrs({ tag: 'h3' })
  .theme((t) => ({
    fontFamily: t.fontFamily.base,
    fontSize: t.fontSize.medium,
    fontWeight: 600,
    margin: t.space.reset,
  }))

const ItemSubtitle = text.theme((t) => ({
  fontSize: t.fontSize.base,
  marginTop: t.space.xSmall,
  color: t.color.neutral.base,
}))

const ItemDate = text.theme((t) => ({
  fontSize: t.fontSize.small,
  marginTop: t.space.xSmall,
  color: t.color.neutral.base,
}))

const ItemDescription = text.theme((t) => ({
  fontSize: t.fontSize.base,
  marginTop: t.space.medium,
  lineHeight: t.lineHeight.base,
}))

const TimelineList = () => (
  <Section id="timeline-list">
    <SectionHeader title="Timeline">
      A vertical timeline with mixed-content cards. Each row flips from
      stacked (xs) to side-by-side (md+) — tests the responsive
      flexDirection swap.
    </SectionHeader>
    <List>
      {timelineItems.map((item) => (
        <Item>
          <Image seed={item.imageSeed} width={140} />
          <ItemBody>
            <ItemTitle>{item.title}</ItemTitle>
            <ItemSubtitle>{item.subtitle}</ItemSubtitle>
            <ItemDate>{item.date}</ItemDate>
            <ItemDescription>{item.description}</ItemDescription>
          </ItemBody>
        </Item>
      ))}
    </List>
  </Section>
)

TimelineList.displayName = 'sections/TimelineList'
export default TimelineList
