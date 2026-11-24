import { For, Show } from '@pyreon/core'
import { island } from '@pyreon/zero'
import productsJson from '../../content/_products.json'
import { HOME, type HomeAi, type HomeHero, type HomeOnce, type HomeSectionData, type SectionOf } from '../../content/home'
import type { ProductsIndexPage } from '../../content/types-site'
import { SITE_NAME, SITE_ORIGIN, usePageHead } from '../../head'
import { VerdictChip } from '../../kit/bench'
import { CardFoot } from '../../kit/card-foot'
import { GlowCard, Glyph } from '../../kit/cards'
import { CodeBlock, CodeDiff } from '../../kit/code'
import { TerminalCard } from '../../kit/terminal'
import { InstallCommand, Pill } from '../../kit/controls'
import { Section, SectionHead } from '../../kit/layout'
import { AutoGrid, Box, Cluster, Grid, Stack, Text, Visible, Wrap } from '../../kit/primitives'
import { AnimatedSvg, Loop } from '../../kit/media'
import { Reveal } from '../../kit/motion'
import { CaveatLine, EndCTA, HookHero, Numeral, ProofBand, StatCard, type StatChartSource, TextLink } from '../../kit/proof'
import { Heading, Lede, renderInline, StatusDot, VisuallyHidden } from '../../kit/type'
import { productName, resolveHref } from '../../nav'
import proofBundle from '../../media/home/proof-bundle.svg?raw'
import proofCharts from '../../media/home/proof-charts.svg?raw'
import proofFlow from '../../media/home/proof-flow.svg?raw'
import proofForms from '../../media/home/proof-forms.svg?raw'
import proofI18n from '../../media/home/proof-i18n.svg?raw'
import proofRenderToString from '../../media/home/proof-render-to-string.svg?raw'
import proofRows from '../../media/home/proof-rows-10k.svg?raw'
import proofSsr from '../../media/home/proof-ssr.svg?raw'
import runsOnceTree from '../../media/home/runs-once-tree.svg?raw'
import { Badge } from '../../kit/badge'
import { Tag } from '../../kit/tag'
import { layout } from '../../theme'
import { Note } from '../../kit/note'
import {
  BenchList,
  BenchRow,
  Bullets,
  CardNum,
  CompareTable,
  CompatGrid,
  CompatPkg,
  DefList,
  Finding,
  MapTable,
  Pane,
  PaneHead,
  PhoneLoop,
  PhoneOnly,
  PhoneTarget,
  PhoneTargetName,
  PhoneTargets,
  PhoneTargetsHead,
  ProductCell,
  Split,
  StatusLabel,
  StripGrid,
  Strong,
  TableBox,
  TargetLabel,
  TargetLabels,
  TargetsGrid,
  Ticks,
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
const PROOF_CHARTS: readonly (StatChartSource & { source: string })[] = [
  { source: 'record §7 bundle', svg: proofBundle, file: 'home/proof-bundle.svg' },
  { source: 'record §1', svg: proofRows, file: 'home/proof-rows-10k.svg' },
  { source: 'record §5 bench:ssr', svg: proofSsr, file: 'home/proof-ssr.svg' },
]
const STRIP_CHARTS: Readonly<Record<string, StatChartSource>> = {
  '/products/charts#benchmarks': { svg: proofCharts, file: 'home/proof-charts.svg' },
  '/products/flow#benchmarks': { svg: proofFlow, file: 'home/proof-flow.svg' },
  '/products/form#benchmarks': { svg: proofForms, file: 'home/proof-forms.svg' },
  '/products/i18n#benchmarks': { svg: proofI18n, file: 'home/proof-i18n.svg' },
  '/benchmarks#ssr': { svg: proofRenderToString, file: 'home/proof-render-to-string.svg' },
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
          {/* TargetsGrid is `display: none` below layout.split, so the poster preload is limited to where it shows. */}
          <Loop media={v.media} eager preloadMedia={`(min-width: ${layout.split}px)`} />
          <TargetLabels aria-label="The three targets">
            <For each={v.targets} by={(t) => t.label}>
              {(t) => (
                <TargetLabel>
                  <Text variant="label" tone="fog" leading="normal">{t.label}</Text>
                  <span>{renderInline(t.caption)}</span>
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
          <Box padTop={175}>
            <Note size="caption">{renderInline(v.note)}</Note>
          </Box>
        </div>
      </TargetsGrid>
      <PhoneOnly>
        <PhoneTargetsHead>
          <Glyph id="pyreon" size={30} />
          <Text variant="label" tone="fog" leading="normal">{v.file.slice(v.file.lastIndexOf('/') + 1)}</Text>
        </PhoneTargetsHead>
        <PhoneTargets aria-label="The three targets">
          <For each={v.targets} by={(t) => t.label}>
            {(t) => (
              <PhoneTarget>
                <PhoneTargetName>{t.label}</PhoneTargetName>
                <span>{renderInline(t.caption)}</span>
              </PhoneTarget>
            )}
          </For>
        </PhoneTargets>
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
            return { stat: i.stat, label: i.label, detail: i.detail, condition: i.condition, chart }
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
          <Stack gap={275} alignY="top" selfStart shrink>
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
          <Stack gap={275} alignY="top" selfStart shrink>
            <GlowCard padding="flush">
              <CodeBlock code={s.counter.code} html={s.counter.codeHtml} label="Counter" />
              <CounterIsland metrics={s.counter.metrics} />
            </GlowCard>
            <Box padTop={175}>
              <Note size="caption">{s.counter.spec}</Note>
            </Box>
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
          <Stack gap={275} alignY="top" selfStart shrink>
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
            {(i) => (
              <li>
                <StatCard href={resolveHref(i.href)} stat={i.stat} label={i.label} lines={[i.rival]} note={i.condition} chart={STRIP_CHARTS[i.href]} />
              </li>
            )}
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
        <Visible from="split">
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
        </Visible>
        <Visible below="split">
          <AutoGrid min={260} gap={150}>
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
        </Visible>
        <Box padTop={175}>
          <Note size="caption">{renderInline(s.note)}</Note>
        </Box>
        <Box padTop={175}>
          <Note size="caption">
            <Text variant="mono" tone="fog" leading="normal">source: {s.source}</Text>
          </Note>
        </Box>
        <Box padTop={225}>
          <Cluster gap={275} alignY="center">
            <For each={s.links} by={(l) => l.href}>
              {(l) => link(l)}
            </For>
          </Cluster>
        </Box>
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
          <Stack gap={275} alignY="top" selfStart shrink>
            <SectionHead label={s.eyebrow} title={s.title} text={s.lede} level="landing" />
            <Ticks>
              <For each={s.points} by={(p) => p}>
                {(p) => <li>{renderInline(p)}</li>}
              </For>
            </Ticks>
            <InstallCommand command={s.install} />
            <Cluster gap={100} alignY="center">
              <StatusDot state={s.status.dot} />
              <TextLink href={resolveHref(s.status.href)}>{renderInline(s.status.text)}</TextLink>
            </Cluster>
            {link(s.link)}
          </Stack>
          <Stack gap={275} alignY="top" selfStart shrink>
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
                <Badge tone="experimental" size="sm" placement="after">experimental</Badge>
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
          <Stack gap={275} alignY="top" selfStart shrink>
            <SectionHead label={s.eyebrow} title={s.title} text={s.lede} level="landing" />
            <AutoGrid min={220} gap={275}>
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
          <Stack gap={275} alignY="top" selfStart shrink>
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
        <AutoGrid cols={2} gap={150} tag="ul">
          <For each={s.items.map((item, i) => ({ item, n: String(i + 1).padStart(2, '0') }))} by={(x) => x.item.title}>
            {(x) => (
              <li>
                <GlowCard state={x.n === '01' ? 'hot' : 'default'}>
                  <CardNum>{x.n}</CardNum>
                  <Heading tag="h3" size="step" style="margin:0">
                    {renderInline(x.item.title)}
                  </Heading>
                  <Lede size="small">{renderInline(x.item.text)}</Lede>
                  <Cluster gap={100} alignY="center" aria-label="Products">
                    <For each={x.item.tags} by={(t) => t}>
                      {(t) => <Tag size="sm" href={`/products/${t}`}>{productName(t)}</Tag>}
                    </For>
                  </Cluster>
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
        <Grid tag="ul" columns={{ xs: 1, lg: 6 }} gap={150}>
          <For each={featured} by={(f) => f.id}>
            {(f) => (
              <ProductCell size={f.width}>
                <GlowCard href={resolveHref(f.p.href)} state={f.width === 'full' ? 'hot' : 'default'}>
                  <Heading tag="h3" size="step" style="margin:0">
                    {f.p.name}
                    {f.p.status ? <Badge tone="experimental" size="sm" placement="after">{f.p.status}</Badge> : null}
                  </Heading>
                  <Lede size="small">{renderInline(f.p.pitch)}</Lede>
                  <CardFoot label={<Text variant="mono" tone="fog" leading="normal">{f.p.package}</Text>}>
                    <Show when={() => !!f.p.proof}>
                      <Lede size="small">
                        <Numeral tag="span" size="inline">
                          {f.p.proof?.stat}
                        </Numeral>{' '}
                        {renderInline(f.p.proof?.label ?? '')}
                      </Lede>
                      <Text variant="mono" tone="fog" leading="normal">{f.p.proof?.condition}</Text>
                    </Show>
                  </CardFoot>
                </GlowCard>
              </ProductCell>
            )}
          </For>
        </Grid>
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
        <Stack gap={275} alignY="top" selfStart shrink>
          <CompatGrid>
            <For each={s.layers} by={(l) => l.href}>
              {(l) => (
                <li>
                  <GlowCard href={resolveHref(l.href)} padding="compact">
                    <Heading tag="h3" size="step" style="margin:0">
                      {l.name}
                    </Heading>
                    {/* "@pyreon/" then the whole name: one break opportunity, after the scope. */}
                    <CompatPkg>
                      {l.package.slice(0, l.package.indexOf('/') + 1)}
                      <wbr />
                      <span>{l.package.slice(l.package.indexOf('/') + 1)}</span>
                    </CompatPkg>
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
        <Stack gap={275} alignY="top" selfStart shrink>
          <AutoGrid cols={3} gap={150}>
            <For each={s.columns} by={(c) => c.label}>
              {(c) => (
                <GlowCard>
                  <StatusLabel state={c.dot}>
                    <StatusDot state={c.dot} />
                    {c.label}
                  </StatusLabel>
                  <Heading tag="h3" size="step" style="margin:0">
                    {renderInline(c.title)}
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
          <Stack gap={275} alignY="top" selfStart shrink>
            <SectionHead label={s.eyebrow} title={s.title} text={s.lede} level="landing" />
            {link(s.link)}
          </Stack>
          <div>
            <TerminalCard label="bash" lines={commandSteps(s.command)} copy={s.command} aria-label={s.title} />
          </div>
        </Split>
        <div style="margin-top:40px">
          <AutoGrid min={220} gap={150}>
            <For each={s.items} by={(i) => i.title}>
              {(i) => (
                <GlowCard>
                  <Heading tag="h3" size="step" style="margin:0">
                    {renderInline(i.title)}
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
