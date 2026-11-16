/**
 * SectionHeader — centered heading + paragraph block used above each
 * section's body. Tests responsive `marginBottom` and `maxWidth`.
 */

import { element, text } from '../core'

const Wrapper = element
  .config({ name: 'base/SectionHeader' })
  .attrs({ tag: 'header', contentAlignX: 'center' })
  .theme((t) => ({
    marginBottom: { xs: t.space.large, md: t.space.xLarge },
    maxWidth: { xs: '90%', lg: '70%', xxl: 996 },
  }))

const Title = element
  .attrs({ tag: 'h2' })
  .theme((t) => ({
    fontFamily: t.fontFamily.base,
    fontSize: { xs: t.fontSize.xLarge, md: t.fontSize.xxLarge },
    fontWeight: 600,
    marginBottom: { xs: t.space.medium, md: t.space.large },
    textAlign: 'center',
  }))

const Body = text.theme((t) => ({
  fontSize: { xs: t.fontSize.base, md: t.fontSize.medium },
  lineHeight: t.lineHeight.base,
}))

import type { VNodeChild } from '@pyreon/core'

type Props = {
  title: string
  children?: VNodeChild
}

const SectionHeader = (props: Props) => (
  <Wrapper>
    <Title>{props.title}</Title>
    <Body multiple={['centered']}>{props.children}</Body>
  </Wrapper>
)

SectionHeader.displayName = 'base/SectionHeader'
export default SectionHeader
