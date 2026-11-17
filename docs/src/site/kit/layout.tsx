import { Show } from '@pyreon/core'
import { gradient, section } from '../theme'
import { el, pair } from './bases'
import { Eyebrow, Heading, Lede, renderInline } from './type'

/**
 * Vertical rhythm. size: default (120/120) | tight (20/120, every section
 * after the first on a product page) | hero (160/80) | end (120/140, centred).
 */
export const Section = el
  .config({ name: 'Section' })
  .attrs({ tag: 'section', block: true, contentAlignX: 'block' })
  .theme(() => ({
    position: 'relative',
    paddingTop: { xs: section.padYMobile, md: section.padY },
    paddingBottom: { xs: section.padYMobile, md: section.padY },
  }))
  .sizes(() => ({
    default: {},
    tight: { paddingTop: section.tightTop },
    hero: {
      paddingTop: { xs: section.heroTopMobile, md: section.heroTop },
      paddingBottom: section.heroBottom,
      overflow: 'hidden',
    },
    end: { paddingBottom: { xs: section.padY, md: section.endBottom }, textAlign: 'center' },
  }))

const HeadBox = el
  .config({ name: 'SectionHeadBox' })
  .attrs({ block: true })
  .theme(() => ({ maxWidth: 860, marginBottom: section.headGap }))
  .states(() => ({ default: {}, center: { marginLeft: 'auto', marginRight: 'auto', textAlign: 'center' } }))

/** `.head` — eyebrow, h2 and an optional paragraph. */
export function SectionHead(props: {
  label: string
  title: string
  text?: string | undefined
  level?: 'product' | 'landing' | undefined
  align?: 'start' | 'center' | undefined
  id?: string | undefined
}) {
  return (
    <HeadBox state={props.align === 'center' ? 'center' : 'default'}>
      <Eyebrow>{props.label}</Eyebrow>
      <Heading tag="h2" id={props.id} size={props.level === 'landing' ? 'landingSection' : 'section'}>
        {renderInline(props.title)}
      </Heading>
      <Show when={() => !!props.text}>
        <Lede size="section">{renderInline(props.text ?? '')}</Lede>
      </Show>
    </HeadBox>
  )
}

/** `.rule` — a hairline that fades out at both ends. */
export const Rule = el
  .config({ name: 'Rule' })
  .attrs({ tag: 'div', block: true, 'aria-hidden': 'true' })
  .theme((_t, m) => ({ height: 1, backgroundImage: pair(m, gradient.rule) }))
