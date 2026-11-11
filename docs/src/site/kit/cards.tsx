import type { VNodeChild } from '@pyreon/core'
import { PyreonUI } from '@pyreon/ui-core'
import { glyphHref } from '../nav'
import { font, gradient, motion, paper, radius, text } from '../theme'
import { el, focusRing, tone, txt, type LinkAttrs } from './bases'
import { useLinkClick } from './link'
import { Eyebrow, Lede } from './type'

const CardFrame = el
  .config({ name: 'GlowCard' })
  .attrs<LinkAttrs>({ block: true })
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
  .attrs({ block: true, gap: 12 })
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

/**
 * Product glyph. Either `id` (from the shared sprite, `public/brand/glyphs.svg`)
 * or `svg` (inner markup for a 120×120 viewBox from content JSON; `url(#eg)`
 * needs `<EmberGradientDefs />` once on the page). Decorative: aria-hidden.
 */
export function Glyph(props: { id?: string | undefined; svg?: string | undefined; size: number }) {
  if (props.svg !== undefined) {
    // Repo-owned build-time content (content/products/*.json), never user input.
    return (
      <svg
        width={props.size}
        height={props.size}
        viewBox="0 0 120 120"
        aria-hidden="true"
       
        dangerouslySetInnerHTML={{ __html: props.svg }}
      />
    )
  }
  return (
    <svg width={props.size} height={props.size} viewBox="0 0 120 120" aria-hidden="true">
      <use href={glyphHref(props.id ?? 'pyreon')} />
    </svg>
  )
}

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

/** `.p-inside` — package (ember mono) · role (eyebrow) · one line. */
export function PackageCard(props: { pkg: string; role: string; text: string; state?: 'default' | 'hot' | undefined }) {
  return (
    <GlowCard padding="compact" state={props.state}>
      <PkgName>{props.pkg}</PkgName>
      <Eyebrow>{props.role}</Eyebrow>
      <Lede size="small">{props.text}</Lede>
    </GlowCard>
  )
}

const PaperBox = el
  .config({ name: 'DemoSurface' })
  .attrs({ block: true, gap: 12 })
  .theme(() => ({
    minWidth: 0,
    backgroundColor: paper.bg,
    color: paper.text,
    borderRadius: radius.demo,
    padding: { xs: 18, sm: 26 },
    fontFamily: font.system,
    boxShadow: paper.ring,
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
