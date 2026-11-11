import { For, Show } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { BENCH_HEADS as H } from '../../content/benchmarks-heads'
import type { BenchmarksPage as Data } from '../../content/types-site'
import { el, focusRing, tone, txt, type LinkAttrs } from '../../kit/bases'
import { VerdictChip } from '../../kit/bench'
import { LimitNote, NumberedCards } from '../../kit/blocks'
import { GlowCard } from '../../kit/cards'
import { CodeCard } from '../../kit/code'
import { Chip, Pill } from '../../kit/controls'
import { AutoGrid, Section, SectionHead, Wrap } from '../../kit/layout'
import { Reveal } from '../../kit/motion'
import { CaveatLine, Numeral } from '../../kit/proof'
import { Diagram } from '../../kit/story'
import { DataTable, TableDisclosure, TableNote } from '../../kit/table'
import { ToggleChips } from '../../kit/toggles'
import { Eyebrow, Heading, Lede, renderInline } from '../../kit/type'
import { font, gradient, radius, text, weight } from '../../theme'
import { useSitePageHead } from '../assets'
import { LiveRowBoard, LiveScaling } from './islands'
import {
  formatMs,
  formatUs,
  matchesFilter,
  prNumbers,
  sortedRowBoard,
  sortSummaries,
  tally,
  type ProductBenchSummary,
  type ProductFilter,
} from './model'

/**
 * `/benchmarks` — every dataset in `content/pages/benchmarks.json`, in the
 * order of the design's build brief: hero stats, method, row board, scenarios,
 * scaling, SSR, real-app shapes, bundle, reactivity, every product, every
 * result (the losses), withdrawn claims, the harness bugs, reproduce.
 *
 * Static by default: every chart is first an SVG from the asset set (the
 * no-JS / reduced-data fallback) with its table as the text alternative. The
 * row board and the scaling chart are LIVE `@pyreon/charts` islands on top
 * (`islands.ts`); the reactivity switcher and the product filter are plain
 * signals in the page.
 */

/** The SVGs this page inlines (loaded by the route loader). */
export const BENCH_SVGS = {
  rows: 'benchmarks/row-board-create-10-000-rows.svg',
  scaling: 'benchmarks/scaling-select.svg',
  ssr: 'benchmarks/ssr.svg',
  forms: 'benchmarks/forms.svg',
  todomvc: 'benchmarks/todomvc.svg',
  bundle: 'benchmarks/bundle.svg',
} as const

/** The row-board operation the static fallback shows, so the live chart opens on the same one. */
const ROWS_INITIAL = 'create 10,000 rows'

export interface BenchmarksView {
  data: Data
  products: ProductBenchSummary[]
  svgs: Record<string, string>
}

const JUMPS: readonly [string, string][] = [
  ['method', 'Method'],
  ['rows', 'Row board'],
  ['scenarios', 'Scenarios'],
  ['scaling', 'Scaling'],
  ['ssr', 'SSR'],
  ['apps', 'Real apps'],
  ['bundle', 'Bundle'],
  ['reactivity', 'Reactivity'],
  ['products', 'Every product'],
  ['losses', 'Every result'],
  ['withdrawn', 'Withdrawn'],
  ['harness', 'Harness bugs'],
  ['reproduce', 'Reproduce'],
]

const JumpList = el
  .config({ name: 'BenchJumps' })
  .attrs({ tag: 'ul', block: true, contentDirection: 'inline', gap: 8 })
  .theme(() => ({ flexWrap: 'wrap', listStyle: 'none', margin: 0, marginTop: 36, padding: 0 }))

const JumpLink = el
  .config({ name: 'BenchJump' })
  .attrs<LinkAttrs>({ tag: 'a' })
  .theme((_t, m) => ({
    display: 'inline-block',
    paddingTop: 7,
    paddingBottom: 7,
    paddingLeft: 13,
    paddingRight: 13,
    borderRadius: radius.pill,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    fontFamily: font.mono,
    fontSize: text.mono.size,
    color: tone(m, 'mist'),
    textDecoration: 'none',
    hover: { color: tone(m, 'text'), borderColor: tone(m, 'lineHover') },
    focus: focusRing(m),
  }))

const HeroStats = el
  .config({ name: 'BenchHeroStats' })
  .attrs({ tag: 'ul', block: true })
  .theme((_t, m) => ({
    listStyle: 'none',
    margin: 0,
    marginTop: 48,
    padding: 0,
    display: 'grid',
    gap: 0,
    gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' },
    borderTop: '1px solid',
    borderColor: tone(m, 'line'),
  }))

const HeroStat = el
  .config({ name: 'BenchHeroStat' })
  .attrs({ tag: 'li', block: true, gap: 8, contentAlignY: 'top' })
  .theme((_t, m) => ({ minWidth: 0, paddingTop: 24, paddingBottom: 24, paddingRight: 24, borderBottom: '1px solid', borderColor: tone(m, 'line') }))

const StatLabel = txt
  .config({ name: 'BenchHeroStatLabel' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ display: 'block', fontFamily: font.sans, fontSize: 16, lineHeight: 1.35, fontWeight: weight.medium, color: tone(m, 'strong') }))

const StatCondition = txt
  .config({ name: 'BenchHeroStatCondition' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ display: 'block', fontFamily: font.mono, fontSize: text.caveat.size, lineHeight: 1.55, color: tone(m, 'fog') }))

const Stack = el.config({ name: 'BenchStack' }).attrs({ block: true, gap: 20 }).theme(() => ({ minWidth: 0 }))

const ChartBox = el
  .config({ name: 'BenchChartBox' })
  .attrs({ block: true, gap: 16 })
  .theme((_t, m) => ({
    minWidth: 0,
    padding: { xs: 16, md: 26 },
    borderRadius: radius.bench,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'well'),
    extendCss: '& [data-svg] { border: 0 !important; background: transparent !important; }',
  }))

const ProductCard = el
  .config({ name: 'BenchProductCard' })
  .attrs({ block: true, gap: 8 })
  .theme(() => ({ minWidth: 0 }))

const Mono = txt
  .config({ name: 'BenchMono' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ display: 'block', fontFamily: font.mono, fontSize: text.mono.size, lineHeight: 1.55, color: tone(m, 'fog') }))

const Tally = txt
  .config({ name: 'BenchTally' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ display: 'block', fontFamily: font.mono, fontSize: text.mono.size, color: tone(m, 'accentText') }))

const WithdrawnRow = el
  .config({ name: 'BenchWithdrawn' })
  .attrs({ tag: 'li', block: true, gap: 8 })
  .theme((_t, m) => ({ paddingTop: 18, paddingBottom: 18, borderBottom: '1px solid', borderColor: tone(m, 'line'), minWidth: 0 }))

const WithdrawnList = el
  .config({ name: 'BenchWithdrawnList' })
  .attrs({ tag: 'ul', block: true })
  .theme((_t, m) => ({ listStyle: 'none', margin: 0, padding: 0, maxWidth: 900, borderTop: '1px solid', borderColor: tone(m, 'line') }))

const Struck = txt
  .config({ name: 'BenchStruck' })
  .attrs({ tag: 's' })
  .theme((_t, m) => ({
    fontFamily: font.sans,
    fontSize: 17,
    lineHeight: 1.45,
    color: tone(m, 'text'),
    textDecoration: 'line-through',
    extendCss: 'text-decoration-thickness: 1px;',
  }))

const WithdrawnTag = txt
  .config({ name: 'BenchWithdrawnTag' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({
    display: 'inline-block',
    marginRight: 10,
    fontFamily: font.mono,
    fontSize: 10.5,
    letterSpacing: '.12em',
    textTransform: 'uppercase',
    color: tone(m, 'err'),
  }))

const ChipList = el
  .config({ name: 'BenchVersions' })
  .attrs({ tag: 'ul', block: true, contentDirection: 'inline', gap: 6 })
  .theme(() => ({ flexWrap: 'wrap', listStyle: 'none', margin: 0, padding: 0 }))

const RuleLine = el
  .config({ name: 'BenchHeroRule' })
  .attrs({ block: true, 'aria-hidden': 'true' })
  .theme((_t, m) => ({ height: 1, marginTop: 40, backgroundImage: m(gradient.rule.light, gradient.rule.dark) as unknown as string }))

/** A verdict chip and its label, as ONE element (a fragment here duplicated on hydration: see DataTable). */
function VerdictNote(props: { verdict: string; label: string }) {
  return (
    <span>
      <VerdictChip verdict={props.verdict} /> {props.label}
    </span>
  )
}

const prHref = (n: number) => `https://github.com/pyreon/pyreon/pull/${n}`

function ChartWithFallback(props: { svg: string | undefined; id: string; live?: unknown; children?: unknown }) {
  return (
    <ChartBox>
      {props.live as never}
      {props.svg ? (
        <div id={props.id}>
          <Diagram svg={props.svg} />
        </div>
      ) : null}
      {props.children as never}
    </ChartBox>
  )
}

export function BenchmarksPage(props: { view: BenchmarksView }) {
  const d = props.view.data
  const svgs = props.view.svgs
  const products = sortSummaries(props.view.products)

  useSitePageHead({
    path: '/benchmarks',
    title: 'Benchmarks: every result, losses included · Pyreon',
    description: `${H.hero.lede.split('. ')[0]}. ${d.caveat}`,
  })

  // Reactivity: which engine the table shows.
  const engines = Object.keys(d.reactivity)
  const engine = signal(engines[0] ?? '')
  // Every product: which cards are listed.
  const filter = signal<ProductFilter>('all')
  const counts: Record<ProductFilter, number> = {
    all: products.length,
    win: products.filter((p) => matchesFilter(p, 'win')).length,
    loss: products.filter((p) => matchesFilter(p, 'loss')).length,
    info: products.filter((p) => matchesFilter(p, 'info')).length,
  }
  const visible = () => products.filter((p) => matchesFilter(p, filter()))

  const runNote = (line: string) => <TableNote>{`${line} · ${d.caveat}`}</TableNote>

  return (
    <>
      {/* hero */}
      <Section size="hero">
        <Wrap>
          <Eyebrow>{`${H.hero.eyebrow} · record of ${d.record.replace(/^BENCHMARKS\.md\s*/, '')} · ${d.competitors.length} competitor libraries`}</Eyebrow>
          <Heading tag="h1" size="hero">
            {H.hero.title}
          </Heading>
          <Lede size="hero">{H.hero.lede}</Lede>
          <HeroStats aria-label="Headline results">
            <For each={d.heroStats} by={(s) => s.stat + s.label}>
              {(s) => (
                <HeroStat>
                  <span>
                    <Numeral size="strip">{s.stat}</Numeral> <StatLabel>{renderInline(s.label)}</StatLabel>
                  </span>
                  <StatCondition>{s.condition}</StatCondition>
                </HeroStat>
              )}
            </For>
          </HeroStats>
          <RuleLine />
          <nav aria-label="On this page">
            <JumpList>
              <For each={JUMPS} by={(j) => j[0]}>
                {(j) => (
                  <li>
                    <JumpLink href={`#${j[0]}`}>{j[1]}</JumpLink>
                  </li>
                )}
              </For>
            </JumpList>
          </nav>
        </Wrap>
      </Section>

      {/* method */}
      <Section size="tight" id="method">
        <Wrap>
          <SectionHead label={H.method.label} title={H.method.title} text={H.method.text} />
          <NumberedCards items={d.method.map(([title, body]) => ({ title, text: body }))} />
          <TableNote>
            {d.krausest} The suites and how to run them are documented in the{' '}
            <a href="/docs/benchmarks">benchmarks guide</a>.
          </TableNote>
        </Wrap>
      </Section>

      {/* row board */}
      <Reveal>
        <Section size="tight" id="rows">
          <Wrap>
            <SectionHead label={H.rows.label} title={H.rows.title} text={H.rows.text} />
            <ChartWithFallback
              svg={svgs[BENCH_SVGS.rows]}
              id="rows-fallback"
              live={<LiveRowBoard kind="rows" fallbackId="rows-fallback" frameworks={d.frameworks} rowBoard={d.rowBoard} rowVerdicts={d.rowVerdicts} initial={ROWS_INITIAL} />}
            >
              <TableDisclosure summary="Every operation and framework, as a table">
                <DataTable
                  caption={`Row board, run 1, milliseconds (lower is better). Verdicts cover both runs.`}
                  columns={['Operation', ...d.frameworks, 'Verdict']}
                  rows={Object.entries(d.rowBoard).map(([op, values]) => ({
                    key: op,
                    cells: [
                      { content: op },
                      ...d.frameworks.map((fw, i) => ({ content: formatMs(values[i] ?? Number.NaN), num: true, hot: fw === 'Pyreon' })),
                      { content: <VerdictNote verdict={d.rowVerdicts[op]?.[0] ?? 'info'} label={d.rowVerdicts[op]?.[1] ?? ''} /> },
                    ],
                  }))}
                />
              </TableDisclosure>
              {runNote('Run 1 medians; real Chromium; the full board ranks each operation fastest first')}
            </ChartWithFallback>
            <Show when={() => !!d.rowBoard[ROWS_INITIAL]}>
              <TableNote>
                {`${ROWS_INITIAL}, fastest first: ${sortedRowBoard(d.frameworks, d.rowBoard[ROWS_INITIAL] ?? [])
                  .map((b) => `${b.name} ${formatMs(b.ms)}`)
                  .join(' · ')}`}
              </TableNote>
            </Show>
          </Wrap>
        </Section>
      </Reveal>

      {/* scenarios */}
      <Reveal>
        <Section size="tight" id="scenarios">
          <Wrap>
            <SectionHead label={H.scenarios.label} title={H.scenarios.title} text={H.scenarios.text} />
            <DataTable
              columns={['Scenario', 'Pyreon', 'Fastest rival', 'Verdict']}
              rows={d.scenarios.map((s) => ({
                key: s.op,
                cells: [
                  { content: s.op },
                  { content: s.pyreon, num: true, hot: true },
                  { content: s.rival, num: true },
                  { content: <VerdictNote verdict={s.verdict} label={s.label} /> },
                ],
              }))}
            />
            {runNote('Two runs each unless marked')}
          </Wrap>
        </Section>
      </Reveal>

      {/* scaling */}
      <Reveal>
        <Section size="tight" id="scaling">
          <Wrap>
            <SectionHead label={H.scaling.label} title={H.scaling.title} text={H.scaling.text} />
            <ChartWithFallback svg={svgs[BENCH_SVGS.scaling]} id="scaling-fallback" live={<LiveScaling kind="scaling" fallbackId="scaling-fallback" scaling={d.scaling} />}>
              <TableDisclosure summary="Every size, as a table">
                <For each={(['select', 'partial update', 'swap'] as const).filter((k) => k in d.scaling)} by={(k) => k}>
                  {(k) => (
                    <DataTable
                      caption={`${k}: µs per operation, one run`}
                      columns={['Framework', ...d.scaling.sizes.map((s) => `${s} rows`)]}
                      rows={Object.entries(d.scaling[k]).map(([fw, values]) => ({
                        key: fw,
                        cells: [{ content: fw }, ...values.map((v) => ({ content: formatUs(v), num: true, hot: fw === 'Pyreon' }))],
                      }))}
                    />
                  )}
                </For>
              </TableDisclosure>
              {runNote('Batch-timed, one run')}
            </ChartWithFallback>
          </Wrap>
        </Section>
      </Reveal>

      {/* ssr */}
      <Reveal>
        <Section size="tight" id="ssr">
          <Wrap>
            <SectionHead label={H.ssr.label} title={H.ssr.title} text={H.ssr.text} />
            <ChartWithFallback svg={svgs[BENCH_SVGS.ssr]} id="ssr-chart">
              <TableDisclosure summary="As a table">
                <DataTable
                  caption="Compiled SSR, µs per render (lower is better), one run"
                  columns={['Rows', 'Pyreon', 'Vue 3', 'Svelte 5', 'React 19']}
                  rows={d.ssr.map((r) => ({
                    key: r.rows,
                    cells: [
                      { content: r.rows },
                      { content: `${r.pyreon} µs`, num: true, hot: true },
                      { content: `${r.vue} µs`, num: true },
                      { content: `${r.svelte} µs`, num: true },
                      { content: `${r.react} µs`, num: true },
                    ],
                  }))}
                />
              </TableDisclosure>
              {runNote('Overnight run, one run')}
            </ChartWithFallback>
          </Wrap>
        </Section>
      </Reveal>

      {/* real-app shapes */}
      <Reveal>
        <Section size="tight" id="apps">
          <Wrap>
            <SectionHead label={H.apps.label} title={H.apps.title} text={H.apps.text} />
            <AutoGrid cols={2} gap={16}>
              <ChartWithFallback svg={svgs[BENCH_SVGS.forms]} id="forms-chart">
                <TableDisclosure summary="Forms, as a table">
                  <DataTable
                    caption="12-field form, µs (lower is better), one run"
                    columns={['Operation', 'Pyreon', 'Rivals, fastest first']}
                    rows={d.forms.map(([op, us, rivals]) => ({
                      key: op,
                      cells: [{ content: op }, { content: `${us} µs`, num: true, hot: true }, { content: rivals.map(([n, v]) => `${n} ${v} µs`).join(' · ') }],
                    }))}
                  />
                </TableDisclosure>
              </ChartWithFallback>
              <ChartWithFallback svg={svgs[BENCH_SVGS.todomvc]} id="todomvc-chart">
                <TableDisclosure summary="TodoMVC, as a table">
                  <DataTable
                    caption="TodoMVC shape vs React 19, one run"
                    columns={['Operation', 'Pyreon', 'React 19', 'Ratio']}
                    rows={d.todomvc.map(([op, p, r, ratio]) => ({
                      key: op,
                      cells: [{ content: op }, { content: p, num: true, hot: true }, { content: r, num: true }, { content: ratio, num: true }],
                    }))}
                  />
                </TableDisclosure>
              </ChartWithFallback>
            </AutoGrid>
            {runNote('One run each')}
          </Wrap>
        </Section>
      </Reveal>

      {/* bundle */}
      <Reveal>
        <Section size="tight" id="bundle">
          <Wrap>
            <SectionHead label={H.bundle.label} title={H.bundle.title} text={H.bundle.text} />
            <ChartWithFallback svg={svgs[BENCH_SVGS.bundle]} id="bundle-chart">
              <TableDisclosure summary="As a table">
                <DataTable
                  caption="Same keyed-table app, KB gzip -9 (smaller is better)"
                  columns={['Framework', 'KB gzip']}
                  rows={d.bundle.map(([name, kb]) => ({ key: name, cells: [{ content: name }, { content: `${kb} KB`, num: true, hot: name === 'Pyreon' }] }))}
                />
              </TableDisclosure>
              {runNote('Sizes are deterministic')}
            </ChartWithFallback>
          </Wrap>
        </Section>
      </Reveal>

      {/* reactivity */}
      <Reveal>
        <Section size="tight" id="reactivity">
          <Wrap>
            <SectionHead label={H.reactivity.label} title={H.reactivity.title} text={H.reactivity.text} />
            <Stack>
              <ToggleChips label="Engine" options={engines.map((e) => ({ value: e, label: e }))} value={() => engine()} onChange={(v) => engine.set(v)} />
              <div aria-live="polite">
                {() => {
                  const e = engine()
                  return (
                    <DataTable
                      caption={`${e}: ns per op (lower is better), two runs`}
                      columns={['Test', 'Pyreon', 'Preact Signals', 'Solid', 'Verdict vs Preact']}
                      rows={(d.reactivity[e] ?? []).map(([test, p, preact, solid, v, margin]) => ({
                        key: `${e}:${test}`,
                        cells: [
                          { content: test },
                          { content: p.toLocaleString('en'), num: true, hot: true },
                          { content: preact.toLocaleString('en'), num: true },
                          { content: solid.toLocaleString('en'), num: true },
                          { content: <VerdictNote verdict={v} label={margin} /> },
                        ],
                      }))}
                    />
                  )
                }}
              </div>
              {runNote('Two runs per engine')}
            </Stack>
          </Wrap>
        </Section>
      </Reveal>

      {/* every product */}
      <Section size="tight" id="products">
        <Wrap>
          <SectionHead label={H.products.label} title={H.products.title} text={H.products.text} />
          <Stack>
            <ToggleChips<ProductFilter>
              kind="filter"
              label="Filter products"
              options={[
                { value: 'all', label: 'all', count: counts.all },
                { value: 'win', label: 'has wins', count: counts.win },
                { value: 'loss', label: 'has losses', count: counts.loss },
                { value: 'info', label: 'throughput only', count: counts.info },
              ]}
              value={() => filter()}
              onChange={(v) => filter.set(v)}
            />
            <p aria-live="polite">
              <Mono>{() => `${visible().length} of ${products.length} products`}</Mono>
            </p>
            <AutoGrid min={260} gap={12} tag="ul">
              <For each={() => visible()} by={(p) => p.id}>
                {(p) => (
                  <li>
                    <GlowCard href={p.href} padding="compact" aria-label={`${p.name}: ${p.headline} ${tally(p.counts)}. Open its benchmarks.`}>
                      <ProductCard>
                        <Eyebrow state="accent">{p.name}</Eyebrow>
                        <Heading tag="h3" size="step">
                          {p.headline}
                        </Heading>
                        <Mono>{p.rival}</Mono>
                        <Tally>{tally(p.counts)}</Tally>
                      </ProductCard>
                    </GlowCard>
                  </li>
                )}
              </For>
            </AutoGrid>
          </Stack>
        </Wrap>
      </Section>

      {/* every result: the losses */}
      <Reveal>
        <Section size="tight" id="losses">
          <Wrap>
            <SectionHead label="where we lose" title={d.lossesSection.title} text={d.lossesSection.intro} />
            <AutoGrid min={300} gap={12}>
              <For each={d.losses} by={(l) => l[0]}>
                {(l) => <LimitNote title={l[0]} text={l[1]} />}
              </For>
            </AutoGrid>
          </Wrap>
        </Section>
      </Reveal>

      {/* withdrawn */}
      <Reveal>
        <Section size="tight" id="withdrawn">
          <Wrap>
            <SectionHead label={H.withdrawn.label} title={H.withdrawn.title} text={H.withdrawn.text} />
            <WithdrawnList>
              <For each={d.withdrawn} by={(w) => w[0]}>
                {(w) => (
                  <WithdrawnRow>
                    <div>
                      <WithdrawnTag>withdrawn</WithdrawnTag>
                      <Struck>{w[0]}</Struck>
                    </div>
                    <Lede size="small">{renderInline(w[1])}</Lede>
                  </WithdrawnRow>
                )}
              </For>
            </WithdrawnList>
          </Wrap>
        </Section>
      </Reveal>

      {/* harness bugs */}
      <Reveal>
        <Section size="tight" id="harness">
          <Wrap>
            <SectionHead label={`${d.harnessBugs.count} harness bugs`} title={d.harnessBugs.title} text={d.harnessBugs.intro} />
            <AutoGrid min={300} gap={12} tag="ol">
              <For each={d.harnessBugs.items} by={(b) => b.title}>
                {(b) => (
                  <li>
                    <GlowCard padding="compact">
                      <Heading tag="h3" size="step">
                        {b.title}
                      </Heading>
                      <Lede size="small">{renderInline(b.text)}</Lede>
                      <Mono>
                        <For each={prNumbers(b.pr)} by={(n) => n}>
                          {(n) => (
                            <>
                              <a href={prHref(n)} rel="noopener">{`PR #${n}`}</a>{' '}
                            </>
                          )}
                        </For>
                      </Mono>
                    </GlowCard>
                  </li>
                )}
              </For>
            </AutoGrid>
          </Wrap>
        </Section>
      </Reveal>

      {/* reproduce */}
      <Section size="tight" id="reproduce">
        <Wrap>
          <SectionHead label="reproduce" title={d.reproduce.title} text={d.reproduce.intro} />
          <Stack>
            <AutoGrid cols={2} gap={16}>
              <CodeCard label="The row board, on your machine" code={d.reproduce.command} state="hot" />
              <CodeCard label="Every suite" caption={d.reproduce.note} code={d.reproduce.allSuites} />
            </AutoGrid>
            <Eyebrow>{`Competitors, installed and verified (${d.competitors.length})`}</Eyebrow>
            <ChipList>
              <For each={d.competitors} by={(c) => c}>
                {(c) => (
                  <li>
                    <Chip>{c}</Chip>
                  </li>
                )}
              </For>
            </ChipList>
            <CaveatLine text={d.caveat} link={{ label: 'How to run every suite →', href: '/docs/benchmarks' }} />
            <div>
              <Pill href="/docs/benchmarks" variant="solid" size="lg">
                Read the benchmarks guide
              </Pill>
            </div>
          </Stack>
        </Wrap>
      </Section>
    </>
  )
}
