import { For } from '@pyreon/core'
import type { CompareVerdict } from '../content/types-site'
import { font, radius, text, verdict } from '../theme'
import { el, pair, tone, txt } from './bases'
import { DataTable } from './table'
import { renderInline } from './type'

/**
 * The compare pages' verdict vocabulary. A row is a measured or factual
 * comparison, so the chip names who is ahead: `pyreon` (the ember fill, like
 * a benchmark win), `rival` ("<Rival> ahead", in the loss colour, never
 * softened), `tie`, or `different` (no winner: the two work differently).
 * The chip is always text; colour is never the only signal.
 */
export const COMPARE_VERDICTS: readonly CompareVerdict[] = ['pyreon', 'rival', 'tie', 'different']

export function compareChipLabel(v: CompareVerdict, rival: string): string {
  switch (v) {
    case 'pyreon':
      return 'Pyreon'
    case 'rival':
      return `${rival} ahead`
    case 'tie':
      return 'tie'
    default:
      return 'different'
  }
}

/** What each chip means, in one line (the legend above every compare table). */
export function compareChipMeaning(v: CompareVerdict, rival: string): string {
  switch (v) {
    case 'pyreon':
      return 'Pyreon is ahead on the record'
    case 'rival':
      return `${rival} is ahead, and we say so`
    case 'tie':
      return 'confidence intervals overlap'
    default:
      return 'no winner: they work differently'
  }
}

const Chip = txt
  .config({ name: 'CompareChip' })
  .attrs({ tag: 'span' })
  .theme(() => ({
    display: 'inline-block',
    fontFamily: font.mono,
    fontSize: 10.5,
    letterSpacing: '.12em',
    textTransform: 'uppercase',
    lineHeight: 1.4,
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 9,
    paddingRight: 9,
    borderRadius: radius.pill,
    border: '1px solid',
    whiteSpace: 'nowrap',
  }))
  .states((_t, m) => ({
    pyreon: { backgroundImage: verdict.winFill, color: verdict.winText, borderColor: 'transparent', fontWeight: 600 },
    rival: { color: pair(m, verdict.loss), borderColor: pair(m, verdict.loss) },
    tie: { color: pair(m, verdict.tie), borderColor: pair(m, verdict.tie) },
    different: { color: pair(m, verdict.info), borderColor: pair(m, verdict.info) },
  }))

export function CompareChip(props: { verdict: CompareVerdict; rival: string }) {
  const v = COMPARE_VERDICTS.includes(props.verdict) ? props.verdict : 'different'
  return <Chip state={v}>{compareChipLabel(v, props.rival)}</Chip>
}

const LegendList = el
  .config({ name: 'VerdictLegend' })
  .attrs({ tag: 'ul', block: true, contentDirection: 'inline', contentAlignY: 'center', gap: { xs: 10, md: 20 } })
  .theme(() => ({ flexWrap: 'wrap', listStyle: 'none', margin: 0, marginBottom: 16, padding: 0 }))

const LegendItem = txt
  .config({ name: 'VerdictLegendItem' })
  .attrs({ tag: 'li' })
  .theme((_t, m) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    fontFamily: font.sans,
    fontSize: text.caption.size,
    color: tone(m, 'fog'),
  }))

/** One line per chip, so a reader never has to guess what a colour means. */
export function VerdictLegend(props: { rival: string; verdicts?: readonly CompareVerdict[] | undefined }) {
  return (
    <LegendList aria-label="What the verdicts mean">
      <For each={props.verdicts ?? COMPARE_VERDICTS} by={(v) => v}>
        {(v) => (
          <LegendItem>
            <CompareChip verdict={v} rival={props.rival} />
            <span>{compareChipMeaning(v, props.rival)}</span>
          </LegendItem>
        )}
      </For>
    </LegendList>
  )
}

/** The sourced Pyreon-vs-rival table: topic, Pyreon, rival, verdict chip. */
export function CompareTable(props: {
  rival: string
  rows: readonly { topic: string; pyreon: string; rival: string; verdict: CompareVerdict }[]
  caption?: string | undefined
}) {
  return (
    <DataTable
      caption={props.caption}
      columns={['Topic', 'Pyreon', props.rival, 'Verdict']}
      rows={props.rows.map((r) => ({
        key: r.topic,
        cells: [
          { content: renderInline(r.topic) },
          { content: renderInline(r.pyreon), hot: true },
          { content: renderInline(r.rival) },
          { content: <CompareChip verdict={r.verdict} rival={props.rival} /> },
        ],
      }))}
    />
  )
}
