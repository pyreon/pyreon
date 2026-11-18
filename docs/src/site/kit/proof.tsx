import type { VNodeChild } from '@pyreon/core'
import { For, Show } from '@pyreon/core'
import { keyframes } from '@pyreon/styler'
import { breakpoints, clampSize, color, display, font, gradient, inset, motion, radius, section, text, texture, touch, weight } from '../theme'
import { el, focusRing, pair, tone, txt, type LinkAttrs } from './bases'
import { InstallCommand, Pill } from './controls'
import { ctaStackOnPhone, PillGroup } from './cta'
import { useLinkClick } from './link'
import { Wrap } from './primitives/wrap'
import { keepRanges, numeralSize, StatBody, type StatChartSource } from './stat'
import { Eyebrow, renderInline, StatusDot } from './type'
import { Note } from './note'

export { chartCarriesNote, chartFootnote, Numeral, numeralSize, StatBody, StatCard, type StatChartSource } from './stat'

/**
 * The marketing devices carried onto the site (visual-alignment.md §C):
 * ProofBand (C1), HookHero (C3), QuoteBlock (C4), EndCTA and CaveatLine (C6).
 * They share the "punch" surface: the scanline grid masked to fade out, plus
 * the corner flare. Tokens: theme.ts (display.numeral / hook / quote,
 * texture, gradient.ember, radius.proof).
 */
type Mode = Parameters<typeof tone>[0]

const scanline = (m: Mode) => `
  background: linear-gradient(${tone(m, 'scanline')} 1px, transparent 1px) 0 0 / ${texture.scanlineSize};
  opacity: ${pair(m, texture.scanlineOpacity)};
  -webkit-mask-image: ${texture.scanlineMask};
  mask-image: ${texture.scanlineMask};
`

/** Scanline + corner flare (top right, or centred above for `center`). */
const punchCss = (m: Mode, flare: 'corner' | 'center') => `
  isolation: isolate;
  &::before { content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none; ${scanline(m)} }
  &::after {
    content: ''; position: absolute; z-index: -1; pointer-events: none;
    ${flare === 'corner' ? 'top: -30%; right: -25%; width: min(900px, 90vw); height: 140%;' : 'top: -20%; left: 50%; transform: translateX(-50%); width: min(1000px, 120vw); height: 120%;'}
    background: ${pair(m, gradient.flare)};
  }
`

// ─── CaveatLine ───────────────────────────────────────────────────────────

const CaveatBox = el
  .config({ name: 'CaveatLine' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignX: 'spaceBetween', contentAlignY: 'center', gap: 14 })
  .theme(() => ({ flexWrap: 'wrap' }))

const ProseLink = el
  .config({ name: 'ProseLink' })
  .attrs<LinkAttrs>({ tag: 'a' })
  .theme((_t, m) => ({
    // Inline, not the Element base's inline-flex: a link that wraps must flow
    // like text, or the whole link drops below the status dot before it.
    display: 'inline',
    fontFamily: font.sans,
    fontSize: 14,
    color: tone(m, 'text'),
    textDecoration: 'underline',
    borderRadius: 2,
    // On touch screens the hit area grows to the tap-target height without
    // moving anything: the padding is cancelled by an equal negative margin.
    extendCss: `text-underline-offset: 4px; text-decoration-thickness: 1px;
      ${touch.media} { padding-top: ${touch.linkPad}; padding-bottom: ${touch.linkPad}; margin-top: calc(-1 * ${touch.linkPad}); margin-bottom: calc(-1 * ${touch.linkPad}); }`,
    hover: { color: tone(m, 'strong') },
    focus: focusRing(m),
  }))

/** An underlined text link (internal paths through the router). */
export function TextLink(props: { href: string; children?: VNodeChild }) {
  const click = useLinkClick()
  return (
    <ProseLink href={props.href} onClick={click(props.href)}>
      {props.children}
    </ProseLink>
  )
}

/** Caveat text on the left, the evidence link on the right. */
export function CaveatLine(props: { text: string; link?: { label: string; href: string } | undefined }) {
  return (
    <CaveatBox>
      <Note>{keepRanges(props.text)}</Note>
      {props.link ? <TextLink href={props.link.href}>{props.link.label}</TextLink> : null}
    </CaveatBox>
  )
}

// ─── ProofBand (C1) ───────────────────────────────────────────────────────

const Band = el
  .config({ name: 'ProofBand' })
  .attrs({ tag: 'section', block: true })
  .theme((_t, m) => ({
    position: 'relative',
    overflow: 'hidden',
    minWidth: 0,
    borderRadius: { xs: radius.card, md: radius.proof },
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'proofFill'),
    extendCss: punchCss(m, 'corner'),
  }))

const BandTitle = txt
  .config({ name: 'ProofBandTitle' })
  .attrs({ tag: 'h2' })
  .theme((_t, m) => ({
    margin: 0,
    paddingTop: { xs: 28, md: 44 },
    paddingLeft: inset.cell,
    paddingRight: inset.cell,
    maxWidth: 760,
    fontFamily: font.sans,
    fontSize: 'clamp(22px, 2.2vw, 30px)',
    lineHeight: 1.25,
    letterSpacing: '-.02em',
    fontWeight: weight.medium,
    color: tone(m, 'text'),
  }))

const Cells = el
  .config({ name: 'ProofBandCells' })
  .attrs({ tag: 'ul', block: true })
  // One column by default; the per-instance `css` sets the wide-screen column
  // count (the cell count), and an instance `css` beats the theme.
  .theme(() => ({
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
  }))

const Cell = el
  .config({ name: 'ProofBandCell' })
  .attrs({ tag: 'li', block: true, gap: 8, contentAlignY: 'top' })
  .theme((_t, m) => ({
    minWidth: 0,
    paddingTop: inset.cellY,
    paddingBottom: inset.cellY,
    paddingLeft: inset.cell,
    paddingRight: inset.cell,
    borderTop: '1px solid',
    borderColor: tone(m, 'line'),
    // A size container: a long numeral ("1.94–1.95×") sizes to its cell, not the screen.
    extendCss: `container-type: inline-size; @media (min-width: ${breakpoints.lg}px) { border-top: 0; & + & { border-left: 1px solid ${tone(m, 'line')}; } }`,
  }))

const BandFoot = el
  .config({ name: 'ProofBandFoot' })
  .attrs({ block: true, contentAlignX: 'block' })
  .theme(() => ({
    paddingLeft: inset.cell,
    paddingRight: inset.cell,
    paddingBottom: { xs: 22, md: 28 },
  }))

const FootRule = el
  .config({ name: 'ProofBandRule' })
  .attrs({ block: true })
  .theme((_t, m) => ({ paddingTop: 18, borderTop: '1px solid', borderColor: tone(m, 'line') }))

export interface ProofItem {
  stat: string
  /** What the number means (one short line). */
  label: string
  /** The raw figures behind it ("17.2 KB vs 69.6 KB gzip"). */
  detail?: string | undefined
  /** Run condition ("one run", "two runs"). */
  condition?: string | undefined
  /** Record source (shown when there is no detail). */
  source?: string | undefined
  href?: string | undefined
  /** A small chart of the same figures under the text (the asset set's proof charts); its footnote replaces the condition line when it carries it. */
  chart?: StatChartSource | undefined
}

/**
 * The big-number proof band: one to three gradient numerals, each with what
 * it measures, the raw figures and the run condition, then the caveat line.
 * Max three numbers; every number has a source; a loss is never a cell.
 * The numeral and its label are one text run for screen readers.
 */
export function ProofBand(props: {
  items: readonly ProofItem[]
  title?: string | undefined
  caveat?: string | undefined
  link?: { label: string; href: string } | undefined
  id?: string | undefined
}) {
  const items = props.items.slice(0, 3)
  // One numeral size per band: a long number in one cell steps every cell
  // down, so the labels under the numbers start on one line.
  const size = items.some((i) => numeralSize(i.stat) === 'long') ? 'long' : 'default'
  // One column until 992px: a long numeral ("1.94–1.95×") does not fit a third of a tablet.
  const cols = `@media (min-width: ${breakpoints.lg}px) { grid-template-columns: repeat(${items.length}, minmax(0, 1fr)); }`
  return (
    <Band id={props.id} aria-label={props.title ? undefined : 'In numbers'}>
      <Show when={() => !!props.title}>
        <BandTitle>{renderInline(props.title ?? '')}</BandTitle>
      </Show>
      <Cells css={cols}>
        <For each={items} by={(i) => i.stat + i.label}>
          {(i) => (
            <Cell>
              <StatBody
                size="band"
                numeral={size}
                stat={i.stat}
                label={i.label}
                lines={[i.detail ?? i.source ?? '']}
                note={i.condition}
                chart={i.chart}
                extra={i.href ? <TextLink href={i.href}>See the row →</TextLink> : undefined}
              />
            </Cell>
          )}
        </For>
      </Cells>
      <Show when={() => !!props.caveat || !!props.link}>
        <BandFoot>
          <FootRule>
            <CaveatLine text={props.caveat ?? ''} link={props.link} />
          </FootRule>
        </BandFoot>
      </Show>
    </Band>
  )
}

// ─── HookHero (C3) ────────────────────────────────────────────────────────

const sweep = keyframes`
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
`

const HookSection = el
  .config({ name: 'HookHero' })
  .attrs({ tag: 'section', block: true })
  .theme((_t, m) => ({
    position: 'relative',
    overflow: 'hidden',
    paddingTop: { xs: 128, md: 176 },
    paddingBottom: { xs: section.padYMobile, md: 96 },
    extendCss: punchCss(m, 'corner'),
  }))

const HookTitle = txt
  .config({ name: 'HookTitle' })
  .attrs({ tag: 'h1' })
  .theme((_t, m) => ({
    margin: 0,
    marginTop: 24,
    marginBottom: 28,
    maxWidth: '14ch',
    fontFamily: font.sans,
    fontSize: { xs: clampSize(display.hookPhone), md: clampSize(display.hook) },
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
    position: 'relative',
    display: 'inline-block',
    backgroundImage: pair(m, gradient.ember),
    backgroundClip: 'text',
    color: 'transparent',
    extendCss: `
      -webkit-background-clip: text;
      &::after {
        content: ''; position: absolute; left: 0; right: 0; bottom: -0.04em; height: 0.07em; border-radius: 99px;
        background: ${pair(m, gradient.ember)}; transform-origin: left center;
        animation: ${sweep} ${motion.sweep.duration}ms ${motion.sweep.easing} ${motion.sweep.delay}ms both;
      }
      @media (prefers-reduced-motion: reduce) { &::after { animation: none; } }
    `,
  }))

const HookLede = txt
  .config({ name: 'HookLede' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({
    margin: 0,
    marginBottom: 34,
    maxWidth: 680,
    fontFamily: font.sans,
    fontSize: { xs: 18, md: 20 },
    lineHeight: 1.6,
    color: tone(m, 'mist'),
  }))

const CtaRow = el
  .config({ name: 'CtaRow' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 12 })
  .theme(() => ({ flexWrap: 'wrap', extendCss: ctaStackOnPhone }))

const StatusRow = el
  .config({ name: 'StatusRow' })
  .attrs({ tag: 'ul', block: true, contentDirection: 'inline', gap: { xs: 10, md: 22 } })
  .theme((_t, m) => ({
    flexWrap: 'wrap',
    listStyle: 'none',
    margin: 0,
    marginTop: 22,
    padding: 0,
    fontFamily: font.sans,
    fontSize: text.ui.size,
    color: tone(m, 'mist'),
  }))

/** Split a headline around its one ember word (first occurrence). */
export function splitEmber(title: string, word: string): [string, string, string] {
  const i = word ? title.indexOf(word) : -1
  if (i < 0) return [title, '', '']
  return [title.slice(0, i), word, title.slice(i + word.length)]
}

/**
 * A headline's text with its one ember word in the display gradient (with
 * the underline sweep), inline formatting (`code`) kept on both sides. For a
 * heading component that sets its own size (the product hero).
 */
export function EmberText(props: { text: string; word: string }) {
  const [before, word, after] = splitEmber(props.text, props.word)
  return (
    <>
      {renderInline(before)}
      {word ? <EmberWord>{word}</EmberWord> : null}
      {renderInline(after)}
    </>
  )
}

/** The `<h1>` with one span in the display gradient (with the underline sweep). */
export function HookTitleText(props: { title: string; emberWord: string }) {
  const [before, word, after] = splitEmber(props.title, props.emberWord)
  return (
    <HookTitle>
      {before}
      {word ? <EmberWord>{word}</EmberWord> : null}
      {after}
    </HookTitle>
  )
}

export interface StatusItem {
  dot: 'ok' | 'warn'
  text: string
  href?: string | undefined
}

/**
 * The hook hero: eyebrow, bold h1 with one ember word, lede, the install
 * command (hot) with one or two outline pills, then status dots. A full
 * section with its own wrap, the scanline and the corner flare.
 */
export function HookHero(props: {
  eyebrow?: string | undefined
  title: string
  emberWord: string
  lede?: string | undefined
  install?: string | undefined
  ctas?: readonly { label: string; href: string }[] | undefined
  status?: readonly StatusItem[] | undefined
  /** Fragment target (`#hero`). */
  id?: string | undefined
  children?: VNodeChild
}) {
  return (
    <HookSection id={props.id}>
      <Wrap>
        <Show when={() => !!props.eyebrow}>
          <Eyebrow>{props.eyebrow}</Eyebrow>
        </Show>
        <HookTitleText title={props.title} emberWord={props.emberWord} />
        <Show when={() => !!props.lede}>
          <HookLede>{renderInline(props.lede ?? '')}</HookLede>
        </Show>
        <CtaRow>
          {props.install ? <InstallCommand command={props.install} variant="hot" /> : null}
          <PillGroup>
            <For each={props.ctas ?? []} by={(c) => c.href}>
              {(c) => (
                <Pill href={c.href} size="lg">
                  {c.label}
                </Pill>
              )}
            </For>
          </PillGroup>
        </CtaRow>
        <Show when={() => (props.status?.length ?? 0) > 0}>
          <StatusRow aria-label="Status">
            <For each={props.status ?? []} by={(s) => s.text}>
              {(s) => (
                <li>
                  <StatusDot state={s.dot} />
                  {s.href ? <TextLink href={s.href}>{renderInline(s.text)}</TextLink> : renderInline(s.text)}
                </li>
              )}
            </For>
          </StatusRow>
        </Show>
        {props.children}
      </Wrap>
    </HookSection>
  )
}

// ─── QuoteBlock (C4) ──────────────────────────────────────────────────────

const QuoteBox = el
  .config({ name: 'QuoteBlock' })
  .attrs({ tag: 'figure', block: true, gap: 22 })
  .theme((_t, m) => ({
    position: 'relative',
    overflow: 'hidden',
    margin: 0,
    borderRadius: { xs: radius.card, md: radius.proof },
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'card'),
    paddingTop: { xs: 32, md: 56 },
    paddingBottom: { xs: 32, md: 48 },
    paddingLeft: { xs: 22, md: 56 },
    paddingRight: { xs: 22, md: 56 },
    extendCss: punchCss(m, 'corner'),
  }))

const QuoteMark = txt
  .config({ name: 'QuoteMark' })
  .attrs({ tag: 'span', 'aria-hidden': 'true' })
  .theme((_t, m) => ({
    display: 'block',
    height: 56,
    fontFamily: font.sans,
    fontSize: 96,
    lineHeight: 1,
    fontWeight: weight.bold,
    backgroundImage: pair(m, gradient.ember),
    backgroundClip: 'text',
    color: 'transparent',
    extendCss: '-webkit-background-clip: text;',
  }))

const QuoteText = txt
  .config({ name: 'QuoteText' })
  .attrs({ tag: 'blockquote' })
  .theme((_t, m) => ({
    margin: 0,
    // The legacy docs stylesheet (`docs.css`, layer `docs`) styles every bare
    // <blockquote> with a bar, a fill and padding; the quote block has its own look.
    padding: 0,
    border: 'none',
    backgroundColor: 'transparent',
    fontFamily: font.sans,
    lineHeight: display.quote.lineHeight,
    letterSpacing: display.quote.tracking,
    fontWeight: display.quote.weight,
    color: tone(m, 'strong'),
    textWrap: 'balance',
  }))
  .sizes(() => ({
    default: { maxWidth: '18ch', fontSize: { xs: 30, md: 'clamp(30px, 4.4vw, 60px)' } },
    long: { maxWidth: '30ch', fontSize: { xs: 24, md: 'clamp(24px, 2.9vw, 40px)' }, lineHeight: 1.15 },
  }))

const QuoteBy = el
  .config({ name: 'QuoteAttribution' })
  .attrs({ tag: 'figcaption', contentDirection: 'inline', contentAlignY: 'center', gap: 14 })
  .theme((_t, m) => ({ fontFamily: font.mono, fontSize: 12, letterSpacing: '.04em', color: tone(m, 'fog') }))

const EmberBar = el
  .config({ name: 'EmberBar' })
  .attrs({ tag: 'span', 'aria-hidden': 'true' })
  .theme((_t, m) => ({ width: 72, height: 4, flexShrink: 0, borderRadius: 4, backgroundImage: pair(m, gradient.ember) }))

/** A quote longer than ~110 characters is a paragraph, not a hook: it steps down. */
export const quoteSize = (q: string): 'default' | 'long' => (q.length > 110 ? 'long' : 'default')

/** One pull quote from the docs, the record or a named post (never an invented person). */
export function QuoteBlock(props: { text: string; attribution: string; href?: string | undefined }) {
  return (
    <QuoteBox>
      <QuoteMark>“</QuoteMark>
      <QuoteText size={quoteSize(props.text)}>{renderInline(props.text)}</QuoteText>
      <QuoteBy>
        <EmberBar />
        {props.href ? <TextLink href={props.href}>{props.attribution}</TextLink> : <span>{props.attribution}</span>}
      </QuoteBy>
    </QuoteBox>
  )
}

// ─── EndCTA (C6) ──────────────────────────────────────────────────────────

const EndBox = el
  .config({ name: 'EndCTA' })
  .attrs({ tag: 'section', block: true, contentAlignX: 'center' })
  .theme((_t, m) => ({
    position: 'relative',
    overflow: 'hidden',
    textAlign: 'center',
    paddingTop: { xs: 96, md: 150 },
    paddingBottom: { xs: 96, md: 150 },
    paddingLeft: 16,
    paddingRight: 16,
    extendCss: punchCss(m, 'center'),
  }))

const EndTitle = txt
  .config({ name: 'EndTitle' })
  .attrs({ tag: 'h2' })
  .theme((_t, m) => ({
    margin: 0,
    marginBottom: 22,
    maxWidth: '14ch',
    fontFamily: font.sans,
    fontSize: 'clamp(40px, 6vw, 88px)',
    lineHeight: 0.98,
    letterSpacing: display.hook.tracking,
    fontWeight: weight.bold,
    color: tone(m, 'strong'),
    textWrap: 'balance',
  }))

const EndLede = txt
  .config({ name: 'EndLede' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({
    margin: 0,
    marginBottom: 30,
    maxWidth: 580,
    fontFamily: font.sans,
    fontSize: 18,
    lineHeight: 1.6,
    color: tone(m, 'mist'),
  }))

const EndRow = el
  .config({ name: 'EndRow' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignX: 'center', contentAlignY: 'center', gap: 12 })
  .theme(() => ({ flexWrap: 'wrap' }))

const EndSmall = txt
  .config({ name: 'EndSmall' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, marginTop: 22, fontFamily: font.sans, fontSize: 14, color: tone(m, 'fog') }))

const EndLinks = el
  .config({ name: 'EndLinks' })
  .attrs({ tag: 'ul', block: true, contentDirection: 'inline', contentAlignX: 'center', gap: 22 })
  .theme(() => ({ flexWrap: 'wrap', listStyle: 'none', margin: 0, marginTop: 30, padding: 0 }))

/**
 * The closing call to action: a centred punch surface, a 700 headline with
 * one ember phrase, the hot install command and a solid pill, an optional
 * second command as a small line, and community links.
 */
export function EndCTA(props: {
  title: string
  emberWord?: string | undefined
  lede?: string | undefined
  install: string
  primary?: { label: string; href: string } | undefined
  native?: { label: string; command: string } | undefined
  links?: readonly { label: string; href: string }[] | undefined
  id?: string | undefined
}) {
  const [before, word, after] = splitEmber(props.title, props.emberWord ?? '')
  return (
    <EndBox id={props.id}>
      <EndTitle>
        {before}
        {word ? <EmberWord>{word}</EmberWord> : null}
        {after}
      </EndTitle>
      <Show when={() => !!props.lede}>
        <EndLede>{renderInline(props.lede ?? '')}</EndLede>
      </Show>
      <EndRow>
        <InstallCommand command={props.install} variant="hot" />
        {props.primary ? (
          <Pill href={props.primary.href} variant="solid" size="lg">
            {props.primary.label}
          </Pill>
        ) : null}
      </EndRow>
      <Show when={() => !!props.native}>
        <EndSmall>{renderInline(`${props.native?.label ?? ''} \`${props.native?.command ?? ''}\``)}</EndSmall>
      </Show>
      <Show when={() => (props.links?.length ?? 0) > 0}>
        <EndLinks aria-label="Community">
          <For each={props.links ?? []} by={(l) => l.href}>
            {(l) => (
              <li>
                <TextLink href={l.href}>{l.label}</TextLink>
              </li>
            )}
          </For>
        </EndLinks>
      </Show>
    </EndBox>
  )
}

/** Exposed for the contrast test. */
export const PUNCH_TEXT = { strong: color.strong, mist: color.mist, fog: color.fog }
