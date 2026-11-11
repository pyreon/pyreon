import type { VNodeChild } from '@pyreon/core'
import { For, Show } from '@pyreon/core'
import { breakpoints, clampSize, color, display, font, gradient, radius, text, texture, weight } from '../theme'
import { el, pair, tone, txt, type LinkAttrs } from './bases'
import { Pill } from './controls'
import { Eyebrow, renderInline } from './type'

/**
 * "Punch" surfaces from the marketing set (unified theme [A4] [A6b] [C3] [C4]):
 * the big-number proof band, the hook hero headline and the quote block. They
 * share the scanline texture (masked to fade out) and the corner flare.
 *
 * `visual-alignment.md` (the full spec for these) did not exist when they
 * were built (2026-11-11); they follow the unified theme's tokens and the
 * marketing cards in 07-graphics/out (G-bundle-4x-react, G-once-code-diff),
 * and await the final spec.
 */
const punchCss = (m: Parameters<typeof tone>[0]) => `
  isolation: isolate;
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background: linear-gradient(${tone(m, 'scanline')} 1px, transparent 1px) 0 0 / ${texture.scanlineSize};
    opacity: ${pair(m, texture.scanlineOpacity)};
    -webkit-mask-image: ${texture.scanlineMask};
    mask-image: ${texture.scanlineMask};
  }
  &::after {
    content: '';
    position: absolute;
    z-index: -1;
    pointer-events: none;
    top: -40%;
    right: -20%;
    width: 70%;
    height: 120%;
    background: ${pair(m, gradient.flare)};
  }
`

const Band = el
  .config({ name: 'ProofBand' })
  .attrs({ tag: 'section', block: true, gap: 28 })
  .theme((_t, m) => ({
    position: 'relative',
    overflow: 'hidden',
    minWidth: 0,
    borderRadius: radius.proof,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'card'),
    paddingTop: { xs: 32, md: 48 },
    paddingBottom: { xs: 28, md: 40 },
    paddingLeft: { xs: 22, md: 48 },
    paddingRight: { xs: 22, md: 48 },
    extendCss: punchCss(m),
  }))

const BandTitle = txt
  .config({ name: 'ProofBandTitle' })
  .attrs({ tag: 'h2' })
  .theme((_t, m) => ({
    margin: 0,
    fontFamily: font.sans,
    fontSize: text.card.size,
    lineHeight: text.card.lineHeight,
    letterSpacing: text.card.tracking,
    fontWeight: weight.medium,
    color: tone(m, 'text'),
  }))

const Items = el
  .config({ name: 'ProofBandItems' })
  .attrs({ tag: 'dl', block: true })
  .theme(() => ({
    margin: 0,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: { xs: 28, md: 40 },
  }))

const Item = el.config({ name: 'ProofBandItem' }).attrs({ block: true, gap: 10, contentAlignY: 'top' }).theme(() => ({ minWidth: 0 }))

/** A huge gradient numeral (700, -.06em). Light mode uses the AA-safe stops. */
export const Numeral = el
  .config({ name: 'Numeral' })
  .attrs({ tag: 'dd' })
  .theme((_t, m) => ({
    order: 0,
    margin: 0,
    fontFamily: font.sans,
    fontSize: clampSize(display.numeral),
    lineHeight: display.numeral.lineHeight,
    letterSpacing: display.numeral.tracking,
    fontWeight: display.numeral.weight,
    backgroundImage: pair(m, gradient.ember),
    backgroundClip: 'text',
    color: 'transparent',
    paddingBottom: '0.06em',
    extendCss: '-webkit-background-clip: text; font-variant-numeric: tabular-nums; white-space: nowrap;',
  }))
  .sizes(() => ({ default: {}, compact: { fontSize: 'clamp(48px, 6vw, 88px)' } }))

const ItemLabel = el
  .config({ name: 'ProofBandLabel' })
  .attrs({ tag: 'dt' })
  .theme((_t, m) => ({
    order: 1,
    maxWidth: 360,
    fontFamily: font.sans,
    fontSize: text.small.size,
    lineHeight: text.small.lineHeight,
    color: tone(m, 'mist'),
  }))

/** The caveat line under any benchmark number: mono, fog, middot-separated. [A8] */
export const Caveat = txt
  .config({ name: 'Caveat' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({
    order: 2,
    margin: 0,
    fontFamily: font.mono,
    fontSize: text.caveat.size,
    letterSpacing: text.caveat.tracking,
    lineHeight: 1.5,
    color: tone(m, 'fog'),
  }))

const BandFoot = el
  .config({ name: 'ProofBandFoot' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignX: 'spaceBetween', contentAlignY: 'center', gap: 14 })
  .theme((_t, m) => ({ flexWrap: 'wrap', paddingTop: 20, borderTop: '1px solid', borderColor: tone(m, 'line') }))

export interface ProofItem {
  stat: string
  label: string
  /** Where the number comes from (record + section). */
  source: string
  /** Run condition ("one run", "two runs"); shown with the source. */
  condition?: string | undefined
}

/**
 * The big-number proof band: up to three gradient numerals, each with what
 * it measures and where it is from. Every number on the site carries its
 * source; a band never shows more than three.
 */
export function ProofBand(props: {
  items: readonly ProofItem[]
  title?: string | undefined
  caveat?: string | undefined
  link?: { label: string; href: string } | undefined
  id?: string | undefined
}) {
  const items = props.items.slice(0, 3)
  return (
    <Band id={props.id} aria-label={props.title ?? 'Proof'}>
      <Show when={() => !!props.title}>
        <BandTitle>{props.title}</BandTitle>
      </Show>
      <Items css={`@media (min-width: ${breakpoints.md}px) { grid-template-columns: repeat(${items.length}, minmax(0, 1fr)); }`}>
        <For each={items} by={(i) => i.stat + i.label}>
          {(i) => (
            <Item>
              <ItemLabel>{renderInline(i.label)}</ItemLabel>
              <Numeral size={items.length > 2 ? 'compact' : 'default'}>{i.stat}</Numeral>
              <Caveat>{i.condition ? `${i.source} · ${i.condition}` : i.source}</Caveat>
            </Item>
          )}
        </For>
      </Items>
      <Show when={() => !!props.caveat || !!props.link}>
        <BandFoot>
          <Caveat>{props.caveat ?? ''}</Caveat>
          {props.link ? <Pill href={props.link.href}>{props.link.label}</Pill> : null}
        </BandFoot>
      </Show>
    </Band>
  )
}

// ─── Hook hero ────────────────────────────────────────────────────────────

const HookTitle = txt
  .config({ name: 'HookTitle' })
  .attrs({ tag: 'h1' })
  .theme((_t, m) => ({
    margin: 0,
    marginTop: 24,
    marginBottom: 24,
    maxWidth: 1000,
    fontFamily: font.sans,
    fontSize: clampSize(display.hook),
    lineHeight: display.hook.lineHeight,
    letterSpacing: display.hook.tracking,
    fontWeight: display.hook.weight,
    color: tone(m, 'strong'),
    textWrap: 'balance',
    overflowWrap: 'break-word',
  }))

const EmberWord = txt
  .config({ name: 'EmberWord' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({
    backgroundImage: pair(m, gradient.ember),
    backgroundClip: 'text',
    color: 'transparent',
    extendCss: '-webkit-background-clip: text; -webkit-box-decoration-break: clone; box-decoration-break: clone;',
  }))

/** Split a headline around its one ember word (first occurrence; case-sensitive). */
export function splitEmber(title: string, word: string): [string, string, string] {
  const i = word ? title.indexOf(word) : -1
  if (i < 0) return [title, '', '']
  return [title.slice(0, i), word, title.slice(i + word.length)]
}

/**
 * The hook hero headline (marketing device [C3]): bold, tight, one word in
 * the ember gradient. Renders the `<h1>`; the page supplies lede and CTAs.
 */
export function HookHero(props: { eyebrow?: string | undefined; title: string; emberWord: string; children?: VNodeChild }) {
  const [before, word, after] = splitEmber(props.title, props.emberWord)
  return (
    <div>
      <Show when={() => !!props.eyebrow}>
        <Eyebrow>{props.eyebrow}</Eyebrow>
      </Show>
      <HookTitle>
        {before}
        {word ? <EmberWord>{word}</EmberWord> : null}
        {after}
      </HookTitle>
      {props.children}
    </div>
  )
}

// ─── Quote block ──────────────────────────────────────────────────────────

const QuoteBox = el
  .config({ name: 'QuoteBlock' })
  .attrs({ tag: 'figure', block: true, gap: 22 })
  .theme((_t, m) => ({
    position: 'relative',
    overflow: 'hidden',
    margin: 0,
    borderRadius: radius.proof,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'card'),
    paddingTop: { xs: 32, md: 56 },
    paddingBottom: { xs: 28, md: 44 },
    paddingLeft: { xs: 22, md: 56 },
    paddingRight: { xs: 22, md: 56 },
    extendCss: punchCss(m),
  }))

const QuoteText = txt
  .config({ name: 'QuoteText' })
  .attrs({ tag: 'blockquote' })
  .theme((_t, m) => ({
    margin: 0,
    maxWidth: 980,
    fontFamily: font.sans,
    fontSize: clampSize(display.quote),
    lineHeight: display.quote.lineHeight,
    letterSpacing: display.quote.tracking,
    fontWeight: display.quote.weight,
    color: tone(m, 'strong'),
    textWrap: 'balance',
  }))

const QuoteBy = txt
  .config({ name: 'QuoteAttribution' })
  .attrs({ tag: 'figcaption' })
  .theme((_t, m) => ({ fontFamily: font.mono, fontSize: text.caveat.size, letterSpacing: '.04em', color: tone(m, 'fog') }))

const QuoteLink = el
  .config({ name: 'QuoteLink' })
  .attrs<LinkAttrs>({ tag: 'a' })
  .theme((_t, m) => ({ color: tone(m, 'mist'), textDecoration: 'underline', extendCss: 'text-underline-offset: 3px;' }))

/** A large pull quote with its attribution (a document or the record, never an invented person). [C4] */
export function QuoteBlock(props: { text: string; attribution: string; href?: string | undefined }) {
  return (
    <QuoteBox>
      <QuoteText>{renderInline(props.text)}</QuoteText>
      <QuoteBy>
        {'— '}
        {props.href ? <QuoteLink href={props.href}>{props.attribution}</QuoteLink> : props.attribution}
      </QuoteBy>
    </QuoteBox>
  )
}

/** Exposed for the contrast test. */
export const PUNCH_TEXT = { strong: color.strong, mist: color.mist, fog: color.fog }
