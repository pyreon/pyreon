import type { VNodeChild } from '@pyreon/core'
import { Show } from '@pyreon/core'
import { Container } from '@pyreon/coolgrid'
import { breakpoints, gradient, layout, section } from '../theme'
import { el, pair } from './bases'
import { Eyebrow, Heading, Lede, renderInline } from './type'

/** `.wrap` — the 1240px column with 40px gutters (16px on phones). */
export function Wrap(props: { children?: VNodeChild }) {
  return (
    <Container
      width={layout.maxWidth}
      css={{
        xs: `padding-left:${layout.gutter.xs}px;padding-right:${layout.gutter.xs}px;`,
        md: `padding-left:${layout.gutter.md}px;padding-right:${layout.gutter.md}px;`,
      }}
    >
      {props.children}
    </Container>
  )
}

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
        {props.title}
      </Heading>
      <Show when={() => !!props.text}>
        <Lede size="section">{renderInline(props.text ?? '')}</Lede>
      </Show>
    </HeadBox>
  )
}

const GridBox = el.config({ name: 'AutoGrid' }).attrs({ block: true }).theme(() => ({ display: 'grid' }))

/**
 * Responsive grid. `min` → `repeat(auto-fit, minmax(min(<min>px, 100%), 1fr))`;
 * `cols` → that many equal `minmax(0, 1fr)` columns from the `lg` breakpoint
 * (960px), one column below it. Columns never use bare `1fr`, so code and long
 * words cannot push the page wider than the screen.
 */
export function AutoGrid(props: {
  min?: number | undefined
  cols?: number | undefined
  gap?: number | undefined
  /** `cols` collapse to this many columns below `lg` (default 1). */
  colsBelow?: number | undefined
  tag?: 'div' | 'ul' | 'ol' | undefined
  role?: string | undefined
  children?: VNodeChild
}) {
  const gap = props.gap ?? 14
  const columns = props.cols
    ? `grid-template-columns:repeat(${props.colsBelow ?? 1},minmax(0,1fr));@media (min-width:${breakpoints.lg}px){grid-template-columns:repeat(${props.cols},minmax(0,1fr));}`
    : `grid-template-columns:repeat(auto-fit,minmax(min(${props.min ?? 250}px,100%),1fr));`
  const list = props.tag === 'ul' || props.tag === 'ol' ? 'list-style:none;margin:0;padding:0;' : ''
  return (
    <GridBox tag={props.tag ?? 'div'} role={props.role} css={`gap:${gap}px;${columns}${list}`}>
      {props.children}
    </GridBox>
  )
}

/** `.rule` — a hairline that fades out at both ends. */
export const Rule = el
  .config({ name: 'Rule' })
  .attrs({ tag: 'div', block: true, 'aria-hidden': 'true' })
  .theme((_t, m) => ({ height: 1, backgroundImage: pair(m, gradient.rule) }))
