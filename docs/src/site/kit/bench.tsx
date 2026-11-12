import { For } from '@pyreon/core'
import type { Benchmarks, BenchmarkRow } from '../content/model'
import { font, gradient, motion, radius, text, verdict } from '../theme'
import { el, pair, tone, txt } from './bases'
import { Pill } from './controls'
import { barWidths, formatMeasure, normalizeVerdict, RECORD_LINE, verdictLabel } from './verdict'

const Chip = txt
  .config({ name: 'VerdictChip' })
  .attrs({ tag: 'span' })
  .theme(() => ({
    flexShrink: 0,
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
    win: { backgroundImage: verdict.winFill, color: verdict.winText, borderColor: 'transparent', fontWeight: 600 },
    tie: { color: pair(m, verdict.tie), borderColor: pair(m, verdict.tie) },
    split: { color: pair(m, verdict.split), borderColor: pair(m, verdict.split) },
    loss: { color: pair(m, verdict.loss), borderColor: pair(m, verdict.loss) },
    info: { color: pair(m, verdict.info), borderColor: pair(m, verdict.info) },
  }))

/** `.bx-chip` — win (ember fill, ink text) · tie · split · loss · measured. */
export function VerdictChip(props: { verdict: string }) {
  return <Chip state={normalizeVerdict(props.verdict)}>{verdictLabel(props.verdict)}</Chip>
}

const BarRow = el
  .config({ name: 'CompareBarRow' })
  .attrs({ block: true })
  .theme((_t, m) => ({
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 84px',
    gap: 10,
    alignItems: 'center',
    fontFamily: font.mono,
    fontSize: 11.5,
    color: tone(m, 'fog'),
  }))
  .states((_t, m) => ({ default: {}, pyreon: { color: tone(m, 'text') } }))

const Bar = el
  .config({ name: 'CompareBar' })
  .attrs({ tag: 'span', block: true, 'aria-hidden': 'true' })
  .theme((_t, m) => ({ height: 8, borderRadius: 4, backgroundColor: tone(m, 'bar'), transition: `width ${motion.bars}` }))
  .states((_t, m) => ({ default: {}, pyreon: { backgroundImage: pair(m, gradient.bar) } }))

const BarsBox = el.config({ name: 'CompareBars' }).attrs({ block: true, gap: 5 })

/** A lower-is-better pair: Pyreon (ember) and the rival (grey), scaled to the larger value. */
export function CompareBars(props: { pyreon: number; rival: number; unit: string; rivalName?: string | undefined }) {
  const w = barWidths(props.pyreon, props.rival)
  return (
    <BarsBox>
      <BarRow state="pyreon">
        <Bar state="pyreon" style={`width:${w.pyreon}%`} />
        <span>
          {formatMeasure(props.pyreon, props.unit)}
        </span>
      </BarRow>
      <BarRow>
        <Bar style={`width:${w.rival}%`} />
        <span>{formatMeasure(props.rival, props.unit)}</span>
      </BarRow>
    </BarsBox>
  )
}

const Box = el
  .config({ name: 'BenchmarkTable' })
  .attrs({ block: true })
  .theme((_t, m) => ({
    minWidth: 0,
    borderRadius: radius.bench,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'well'),
    backgroundImage: `linear-gradient(180deg, ${tone(m, 'sheen')}, transparent 40%)`,
    overflow: 'hidden',
  }))

const Head = el
  .config({ name: 'BenchmarkHead' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignX: 'spaceBetween', gap: 10 })
  .theme((_t, m) => ({
    flexWrap: 'wrap',
    paddingTop: 18,
    paddingBottom: 18,
    paddingLeft: { xs: 18, sm: 24 },
    paddingRight: { xs: 18, sm: 24 },
    borderBottom: '1px solid',
    borderColor: tone(m, 'line'),
    fontFamily: font.mono,
    fontSize: 11.5,
    color: tone(m, 'fog'),
  }))

const Legend = el
  .config({ name: 'BenchmarkLegend' })
  .attrs({ tag: 'span', contentDirection: 'inline', contentAlignY: 'center', gap: 8 })

const Swatch = el
  .config({ name: 'BenchmarkSwatch' })
  .attrs({ tag: 'span', 'aria-hidden': 'true' })
  .theme((_t, m) => ({ width: 10, height: 10, borderRadius: 3, backgroundColor: tone(m, 'bar') }))
  .states((_t, m) => ({ default: {}, pyreon: { backgroundImage: pair(m, gradient.bar) } }))

const Rows = el.config({ name: 'BenchmarkRows' }).attrs({ tag: 'ul', block: true }).theme(() => ({ listStyle: 'none', margin: 0, padding: 0 }))

const Row = el
  .config({ name: 'BenchmarkRow' })
  .attrs({ tag: 'li', block: true })
  .theme((_t, m) => ({
    display: 'grid',
    gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, 1fr)' },
    gap: '10px 24px',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 16,
    paddingLeft: { xs: 18, sm: 24 },
    paddingRight: { xs: 18, sm: 24 },
    borderBottom: '1px solid',
    borderColor: tone(m, 'line'),
  }))

const Op = txt
  .config({ name: 'BenchmarkOp' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ fontFamily: font.sans, fontSize: text.body.size, color: tone(m, 'text'), minWidth: 0 }))

const VerdictCell = el
  .config({ name: 'BenchmarkVerdict' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignX: { xs: 'left', md: 'right' }, contentAlignY: 'center', gap: 12 })
  .theme(() => ({ textAlign: { xs: 'left', md: 'right' }, minWidth: 0 }))

const RowLabel = txt
  .config({ name: 'BenchmarkLabel' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ fontFamily: font.sans, fontSize: 14, color: tone(m, 'mist'), minWidth: 0 }))

const Foot = el
  .config({ name: 'BenchmarkFoot' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignX: 'spaceBetween', contentAlignY: 'center', gap: 10 })
  .theme((_t, m) => ({
    flexWrap: 'wrap',
    paddingTop: 16,
    paddingBottom: 16,
    paddingLeft: { xs: 18, sm: 24 },
    paddingRight: { xs: 18, sm: 24 },
    fontFamily: font.mono,
    fontSize: text.caveat.size,
    letterSpacing: text.caveat.tracking,
    lineHeight: 1.5,
    color: tone(m, 'fog'),
  }))

const hasBars = (r: BenchmarkRow) => r.pyreon != null && r.rival != null && r.unit !== 'x' && r.unit !== ''

/**
 * `.bx` — a product's benchmark table. Every row shows its verdict chip;
 * the footer always carries machine, record date, run condition and
 * "author-run, synthetic", with a link to the full method.
 */
export function BenchmarkTable(props: { data: Benchmarks }) {
  return (
    <Box>
      <Head>
        <span>{props.data.rival}</span>
        <Legend>
          <Swatch state="pyreon" />
          <span>Pyreon</span>
          <Swatch />
          <span>rival · lower is better</span>
        </Legend>
      </Head>
      <Rows>
        <For each={props.data.rows} by={(r) => r.op}>
          {(r) => (
            <Row>
              <Op>{r.op}</Op>
              {hasBars(r) ? <CompareBars pyreon={r.pyreon as number} rival={r.rival as number} unit={r.unit} /> : <span />}
              <VerdictCell>
                <VerdictChip verdict={r.verdict} />
                <RowLabel>{r.label}</RowLabel>
              </VerdictCell>
            </Row>
          )}
        </For>
      </Rows>
      <Foot>
        <span>{`${RECORD_LINE} · ${props.data.run} · author-run, synthetic`}</span>
        <Pill href="/benchmarks">Full method, every loss →</Pill>
      </Foot>
    </Box>
  )
}
