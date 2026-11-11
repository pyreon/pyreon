import { For, Show } from '@pyreon/core'
import { fill } from '../../content/fill'
import type { BenchJumpId, BenchmarksPage as Data } from '../../content/types-site'
import { el, focusRing, tone, txt, type LinkAttrs } from '../../kit/bases'
import { LimitNote, NumberedCards } from '../../kit/blocks'
import { GlowCard } from '../../kit/cards'
import { CodeCard } from '../../kit/code'
import { Chip, Pill } from '../../kit/controls'
import { AutoGrid, Section, SectionHead, Wrap } from '../../kit/layout'
import { Reveal } from '../../kit/motion'
import { CaveatLine, Numeral } from '../../kit/proof'
import { Diagram, InlineTextLink } from '../../kit/story'
import { DataTable, TableDisclosure, TableNote } from '../../kit/table'
import { Eyebrow, Heading, Lede, renderInline } from '../../kit/type'
import { font, gradient, radius, text, weight } from '../../theme'
import { usePageHead } from '../../head'
import { BenchProducts, BenchReactivity, LiveRowBoard, LiveScaling } from './islands'
import { formatMs, formatUs, prNumbers, sortedRowBoard, type ProductBenchSummary } from './model'
import { VerdictNote } from './parts'

/**
 * `/benchmarks` — every dataset in `content/pages/benchmarks.json`, in the
 * order of the design's build brief: hero stats, method, row board, scenarios,
 * scaling, SSR, real-app shapes, bundle, reactivity, every product, every
 * loss, withdrawn claims, the harness bugs, reproduce. Every heading, label,
 * caption and note is the content's `template`; the code prints none.
 *
 * Static by default: every chart is first an SVG from the asset set (the
 * no-JS / reduced-data fallback) with its table as the text alternative. The
 * row board and the scaling chart are LIVE `@pyreon/charts` islands on top;
 * the reactivity engine switcher and the product filter are islands that
 * render their default selection on the server (`islands.ts`).
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

export interface BenchmarksView {
  data: Data
  products: ProductBenchSummary[]
  svgs: Record<string, string>
}

/**
 * The section ids, in page order: the jump links and the anchors other pages
 * use (`/benchmarks#row-board` from the home page, `#every-product` from the
 * nav). Their labels are `template.jumps`.
 */
export const BENCH_SECTIONS: readonly BenchJumpId[] = [
  'method',
  'row-board',
  'scenarios',
  'scaling',
  'ssr',
  'apps',
  'bundle',
  'reactivity',
  'every-product',
  'losses',
  'withdrawn',
  'harness',
  'reproduce',
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

const Stack = el.config({ name: 'BenchStack' }).attrs({ block: true, contentAlignX: 'block', gap: 20 }).theme(() => ({ minWidth: 0 }))

const ChartBox = el
  .config({ name: 'BenchChartBox' })
  .attrs({ block: true, contentAlignX: 'block', gap: 16 })
  .theme((_t, m) => ({
    minWidth: 0,
    padding: { xs: 16, md: 26 },
    borderRadius: radius.bench,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'well'),
    // A static chart is drawn for 960px; below 560px it scrolls inside its box
    // instead of shrinking past legibility (the table below is the text alternative).
    extendCss: `& [data-svg] { border: 0 !important; background: transparent !important; overflow-x: auto !important; }
      & [data-svg] svg { min-width: 560px; }`,
  }))

const Mono = txt
  .config({ name: 'BenchMono' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ display: 'block', fontFamily: font.mono, fontSize: text.mono.size, lineHeight: 1.55, color: tone(m, 'fog') }))

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

const prHref = (n: number) => `https://github.com/pyreon/pyreon/pull/${n}`

function ChartWithFallback(props: { svg: string | undefined; id: string; label: string; live?: unknown; children?: unknown }) {
  return (
    <ChartBox>
      {props.live as never}
      {props.svg ? (
        <div id={props.id}>
          <Diagram svg={props.svg} scrollLabel={props.label} />
        </div>
      ) : null}
      {props.children as never}
    </ChartBox>
  )
}

export function BenchmarksPage(props: { view: BenchmarksView }) {
  const d = props.view.data
  const T = d.template
  const svgs = props.view.svgs
  const products = props.view.products
  const recordDate = d.record.replace(/^BENCHMARKS\.md\s*/, '')

  usePageHead({ path: '/benchmarks', title: T.meta.title, description: T.meta.description })

  const runNote = (line: string) => <TableNote>{`${line} · ${d.caveat}`}</TableNote>
  const initial = T.rows.initial

  return (
    <>
      {/* hero */}
      <Section size="hero">
        <Wrap>
          <Eyebrow>{fill(T.hero.eyebrow, { date: recordDate, count: d.competitors.length })}</Eyebrow>
          <Heading tag="h1" size="hero">
            {T.hero.title}
          </Heading>
          <Lede size="hero">{T.hero.lede}</Lede>
          <HeroStats aria-label={T.hero.statsLabel}>
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
          <nav aria-label={T.hero.jumpsLabel}>
            <JumpList>
              <For each={BENCH_SECTIONS} by={(id) => id}>
                {(id) => (
                  <li>
                    <JumpLink href={`#${id}`}>{T.jumps[id]}</JumpLink>
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
          <SectionHead label={T.method.label} title={T.method.title} text={T.method.text} />
          <NumberedCards items={d.method.map(([title, body]) => ({ title, text: body }))} />
          <TableNote>
            {d.krausest} {T.method.guide.text} <InlineTextLink href={T.method.guide.link.href}>{T.method.guide.link.label}</InlineTextLink>.
          </TableNote>
        </Wrap>
      </Section>

      {/* row board */}
      <Reveal>
        <Section size="tight" id="row-board">
          <Wrap>
            <SectionHead label={T.rows.label} title={T.rows.title} text={T.rows.text} />
            <ChartWithFallback
              svg={svgs[BENCH_SVGS.rows]}
              id="rows-fallback"
              label={T.rows.chart}
              live={
                <LiveRowBoard
                  kind="rows"
                  fallbackId="rows-fallback"
                  frameworks={d.frameworks}
                  rowBoard={d.rowBoard}
                  rowVerdicts={d.rowVerdicts}
                  initial={initial}
                  copy={T.rows.live}
                />
              }
            >
              <TableDisclosure summary={T.rows.table}>
                <DataTable
                  caption={T.rows.caption}
                  columns={[T.rows.columns.op, ...d.frameworks, T.rows.columns.verdict]}
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
              {runNote(T.rows.run)}
            </ChartWithFallback>
            <Show when={() => !!d.rowBoard[initial]}>
              <TableNote>
                {fill(T.rows.fastestFirst, {
                  op: initial,
                  list: sortedRowBoard(d.frameworks, d.rowBoard[initial] ?? [])
                    .map((b) => `${b.name} ${formatMs(b.ms)}`)
                    .join(' · '),
                })}
              </TableNote>
            </Show>
          </Wrap>
        </Section>
      </Reveal>

      {/* scenarios */}
      <Reveal>
        <Section size="tight" id="scenarios">
          <Wrap>
            <SectionHead label={T.scenarios.label} title={T.scenarios.title} text={T.scenarios.text} />
            <DataTable
              columns={[T.scenarios.columns.op, T.scenarios.columns.pyreon, T.scenarios.columns.rival, T.scenarios.columns.verdict]}
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
            {runNote(T.scenarios.run)}
          </Wrap>
        </Section>
      </Reveal>

      {/* scaling */}
      <Reveal>
        <Section size="tight" id="scaling">
          <Wrap>
            <SectionHead label={T.scaling.label} title={T.scaling.title} text={T.scaling.text} />
            <ChartWithFallback
              svg={svgs[BENCH_SVGS.scaling]}
              id="scaling-fallback"
              label={T.scaling.chart}
              live={<LiveScaling kind="scaling" fallbackId="scaling-fallback" scaling={d.scaling} copy={T.scaling.live} />}
            >
              <TableDisclosure summary={T.scaling.table}>
                <For each={(['select', 'partial update', 'swap'] as const).filter((k) => k in d.scaling)} by={(k) => k}>
                  {(k) => (
                    <DataTable
                      caption={fill(T.scaling.caption, { op: k })}
                      columns={[T.scaling.columns.framework, ...d.scaling.sizes.map((size) => fill(T.scaling.columns.size, { size }))]}
                      rows={Object.entries(d.scaling[k]).map(([fw, values]) => ({
                        key: fw,
                        cells: [{ content: fw }, ...values.map((v) => ({ content: formatUs(v), num: true, hot: fw === 'Pyreon' }))],
                      }))}
                    />
                  )}
                </For>
              </TableDisclosure>
              {runNote(T.scaling.run)}
            </ChartWithFallback>
          </Wrap>
        </Section>
      </Reveal>

      {/* ssr */}
      <Reveal>
        <Section size="tight" id="ssr">
          <Wrap>
            <SectionHead label={T.ssr.label} title={T.ssr.title} text={T.ssr.text} />
            <ChartWithFallback svg={svgs[BENCH_SVGS.ssr]} id="ssr-chart" label={T.ssr.chart}>
              <TableDisclosure summary={T.ssr.table}>
                <DataTable
                  caption={T.ssr.caption}
                  columns={[T.ssr.columns.rows, T.ssr.columns.pyreon, T.ssr.columns.vue, T.ssr.columns.svelte, T.ssr.columns.react]}
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
              {runNote(T.ssr.run)}
            </ChartWithFallback>
          </Wrap>
        </Section>
      </Reveal>

      {/* real-app shapes */}
      <Reveal>
        <Section size="tight" id="apps">
          <Wrap>
            <SectionHead label={T.apps.label} title={T.apps.title} text={T.apps.text} />
            <Stack>
              <ChartWithFallback svg={svgs[BENCH_SVGS.forms]} id="forms-chart" label={T.apps.forms.chart}>
                <TableDisclosure summary={T.apps.forms.table}>
                  <DataTable
                    caption={T.apps.forms.caption}
                    columns={[T.apps.forms.columns.op, T.apps.forms.columns.pyreon, T.apps.forms.columns.rivals]}
                    rows={d.forms.map(([op, us, rivals]) => ({
                      key: op,
                      cells: [
                        { content: op },
                        { content: `${us} µs`, num: true, hot: true },
                        { content: rivals.map(([n, v]) => `${n} ${v} µs`).join(' · ') },
                      ],
                    }))}
                  />
                </TableDisclosure>
              </ChartWithFallback>
              <ChartWithFallback svg={svgs[BENCH_SVGS.todomvc]} id="todomvc-chart" label={T.apps.todomvc.chart}>
                <TableDisclosure summary={T.apps.todomvc.table}>
                  <DataTable
                    caption={T.apps.todomvc.caption}
                    columns={[T.apps.todomvc.columns.op, T.apps.todomvc.columns.pyreon, T.apps.todomvc.columns.react, T.apps.todomvc.columns.ratio]}
                    rows={d.todomvc.map(([op, p, r, ratio]) => ({
                      key: op,
                      cells: [{ content: op }, { content: p, num: true, hot: true }, { content: r, num: true }, { content: ratio, num: true }],
                    }))}
                  />
                </TableDisclosure>
              </ChartWithFallback>
            </Stack>
            {runNote(T.apps.run)}
          </Wrap>
        </Section>
      </Reveal>

      {/* bundle */}
      <Reveal>
        <Section size="tight" id="bundle">
          <Wrap>
            <SectionHead label={T.bundle.label} title={T.bundle.title} text={T.bundle.text} />
            <ChartWithFallback svg={svgs[BENCH_SVGS.bundle]} id="bundle-chart" label={T.bundle.chart}>
              <TableDisclosure summary={T.bundle.table}>
                <DataTable
                  caption={T.bundle.caption}
                  columns={[T.bundle.columns.framework, T.bundle.columns.kb]}
                  rows={d.bundle.map(([name, kb]) => ({ key: name, cells: [{ content: name }, { content: `${kb} KB`, num: true, hot: name === 'Pyreon' }] }))}
                />
              </TableDisclosure>
              {runNote(T.bundle.run)}
            </ChartWithFallback>
          </Wrap>
        </Section>
      </Reveal>

      {/* reactivity */}
      <Reveal>
        <Section size="tight" id="reactivity">
          <Wrap>
            <SectionHead label={T.reactivity.label} title={T.reactivity.title} text={T.reactivity.text} />
            <Stack>
              <BenchReactivity reactivity={d.reactivity} copy={T.reactivity} />
              {runNote(T.reactivity.run)}
            </Stack>
          </Wrap>
        </Section>
      </Reveal>

      {/* every product */}
      <Section size="tight" id="every-product">
        <Wrap>
          <SectionHead label={T.products.label} title={T.products.title} text={T.products.text} />
          <BenchProducts products={products} copy={T.products} />
        </Wrap>
      </Section>

      {/* every loss */}
      <Reveal>
        <Section size="tight" id="losses">
          <Wrap>
            <SectionHead label={T.losses.label} title={d.lossesSection.title} text={d.lossesSection.intro} />
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
            <SectionHead label={T.withdrawn.label} title={T.withdrawn.title} text={T.withdrawn.text} />
            <WithdrawnList>
              <For each={d.withdrawn} by={(w) => w[0]}>
                {(w) => (
                  <WithdrawnRow>
                    <div>
                      <WithdrawnTag>{T.withdrawn.tag}</WithdrawnTag>
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
            <SectionHead label={fill(T.harness.label, { count: d.harnessBugs.count })} title={d.harnessBugs.title} text={d.harnessBugs.intro} />
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
                              <InlineTextLink href={prHref(n)}>{fill(T.harness.pr, { n })}</InlineTextLink>{' '}
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
          <SectionHead label={T.reproduce.label} title={d.reproduce.title} text={d.reproduce.intro} />
          <Stack>
            <AutoGrid cols={2} gap={16}>
              <CodeCard label={T.reproduce.command} code={d.reproduce.command} state="hot" />
              <CodeCard label={T.reproduce.allSuites} caption={d.reproduce.note} code={d.reproduce.allSuites} />
            </AutoGrid>
            <Eyebrow>{fill(T.reproduce.competitors, { count: d.competitors.length })}</Eyebrow>
            <ChipList>
              <For each={d.competitors} by={(c) => c}>
                {(c) => (
                  <li>
                    <Chip>{c}</Chip>
                  </li>
                )}
              </For>
            </ChipList>
            <CaveatLine text={d.caveat} link={T.reproduce.more} />
            <div>
              <Pill href={T.reproduce.guide.href} variant="solid" size="lg">
                {T.reproduce.guide.label}
              </Pill>
            </div>
          </Stack>
        </Wrap>
      </Section>
    </>
  )
}
