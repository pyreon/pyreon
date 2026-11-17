import type { VNodeChild } from '@pyreon/core'
import { For } from '@pyreon/core'
import { clampSize, display, font, gradient, leading, stat, text, weight } from '../theme'
import { el, pair, tone, txt } from './bases'
import { GlowCard } from './cards'
import { AnimatedSvg } from './media'
import { renderInline } from './type'

/**
 * The stat block: a gradient numeral with what it measures, the raw figures,
 * the run condition and, optionally, a proof chart of the same figures. One
 * component for every number the site proves something with, in four sizes:
 * `band` (the proof band's cells), `strip` (the stat cards, `StatCard`),
 * `product` (a product card's foot) and `hero` (the benchmarks hero row).
 * The numeral's own size is chosen separately (`numeral`).
 *
 * Layout contract: the block adds NO horizontal inset of its own. Its parts
 * are direct children of the surface that holds it (a proof band cell, a
 * compact card), so the numeral, the caption, the chart and the chart's
 * footnote all start at that surface's one inset (`inset` in theme.ts).
 */

/** Large numbers step down when they are long (ranges, "2.0–2.1×"), so they stay on one line. [A4] */
export const numeralSize = (s: string): 'default' | 'long' => ([...s].length > 5 ? 'long' : 'default')

/** A huge gradient numeral (700, -.06em, .86). Light mode uses the AA-safe stops. [A4] */
export const Numeral = txt
  .config({ name: 'Numeral' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({
    display: 'block',
    fontFamily: font.sans,
    fontSize: { xs: clampSize(display.numeralPhone), md: clampSize(display.numeral) },
    lineHeight: display.numeral.lineHeight,
    letterSpacing: display.numeral.tracking,
    fontWeight: display.numeral.weight,
    backgroundImage: pair(m, gradient.ember),
    backgroundClip: 'text',
    color: 'transparent',
    paddingBottom: display.numeralDescender,
    whiteSpace: 'nowrap',
    extendCss: '-webkit-background-clip: text; font-variant-numeric: tabular-nums;',
  }))
  .sizes(() => ({
    default: {},
    long: { fontSize: clampSize(display.numeralLong) },
    strip: { fontSize: clampSize(display.numeralStrip) },
    /** A proof number inside a product card: one step under `strip`, so a card with a number and one without share a row without a half-empty card. */
    card: { fontSize: clampSize(display.numeralCard) },
    /** A numeral inside a line of copy (the home page's featured product cards). */
    inline: { fontSize: display.numeralInline },
  }))

const Label = txt
  .config({ name: 'StatBodyLabel' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({
    display: 'block',
    margin: 0,
    fontFamily: font.sans,
    lineHeight: stat.labelLineHeight,
    fontWeight: weight.medium,
    color: tone(m, 'strong'),
  }))
  .sizes((_t, m) => ({
    band: { marginTop: stat.band.labelGap, maxWidth: stat.band.labelMaxWidth, textWrap: 'balance', fontSize: stat.band.labelSize },
    strip: { marginTop: stat.strip.labelGap, fontSize: stat.strip.labelSize },
    /** In a product card the label is the card's copy: regular weight, mist. */
    product: { fontSize: stat.product.labelSize, lineHeight: stat.product.labelLineHeight, fontWeight: weight.regular, color: tone(m, 'mist') },
    hero: { fontSize: stat.hero.labelSize },
  }))

/**
 * A mono line under the label (raw figures, rival, run condition). In a card
 * (a short caption) the lines are balanced, so "mount 100,000 points; 2.5–8.7×
 * on four operations" breaks after the clause, not before its last words; in
 * a band (long source lines, up to three) `pretty` only keeps a word from
 * ending alone.
 */
const Detail = txt
  .config({ name: 'StatDetail' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({
    display: 'block',
    fontFamily: font.mono,
    fontSize: stat.detailSize,
    lineHeight: stat.detailLineHeight,
    color: tone(m, 'fog'),
    overflowWrap: 'anywhere',
  }))
  .sizes(() => ({
    band: { textWrap: 'pretty' },
    strip: { textWrap: 'balance' },
    /** A product card's and the benchmarks hero's run condition: the caveat style (`text.caveat`). [A8] */
    product: { fontSize: text.caveat.size, letterSpacing: text.caveat.tracking, lineHeight: leading.normal, textWrap: 'balance' },
    hero: { fontSize: text.caveat.size, letterSpacing: text.caveat.tracking, textWrap: 'balance' },
  }))

/** A numeric range ("2.5–8.7×") stays on one line: a wrapped caption never breaks it at the dash. */
const NoBreak = txt.config({ name: 'StatNoBreak' }).attrs({ tag: 'span' }).theme(() => ({ whiteSpace: 'nowrap' }))

const RANGE = /(\d[\d.,]*\s?–\s?\d[\d.,]*\s?[×%]?)/

/** `renderInline`, with every numeric range in its text kept on one line. */
export function keepRanges(source: string): VNodeChild[] {
  const out: VNodeChild[] = []
  for (const c of renderInline(source)) {
    if (typeof c !== 'string') {
      out.push(c)
      continue
    }
    // split() with a capture group: the ranges sit at the odd indices.
    c.split(RANGE).forEach((part, i) => {
      if (part !== '') out.push(i % 2 === 1 ? <NoBreak>{part}</NoBreak> : part)
    })
  }
  return out
}

const ChartSlot = el
  .config({ name: 'StatChart' })
  .attrs({ block: true })
  .theme(() => ({ marginTop: stat.chartGap, maxWidth: stat.chartMaxWidth }))

/** A proof chart from the asset set: the file's raw markup and its manifest path. */
export interface StatChartSource {
  svg: string
  file: string
}

/**
 * The footnote an asset-set proof chart prints under its bars (its
 * `<text class="… cav">`: "one run · M3 Max · record of …"), or undefined.
 */
export function chartFootnote(svg: string): string | undefined {
  return /<text\b[^>]*\bclass="[^"]*\bcav\b[^"]*"[^>]*>([^<]*)<\/text>/.exec(svg)?.[1]?.trim()
}

/** Whether a chart's footnote already states this note (the note, or the note as its first `·` part). */
export function chartCarriesNote(svg: string, note: string): boolean {
  const foot = chartFootnote(svg)
  return foot !== undefined && (foot === note || foot.startsWith(`${note} · `))
}

export interface StatProps {
  stat: string
  /** What the number means (one short line). */
  label: string
  /** Mono lines under the label: the raw figures, the rival, the workload. */
  lines?: readonly string[] | undefined
  /** The run condition ("one run"). Shown once: dropped when the chart's footnote already carries it. */
  note?: string | undefined
  /** A chart of the same figures (decorative: the figures are printed here). */
  chart?: StatChartSource | undefined
  /** Rendered after the note, before the chart (a "See the row →" link). */
  extra?: VNodeChild
}

/** The parts of a stat, as siblings of the surface that holds them. */
export type StatSize = 'band' | 'strip' | 'product' | 'hero'
export type NumeralSize = 'default' | 'long' | 'strip' | 'card' | 'inline'

export function StatBody(props: StatProps & { size: StatSize; numeral: NumeralSize }) {
  const chart = props.chart
  const note = props.note && !(chart && chartCarriesNote(chart.svg, props.note)) ? props.note : undefined
  return (
    <>
      {/* `data-stat`: the e2e layout gate finds each stat block (its parent is the surface) by it. */}
      <span data-stat="">
        <Numeral tag="span" size={props.numeral}>
          {props.stat}
        </Numeral>{' '}
        <Label tag={props.size === 'strip' ? 'h3' : 'span'} size={props.size}>
          {renderInline(props.label)}
        </Label>
      </span>
      <For each={(props.lines ?? []).filter(Boolean)} by={(l) => l}>
        {(l) => <Detail size={props.size}>{keepRanges(l)}</Detail>}
      </For>
      {note ? <Detail size={props.size}>{keepRanges(note)}</Detail> : null}
      {props.extra ?? null}
      {chart ? (
        <ChartSlot aria-hidden="true">
          <AnimatedSvg file={chart.file} markup={chart.svg} decorative />
        </ChartSlot>
      ) : null}
    </>
  )
}

/** A benchmark stat card: the stat block in a compact glow card (the whole card links to the evidence). */
export function StatCard(props: StatProps & { href?: string | undefined }) {
  return (
    <GlowCard href={props.href} padding="stat">
      <StatBody {...props} size="strip" numeral="strip" />
    </GlowCard>
  )
}
