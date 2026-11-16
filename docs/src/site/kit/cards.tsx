import type { VNodeChild } from '@pyreon/core'
import { PyreonUI } from '@pyreon/ui-core'
import { font, gradient, motion, paper, radius, text, touch } from '../theme'
import { el, focusRing, tone, txt, type LinkAttrs } from './bases'
import { Glyph } from './glyph'
import { useLinkClick } from './link'
import { Eyebrow, Lede, renderInline } from './type'

const CardFrame = el
  .config({ name: 'GlowCard' })
  .attrs<LinkAttrs>({ block: true, contentAlignX: 'block', contentAlignY: 'block' })
  .theme((_t, m) => ({
    position: 'relative',
    height: '100%',
    minWidth: 0,
    borderRadius: radius.card,
    padding: 1,
    backgroundImage: `linear-gradient(180deg, ${tone(m, 'edgeA')}, ${tone(m, 'edgeB')})`,
    boxShadow: tone(m, 'cardShadow'),
    textDecoration: 'none',
    color: 'inherit',
    transition: `transform ${motion.hover}`,
    focus: focusRing(m),
  }))
  .variants((_t, m) => ({
    static: {},
    link: { hover: { backgroundImage: `linear-gradient(180deg, ${tone(m, 'lineHover')}, ${tone(m, 'edgeB')})` } },
  }))

const CardInner = el
  .config({ name: 'GlowCardSurface' })
  // Children stretch to the card's width and stack from the top (Element's
  // defaults are left / centre, which shrink-wraps code blocks and centres
  // short cards in an equal-height row).
  .attrs({ block: true, gap: 12, contentAlignX: 'block', contentAlignY: 'top' })
  .theme((_t, m) => ({
    height: '100%',
    minWidth: 0,
    borderRadius: radius.cardInner,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: tone(m, 'card'),
    backgroundImage: `radial-gradient(120% 80% at 0% 0%, ${tone(m, 'sheen')}, transparent 60%)`,
  }))
  .states((_t, m) => ({
    default: {},
    hot: { backgroundImage: `radial-gradient(90% 120% at 0% 0%, ${tone(m, 'glow')}, transparent 60%)` },
  }))
  .sizes(() => ({
    card: { padding: { xs: 24, sm: 32 } },
    compact: { paddingTop: 20, paddingBottom: 20, paddingLeft: 22, paddingRight: 22, gap: 6 },
    flush: { padding: 0, gap: 0 },
  }))

/**
 * `.card > .in` — 1px gradient border, 22px radius, inner highlight.
 * state: default | hot (ember glow). padding: card (32) | compact (22) | flush (0).
 * With `href` the whole card is one link.
 */
export function GlowCard(props: {
  state?: 'default' | 'hot' | undefined
  padding?: 'card' | 'compact' | 'flush' | undefined
  href?: string | undefined
  'aria-label'?: string | undefined
  children?: VNodeChild
}) {
  const click = useLinkClick()
  const href = props.href
  const inner = (
    <CardInner state={props.state ?? 'default'} size={props.padding ?? 'card'}>
      {props.children}
    </CardInner>
  )
  if (href === undefined) return <CardFrame variant="static">{inner}</CardFrame>
  return (
    <CardFrame tag="a" href={href} variant="link" aria-label={props['aria-label']} onClick={click(href)}>
      {inner}
    </CardFrame>
  )
}

const FootBox = el
  .config({ name: 'GlowCardFoot' })
  // margin-top: auto in the card's column: the foot sits on the card's bottom
  // edge, so cards of one row end on the same line whatever their text.
  .attrs({ block: true, gap: 14, contentAlignX: 'block' })
  .theme(() => ({ marginTop: 'auto', paddingTop: 6 }))

/** The foot's last line: a quiet label (the package name) on the left, the arrow on the right. */
const FootRow = el
  .config({ name: 'GlowCardFootRow' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignX: 'spaceBetween', contentAlignY: 'center', gap: 12 })
  .theme((_t, m) => ({ paddingTop: 12, borderTop: '1px solid', borderColor: tone(m, 'line'), minWidth: 0 }))

const FootArrow = txt
  .config({ name: 'GlowCardArrow' })
  .attrs({ tag: 'span', 'aria-hidden': 'true' })
  .theme((_t, m) => ({ display: 'block', flexShrink: 0, fontFamily: font.sans, fontSize: text.step.size, lineHeight: 1, color: tone(m, 'accent') }))

/**
 * The bottom of a linked card: an optional proof block (a number and what it
 * measures) and the card's arrow, pinned to the card's bottom edge. In a row
 * of equal-height cards a card with a proof number and one without both end
 * on their foot, so neither looks half empty. The arrow is decorative (the
 * whole card is the link).
 */
export function CardFoot(props: { label?: VNodeChild; children?: VNodeChild }) {
  return (
    <FootBox>
      {props.children}
      <FootRow>
        {props.label ?? <span />}
        <FootArrow>→</FootArrow>
      </FootRow>
    </FootBox>
  )
}

export { Glyph }

/** `<linearGradient id="eg">` for inline glyphs. Render once per page. */
export function EmberGradientDefs() {
  const [a, b, c] = gradient.glyphStops
  return (
    <svg width="0" height="0" style="position:absolute" aria-hidden="true">
      <defs>
        <linearGradient id="eg" x1="0" x2="1">
          <stop offset="0" stop-color={a} />
          <stop offset=".55" stop-color={b} />
          <stop offset="1" stop-color={c} />
        </linearGradient>
      </defs>
    </svg>
  )
}

const GlyphTile = el
  .config({ name: 'GlyphTile' })
  .attrs({ contentAlignX: 'center', contentAlignY: 'center' })
  .theme((_t, m) => ({
    width: 50,
    height: 50,
    flexShrink: 0,
    borderRadius: radius.tile,
    border: '1px solid',
    borderColor: tone(m, 'line2'),
    backgroundImage: `linear-gradient(180deg, ${tone(m, 'raised')}, ${tone(m, 'card')})`,
    color: tone(m, 'text'),
  }))

const TagBox = el.config({ name: 'ProductTag' }).attrs({ contentDirection: 'inline', contentAlignY: 'center', gap: 12 })

const MonoName = txt
  .config({ name: 'ProductTagName' })
  .attrs({ tag: 'div' })
  .theme((_t, m) => ({ fontFamily: font.mono, fontSize: text.small.size, color: tone(m, 'text') }))

/** `.p-tag` + `.p-tile` — glyph tile with package name and category. */
export function ProductTag(props: { glyph?: string | undefined; id?: string | undefined; name: string; category: string }) {
  return (
    <TagBox>
      <GlyphTile>
        <Glyph svg={props.glyph} id={props.id} size={28} />
      </GlyphTile>
      <div>
        <MonoName>{props.name}</MonoName>
        <Eyebrow>{props.category}</Eyebrow>
      </div>
    </TagBox>
  )
}

const PkgName = txt
  .config({ name: 'PackageName' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ fontFamily: font.mono, fontSize: 11.5, color: tone(m, 'accentText'), overflowWrap: 'anywhere' }))

/**
 * `.p-inside` — package (ember mono) · its role (eyebrow) · one line. The
 * handoff kit called the second prop `role`; it is `kind` here so it never
 * reads as an ARIA role.
 */
export function PackageCard(props: { pkg: string; kind: string; text: string; state?: 'default' | 'hot' | undefined }) {
  return (
    <GlowCard padding="compact" state={props.state}>
      <PkgName>{props.pkg}</PkgName>
      <Eyebrow>{props.kind}</Eyebrow>
      <Lede size="small">{renderInline(props.text)}</Lede>
    </GlowCard>
  )
}

const PaperBox = el
  .config({ name: 'DemoSurface' })
  .attrs({ block: true, gap: 12, contentAlignX: 'block', contentAlignY: 'top' })
  .theme(() => ({
    minWidth: 0,
    backgroundColor: paper.bg,
    color: paper.text,
    borderRadius: radius.demo,
    padding: { xs: 18, sm: 26 },
    fontFamily: font.system,
    boxShadow: paper.ring,
    // The demo app's own fields and buttons reach the tap-target height on touch screens.
    extendCss: `${touch.media} { & :is(input:not([type='checkbox']):not([type='radio']), select, button) { min-height: ${touch.tapTarget}px; } }`,
  }))

/**
 * `.ui` — the paper "real app" surface inside demos. Keeps its own light
 * palette in BOTH themes: a nested `<PyreonUI mode="light">` scopes
 * `data-theme="light"` to the subtree, so any kit or ui-components element
 * inside resolves its light values.
 */
export function DemoSurface(props: {
  'aria-label'?: string | undefined
  role?: string | undefined
  children?: VNodeChild
}) {
  return (
    <PyreonUI mode="light">
      <PaperBox role={props.role} aria-label={props['aria-label']}>
        {props.children}
      </PaperBox>
    </PyreonUI>
  )
}

/** Exposed for the contrast test: every fixed pair the paper surface uses. */
export const PAPER_PAIRS = [
  ['text', paper.text, paper.bg],
  ['mist', paper.mist, paper.bg],
  ['fog', paper.fog, paper.bg],
  ['err', paper.err, paper.bg],
  ['ok', paper.ok, paper.bg],
  ['accent button', paper.accentText, paper.accent],
] as const
