import { For, Show } from '@pyreon/core'
import { island } from '@pyreon/zero'
import productsJson from '../../content/_products.json'
import { HOME, type HomeAi, type HomeHero, type HomeOnce, type HomeSectionData, type SectionOf } from '../../content/home'
import type { ProductsIndexPage } from '../../content/types-site'
import { SITE_NAME, SITE_ORIGIN, usePageHead } from '../../head'
import { VerdictChip } from '../../kit/bench'
import { GlowCard } from '../../kit/cards'
import { CodeBlock, CodeDiff } from '../../kit/code'
import { InstallCommand, Pill } from '../../kit/controls'
import { CopyButtonIsland } from '../../kit/islands'
import { AutoGrid, Section, SectionHead, Wrap } from '../../kit/layout'
import { AnimatedSvg, Loop } from '../../kit/media'
import { Reveal } from '../../kit/motion'
import { CaveatLine, EndCTA, HookHero, Numeral, ProofBand, TextLink } from '../../kit/proof'
import { Heading, Lede, renderInline, StatusBadge, StatusDot, VisuallyHidden } from '../../kit/type'
import { productName, resolveHref } from '../../nav'
import heroTrace from '../../media/home/hero-trace.svg?raw'
import proofBundle from '../../media/home/proof-bundle.svg?raw'
import proofCharts from '../../media/home/proof-charts.svg?raw'
import proofFlow from '../../media/home/proof-flow.svg?raw'
import proofForms from '../../media/home/proof-forms.svg?raw'
import proofI18n from '../../media/home/proof-i18n.svg?raw'
import proofRenderToString from '../../media/home/proof-render-to-string.svg?raw'
import proofRows from '../../media/home/proof-rows-10k.svg?raw'
import proofSsr from '../../media/home/proof-ssr.svg?raw'
import runsOnceTree from '../../media/home/runs-once-tree.svg?raw'
import {
  Arrow,
  BenchList,
  BenchRow,
  Bullets,
  CardNum,
  ChartSlot,
  CompareTable,
  CompatGrid,
  DefList,
  Finding,
  MapTable,
  Mono,
  NarrowOnly,
  Note,
  Pane,
  PaneHead,
  PhoneLoop,
  PhoneOnly,
  ProductCell,
  ProductsGrid,
  Prompt,
  Row,
  Split,
  Stack,
  StatusLabel,
  StripGrid,
  StripLabel,
  Strong,
  TableBox,
  TagLink,
  TargetLabel,
  TargetLabels,
  TargetsGrid,
  TermFoot,
  Terminal,
  Ticks,
  WideOnly,
} from './parts'

/** The live counter (an island on the real @pyreon/core); loads when it nears the viewport. */
const CounterIsland = island(() => import('./CounterDemo'), { name: 'HomeCounter', hydrate: 'visible', prefetch: 'idle' })

const PRODUCTS = (productsJson as unknown as ProductsIndexPage).products
const productById = new Map(PRODUCTS.map((p) => [p.id, p]))

/**
 * The proof charts from the asset set, matched to the figure they draw: proof
 * band items by their record source (the manifest's `source` starts with the
 * content's), strip cards by the page they link to.
 */
const PROOF_CHARTS: readonly { source: string; svg: string; file: string }[] = [
  { source: 'record §7 bundle', svg: proofBundle, file: 'home/proof-bundle.svg' },
  { source: 'record §1', svg: proofRows, file: 'home/proof-rows-10k.svg' },
  { source: 'record §5 bench:ssr', svg: proofSsr, file: 'home/proof-ssr.svg' },
]
const STRIP_CHARTS: Readonly<Record<string, { svg: string; file: string }>> = {
  '/products/charts#benchmarks': { svg: proofCharts, file: 'home/proof-charts.svg' },
  '/products/flow#benchmarks': { svg: proofFlow, file: 'home/proof-flow.svg' },
  '/products/form#benchmarks': { svg: proofForms, file: 'home/proof-forms.svg' },
  '/products/i18n#benchmarks': { svg: proofI18n, file: 'home/proof-i18n.svg' },
  '/benchmarks#ssr': { svg: proofRenderToString, file: 'home/proof-render-to-string.svg' },
}

/** A chart that repeats the figures printed next to it: decorative for assistive tech. */
function ChartArt(props: { svg: string; file: string }) {
  return (
    <ChartSlot aria-hidden="true">
      <AnimatedSvg file={props.file} markup={props.svg} />
    </ChartSlot>
  )
}

const link = (l: { label: string; href: string }) => <TextLink href={resolveHref(l.href)}>{`${l.label} →`}</TextLink>

// ─── Sections ──────────────────────────────────────────────────────────────

function Hero(props: { s: HomeHero }) {
  const s = props.s
  const v = s.visual
  return (
    <HookHero
      id={s.id}
      eyebrow={s.eyebrow}
      title={s.title}
      emberWord={s.emberWord}
      lede={s.lede}
      install={s.install}
      ctas={s.ctas.map((c) => ({ label: c.label, href: resolveHref(c.href) }))}
      status={s.status}
    >
      <TargetsGrid>
        <Pane>
          <PaneHead>
            <span>{v.file.slice(v.file.lastIndexOf('/') + 1)}</span>
            <span>{v.fileNote}</span>
          </PaneHead>
          <CodeBlock code={v.code} html={v.codeHtml} label={v.file} />
        </Pane>
        <div>
          <Loop media={v.media} eager />
          <TargetLabels aria-label="The three targets">
            <For each={v.targets} by={(t) => t.label}>
              {(t) => (
                <TargetLabel>
                  <Mono state="upper">{t.label}</Mono>
                  <span>{t.caption}</span>
                </TargetLabel>
              )}
            </For>
          </TargetLabels>
          <VisuallyHidden>
            <ul aria-label="The todos in the app">
              <For each={v.items} by={(i) => i}>
                {(i) => <li>{i}</li>}
              </For>
            </ul>
          </VisuallyHidden>
          <Note>{v.note}</Note>
        </div>
      </TargetsGrid>
      <PhoneOnly>
        <AnimatedSvg file="home/hero-trace.svg" markup={heroTrace} />
      </PhoneOnly>
    </HookHero>
  )
}

function ProofSection(props: { s: SectionOf<'proof-band'> }) {
  const s = props.s
  return (
    <Section size="tight" id={s.id}>
      <Wrap>
        <ProofBand
          title={s.title}
          caveat={s.caveat}
          link={{ label: s.link.label, href: resolveHref(s.link.href) }}
          items={s.items.map((i) => {
            const chart = PROOF_CHARTS.find((c) => i.source.startsWith(c.source))
            return { stat: i.stat, label: i.label, detail: i.detail, condition: i.condition, visual: chart ? <ChartArt svg={chart.svg} file={chart.file} /> : undefined }
          })}
        />
      </Wrap>
    </Section>
  )
}

function Once(props: { s: HomeOnce }) {
  const s = props.s
  return (
    <Section id={s.id}>
      <Wrap>
        <Split>
          <Stack size="md">
            <SectionHead label={s.eyebrow} title={s.title} text={s.lede} level="landing" />
            <BenchList aria-label="Row board results">
              <For each={s.bench} by={(b) => b.op + b.rival}>
                {(b) => (
                  <BenchRow>
                    <span>
                      <Strong>{b.op}</Strong> {b.rival}
                      <br />
                      {b.result}
                    </span>
                    <VerdictChip verdict={b.verdict} />
                  </BenchRow>
                )}
              </For>
            </BenchList>
            <CaveatLine text={s.caveat} link={{ label: s.link.label, href: resolveHref(s.link.href) }} />
          </Stack>
          <Stack size="md">
            <GlowCard padding="flush">
              <CodeBlock code={s.counter.code} html={s.counter.codeHtml} label="Counter" />
              <CounterIsland metrics={s.counter.metrics} />
            </GlowCard>
            <Note>{s.counter.spec}</Note>
            <AnimatedSvg file="home/runs-once-tree.svg" markup={runsOnceTree} />
          </Stack>
        </Split>
      </Wrap>
    </Section>
  )
}

function DiffSection(props: { s: SectionOf<'diff'> }) {
  const s = props.s
  return (
    <Section id={s.id}>
      <Wrap>
        <Split>
          <Stack size="md">
            <SectionHead label={s.eyebrow} title={s.title} text={s.lede} level="landing" />
            {link(s.link)}
          </Stack>
          <CodeDiff rows={s.rows} caption={s.caption} label={s.title} />
        </Split>
      </Wrap>
    </Section>
  )
}

function Strip(props: { s: SectionOf<'strip'> }) {
  const s = props.s
  return (
    <Section id={s.id}>
      <Wrap>
        <SectionHead label={s.eyebrow} title={s.title} text={s.lede} level="landing" />
        <StripGrid>
          <For each={s.items} by={(i) => i.href}>
            {(i) => {
              const chart = STRIP_CHARTS[i.href]
              return (
                <li>
                  <GlowCard href={resolveHref(i.href)} padding="compact">
                    <span>
                      <Numeral tag="span" size="strip">
                        {i.stat}
                      </Numeral>{' '}
                      <StripLabel>{renderInline(i.label)}</StripLabel>
                    </span>
                    <Mono>{i.rival}</Mono>
                    <Mono>{i.condition}</Mono>
                    {chart ? <ChartArt svg={chart.svg} file={chart.file} /> : null}
                  </GlowCard>
                </li>
              )
            }}
          </For>
        </StripGrid>
        <div style="margin-top:18px">
          <CaveatLine text={s.caveat} link={{ label: s.link.label, href: resolveHref(s.link.href) }} />
        </div>
      </Wrap>
    </Section>
  )
}

function Compare(props: { s: SectionOf<'compare'> }) {
  const s = props.s
  const us = s.columns[0]
  return (
    <Section id={s.id}>
      <Wrap>
        <SectionHead label={s.eyebrow} title={s.title} text={s.lede} level="landing" />
        <WideOnly>
          <TableBox tag="section" tabIndex={0} aria-label={s.title}>
            <CompareTable>
              <thead>
                <tr>
                  <td />
                  <For each={s.columns} by={(c) => c}>
                    {(c) => (
                      <th scope="col" class={c === us ? 'us' : undefined}>
                        {c}
                      </th>
                    )}
                  </For>
                </tr>
              </thead>
              <tbody>
                <For each={s.rows} by={(r) => r.topic}>
                  {(r) => (
                    <tr class={r.pyreonBehind ? 'behind' : undefined}>
                      <th scope="row">{r.topic}</th>
                      <For each={r.cells.map((cell, i) => ({ cell, i }))} by={(c) => c.i}>
                        {(c) => <td class={c.i === 0 ? 'us' : undefined}>{c.cell}</td>}
                      </For>
                    </tr>
                  )}
                </For>
              </tbody>
            </CompareTable>
          </TableBox>
        </WideOnly>
        <NarrowOnly>
          <AutoGrid min={260} gap={12}>
            <For each={s.columns.map((c, i) => ({ c, i }))} by={(c) => c.c}>
              {(col) => (
                <GlowCard padding="compact" state={col.i === 0 ? 'hot' : 'default'}>
                  <Heading tag="h3" size="step" style="margin:0">
                    {col.c}
                  </Heading>
                  <DefList>
                    <For each={s.rows} by={(r) => r.topic}>
                      {(r) => (
                        <>
                          <dt>{r.topic}</dt>
                          <dd class={col.i === 0 && r.pyreonBehind ? 'behind' : undefined}>{r.cells[col.i]}</dd>
                        </>
                      )}
                    </For>
                  </DefList>
                </GlowCard>
              )}
            </For>
          </AutoGrid>
        </NarrowOnly>
        <Note>{s.note}</Note>
        <Note>
          <Mono>source: {s.source}</Mono>
        </Note>
        <Row style="margin-top:18px;gap:22px">
          <For each={s.links} by={(l) => l.href}>
            {(l) => link(l)}
          </For>
        </Row>
      </Wrap>
    </Section>
  )
}

function Platforms(props: { s: SectionOf<'platforms'>; media: HomeHero['visual']['media'] | undefined }) {
  const s = props.s
  return (
    <Section id={s.id}>
      <Wrap>
        <Split>
          <Stack size="md">
            <SectionHead label={s.eyebrow} title={s.title} text={s.lede} level="landing" />
            <Ticks>
              <For each={s.points} by={(p) => p}>
                {(p) => <li>{renderInline(p)}</li>}
              </For>
            </Ticks>
            <InstallCommand command={s.install} />
            <Row>
              <StatusDot state={s.status.dot} />
              <TextLink href={resolveHref(s.status.href)}>{s.status.text}</TextLink>
            </Row>
            {link(s.link)}
          </Stack>
          <Stack size="md">
            <GlowCard>
              <MapTable aria-label={s.eyebrow}>
                <thead>
                  <tr>
                    <th scope="col">Pyreon</th>
                    <th scope="col">iOS</th>
                    <th scope="col">Android</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={s.mappings} by={(m) => m.pyreon}>
                    {(m) => (
                      <tr>
                        <td>{m.pyreon}</td>
                        <td>{m.ios}</td>
                        <td>{m.android}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </MapTable>
              <span>
                <StatusBadge>experimental</StatusBadge>
              </span>
            </GlowCard>
            {props.media ? (
              <PhoneLoop>
                <Loop media={props.media} />
              </PhoneLoop>
            ) : null}
          </Stack>
        </Split>
      </Wrap>
    </Section>
  )
}

function Ai(props: { s: HomeAi }) {
  const s = props.s
  return (
    <Section id={s.id}>
      <Wrap>
        <Split>
          <Stack size="md">
            <SectionHead label={s.eyebrow} title={s.title} text={s.lede} level="landing" />
            <AutoGrid min={220} gap={22}>
              <For each={s.items} by={(i) => i.name}>
                {(i) => (
                  <div>
                    <Heading tag="h3" size="step" style="margin:0 0 6px">
                      {i.name}
                    </Heading>
                    <Lede size="small">{renderInline(i.text)}</Lede>
                  </div>
                )}
              </For>
            </AutoGrid>
          </Stack>
          <Stack size="md">
            <Pane>
              <CodeBlock code={s.example.code} html={s.example.codeHtml} label={s.eyebrow} />
              <Finding>{s.example.finding}</Finding>
            </Pane>
            <InstallCommand command={s.install} />
            {link(s.link)}
          </Stack>
        </Split>
      </Wrap>
    </Section>
  )
}

function Audiences(props: { s: SectionOf<'audiences'> }) {
  const s = props.s
  return (
    <Section id={s.id}>
      <Wrap>
        <SectionHead label={s.eyebrow} title={s.title} text={s.lede} level="landing" />
        <AutoGrid cols={2} gap={12} tag="ul">
          <For each={s.items.map((item, i) => ({ item, n: String(i + 1).padStart(2, '0') }))} by={(x) => x.item.title}>
            {(x) => (
              <li>
                <GlowCard state={x.n === '01' ? 'hot' : 'default'}>
                  <CardNum>{x.n}</CardNum>
                  <Heading tag="h3" size="step" style="margin:0">
                    {x.item.title}
                  </Heading>
                  <Lede size="small">{renderInline(x.item.text)}</Lede>
                  <Row aria-label="Products">
                    <For each={x.item.tags} by={(t) => t}>
                      {(t) => <TagLink href={`/products/${t}`}>{productName(t)}</TagLink>}
                    </For>
                  </Row>
                </GlowCard>
              </li>
            )}
          </For>
        </AutoGrid>
      </Wrap>
    </Section>
  )
}

function Products(props: { s: SectionOf<'products'> }) {
  const s = props.s
  const featured = s.featured.flatMap((f) => {
    const p = productById.get(f.id)
    return p ? [{ ...f, p }] : []
  })
  return (
    <Section id={s.id}>
      <Wrap>
        <SectionHead label={s.eyebrow} title={s.title} text={s.lede} level="landing" />
        <ProductsGrid>
          <For each={featured} by={(f) => f.id}>
            {(f) => (
              <ProductCell size={f.width}>
                <GlowCard href={resolveHref(f.p.href)} state={f.width === 'full' ? 'hot' : 'default'}>
                  <Heading tag="h3" size="step" style="margin:0">
                    {f.p.name}
                    {f.p.status ? <StatusBadge>{f.p.status}</StatusBadge> : null}
                  </Heading>
                  <Mono>{f.p.package}</Mono>
                  <Lede size="small">{renderInline(f.p.pitch)}</Lede>
                  <Show when={() => !!f.p.proof}>
                    <Lede size="small">
                      <Numeral tag="span" size="strip" style="font-size:22px">
                        {f.p.proof?.stat}
                      </Numeral>{' '}
                      {renderInline(f.p.proof?.label ?? '')}
                    </Lede>
                    <Mono>{f.p.proof?.condition}</Mono>
                  </Show>
                  <Arrow>→</Arrow>
                </GlowCard>
              </ProductCell>
            )}
          </For>
        </ProductsGrid>
        <div style="margin-top:26px">
          <Pill href={resolveHref(s.link.href)} variant="solid" size="lg">
            {s.link.label}
          </Pill>
        </div>
      </Wrap>
    </Section>
  )
}

function Migrate(props: { s: SectionOf<'migrate'> }) {
  const s = props.s
  return (
    <Section id={s.id}>
      <Wrap>
        <SectionHead label={s.eyebrow} title={s.title} text={s.lede} level="landing" />
        <Stack size="md">
          <CompatGrid>
            <For each={s.layers} by={(l) => l.href}>
              {(l) => (
                <li>
                  <GlowCard href={resolveHref(l.href)} padding="compact">
                    <Heading tag="h3" size="step" style="margin:0">
                      {l.name}
                    </Heading>
                    <Mono>{l.package}</Mono>
                  </GlowCard>
                </li>
              )}
            </For>
          </CompatGrid>
          <InstallCommand command={s.install} />
          {link(s.link)}
        </Stack>
      </Wrap>
    </Section>
  )
}

function Status(props: { s: SectionOf<'status'> }) {
  const s = props.s
  return (
    <Section id={s.id}>
      <Wrap>
        <SectionHead label={s.eyebrow} title={s.title} text={s.lede} level="landing" />
        <Stack size="md">
          <AutoGrid cols={3} gap={12}>
            <For each={s.columns} by={(c) => c.label}>
              {(c) => (
                <GlowCard>
                  <StatusLabel state={c.dot}>
                    <StatusDot state={c.dot} />
                    {c.label}
                  </StatusLabel>
                  <Heading tag="h3" size="step" style="margin:0">
                    {c.title}
                  </Heading>
                  <Bullets>
                    <For each={c.items} by={(i) => i}>
                      {(i) => <li>{renderInline(i)}</li>}
                    </For>
                  </Bullets>
                </GlowCard>
              )}
            </For>
          </AutoGrid>
          {link(s.link)}
        </Stack>
      </Wrap>
    </Section>
  )
}

/** The reproduce command, shown one step per line (it is copied as written). */
export function commandSteps(command: string): string[] {
  return command
    .split('\n')
    .flatMap((line) => line.split(' && '))
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

function Evidence(props: { s: SectionOf<'evidence'> }) {
  const s = props.s
  return (
    <Section id={s.id}>
      <Wrap>
        <Split>
          <Stack size="md">
            <SectionHead label={s.eyebrow} title={s.title} text={s.lede} level="landing" />
            {link(s.link)}
          </Stack>
          <div>
            <Terminal tag="section" tabIndex={0} aria-label={s.title}>
              <For each={commandSteps(s.command).map((line, i) => ({ line, i }))} by={(l) => l.i}>
                {(l) => (
                  <div>
                    <Prompt>$</Prompt>
                    {l.line}
                  </div>
                )}
              </For>
            </Terminal>
            <TermFoot>
              <CopyButtonIsland text={s.command} />
            </TermFoot>
          </div>
        </Split>
        <div style="margin-top:40px">
          <AutoGrid min={220} gap={12}>
            <For each={s.items} by={(i) => i.title}>
              {(i) => (
                <GlowCard>
                  <Heading tag="h3" size="step" style="margin:0">
                    {i.title}
                  </Heading>
                  <Lede size="small">{renderInline(i.text)}</Lede>
                </GlowCard>
              )}
            </For>
          </AutoGrid>
        </div>
      </Wrap>
    </Section>
  )
}

/** The closing line's ember phrase: its last two words ("one line."). */
export function lastPhrase(title: string, words = 2): string {
  return title.trim().split(/\s+/).slice(-words).join(' ')
}

function Cta(props: { s: SectionOf<'cta'> }) {
  const s = props.s
  return (
    <EndCTA
      id={s.id}
      title={s.title}
      emberWord={lastPhrase(s.title)}
      lede={s.lede}
      install={s.install}
      primary={{ label: s.secondary.label, href: resolveHref(s.secondary.href) }}
      native={s.native}
      links={s.community.map((l) => ({ label: l.label, href: resolveHref(l.href) }))}
    />
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────

function SectionView(props: { s: HomeSectionData; media: HomeHero['visual']['media'] | undefined }) {
  const s = props.s
  switch (s.kind) {
    case 'hero':
      return <Hero s={s} />
    case 'proof-band':
      return <ProofSection s={s} />
    case 'once':
      return <Reveal>{<Once s={s} />}</Reveal>
    case 'diff':
      return <Reveal>{<DiffSection s={s} />}</Reveal>
    case 'strip':
      return <Reveal>{<Strip s={s} />}</Reveal>
    case 'compare':
      return <Reveal>{<Compare s={s} />}</Reveal>
    case 'platforms':
      return <Reveal>{<Platforms s={s} media={props.media} />}</Reveal>
    case 'ai':
      return <Reveal>{<Ai s={s} />}</Reveal>
    case 'audiences':
      return <Reveal>{<Audiences s={s} />}</Reveal>
    case 'products':
      return <Reveal>{<Products s={s} />}</Reveal>
    case 'migrate':
      return <Reveal>{<Migrate s={s} />}</Reveal>
    case 'status':
      return <Reveal>{<Status s={s} />}</Reveal>
    case 'evidence':
      return <Reveal>{<Evidence s={s} />}</Reveal>
    case 'cta':
      return <Cta s={s} />
  }
}

/** Structured data for the homepage: the site and the organisation behind it. */
export const HOME_JSON_LD = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: `${SITE_ORIGIN}/`,
    description: HOME.meta.description,
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: `${SITE_ORIGIN}/`,
    logo: `${SITE_ORIGIN}/brand/icon-512.png`,
    sameAs: ['https://github.com/pyreon/pyreon'],
  },
]

/** `/` — every section of `_home.json`, in its order (visual-alignment.md §B, `home`). */
export function HomePage() {
  usePageHead({ path: '/', title: HOME.meta.title, description: HOME.meta.description, jsonLd: HOME_JSON_LD })
  const hero = HOME.sections.find((s): s is HomeHero => s.kind === 'hero')
  return (
    <For each={HOME.sections} by={(s) => s.id}>
      {(s) => <SectionView s={s} media={hero?.visual.media} />}
    </For>
  )
}
