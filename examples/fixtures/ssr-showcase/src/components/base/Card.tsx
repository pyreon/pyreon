/**
 * Card — container with border, padding, responsive theme.
 * Tests: hover state (lift + shadow), borders, responsive padding.
 */

import { element, text } from '../core'

const Box = element
  .config({ name: 'base/Card' })
  .attrs({ tag: 'article', direction: 'rows' })
  .theme((t) => ({
    padding: { xs: t.space.medium, md: t.space.large },
    borderWidth: t.borderWidth.base,
    borderStyle: t.borderStyle.base,
    borderColor: t.color.light.border,
    borderRadius: t.borderRadius.base,
    background: t.color.light.base,
    color: t.color.dark.base,
    transition: t.transition.base,
    hover: {
      transform: 'translateY(-2px)',
      boxShadow: t.shadow.light.small,
    },
  }))

const Title = element
  .attrs({ tag: 'h3' })
  .theme((t) => ({
    fontFamily: t.fontFamily.base,
    fontSize: t.fontSize.large,
    fontWeight: 600,
    marginBottom: t.space.xSmall,
  }))

const Subtitle = text.theme((t) => ({
  fontSize: t.fontSize.base,
  marginBottom: t.space.medium,
  color: t.color.neutral.base,
}))

const Note = text.theme((t) => ({
  fontSize: t.fontSize.small,
  color: t.color.neutral.base,
  marginBottom: t.space.medium,
}))

const BulletList = element
  .attrs({ tag: 'ul', direction: 'rows', gap: 8 })
  .theme((t) => ({
    listStyle: 'disc',
    paddingLeft: t.space.large,
    margin: t.space.reset,
  }))

const BulletItem = element.attrs({ tag: 'li' }).theme((t) => ({
  fontSize: t.fontSize.base,
  lineHeight: t.lineHeight.base,
}))

type Props = {
  title: string
  subtitle?: string
  note?: string
  list?: string[]
}

const Card = (props: Props) => (
  <Box>
    <Title>{props.title}</Title>
    {props.subtitle ? <Subtitle>{props.subtitle}</Subtitle> : null}
    {props.note ? <Note>{props.note}</Note> : null}
    {props.list && props.list.length > 0 ? (
      <BulletList>
        {props.list.map((item) => (
          <BulletItem>{item}</BulletItem>
        ))}
      </BulletList>
    ) : null}
  </Box>
)

Card.displayName = 'base/Card'
export default Card
