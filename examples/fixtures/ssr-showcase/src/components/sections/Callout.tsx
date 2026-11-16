/**
 * Callout — centered text block with large typography.
 * Tests: responsive `fontSize` + `maxWidth`, centered layout.
 */

import { Section } from '../base'
import { element } from '../core'
import { loremMedium } from '../../content'

const Quote = element
  .attrs({ tag: 'blockquote', alignX: 'center' })
  .theme((t) => ({
    fontFamily: t.fontFamily.base,
    fontSize: { xs: t.fontSize.large, md: t.fontSize.xLarge },
    fontWeight: 300,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: t.lineHeight.base,
    maxWidth: { xs: '90%', md: 720 },
    margin: t.space.reset,
    color: t.color.neutral.base,
  }))

const Callout = () => (
  <Section>
    <Quote>{`"${loremMedium}"`}</Quote>
  </Section>
)

Callout.displayName = 'sections/Callout'
export default Callout
