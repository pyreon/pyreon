import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { PyreonUI } from '@pyreon/ui-core'
import { font, gradient, inset, paper, radius, text, touch } from '../theme'
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
    card: { padding: inset.card },
    compact: { paddingTop: inset.compactY, paddingBottom: inset.compactY, paddingLeft: inset.compact, paddingRight: inset.compact, gap: 6 },
    stat: { paddingTop: inset.compactY, paddingBottom: inset.compactY, paddingLeft: inset.stat, paddingRight: inset.stat, gap: 6 },
    flush: { padding: 0, gap: 0 },
  }))

/**
 * `.card > .in` — 1px gradient border, 22px radius, inner highlight.
 * state: default | hot (ember glow). padding: card (`inset.card`) | compact
 * (`inset.compact`) | stat (`inset.stat`) | flush (0): every child shares
 * that one inset, none bleeds into it.
 * With `href` the whole card is one link: one tab stop with the focus ring,
 * nothing interactive inside it (a tag or a link inside a card makes the
 * card static). Its hover lifts the edge colour only, no motion.
 */
export function GlowCard(props: {
  state?: 'default' | 'hot' | undefined
  padding?: 'card' | 'compact' | 'stat' | 'flush' | undefined
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
  // `data-card`: the e2e finds every card (and every linked card: `a[data-card]`) by it.
  if (href === undefined) {
    return (
      <CardFrame variant="static" data-card="">
        {inner}
      </CardFrame>
    )
  }
  return (
    <CardFrame tag="a" href={href} variant="link" aria-label={props['aria-label']} onClick={click(href)} data-card="">
      {inner}
    </CardFrame>
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

const PackageNameBase = txt
  .config({ name: 'PackageName' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ fontFamily: font.mono, fontSize: text.caveat.size, color: tone(m, 'accentText'), overflowWrap: 'anywhere' }))
  .multiple(() => ({ block: { display: 'block' } }))

/** A package or identifier name in a card (mono, accent): one style for every card that prints one. `block`: on its own line. */
export function PackageName(props: { block?: boolean | undefined; children?: VNodeChild }) {
  return h(PackageNameBase, { multiple: props.block ? ['block'] : [] }, props.children)
}

/**
 * `.p-inside` — package (ember mono) · its role (eyebrow) · one line. The
 * handoff kit called the second prop `role`; it is `kind` here so it never
 * reads as an ARIA role.
 */
export function PackageCard(props: { pkg: string; kind: string; text: string; state?: 'default' | 'hot' | undefined }) {
  return (
    <GlowCard padding="compact" state={props.state}>
      <PackageName>{props.pkg}</PackageName>
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
