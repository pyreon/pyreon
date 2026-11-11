import { For, Show } from '@pyreon/core'
import { island } from '@pyreon/zero'
import { fill, OPEN_COPY } from '../site/content/channels'
import { el, tone, txt } from '../site/kit/bases'
import { GlowCard } from '../site/kit/cards'
import { Pill } from '../site/kit/controls'
import { AutoGrid, Section, SectionHead, Wrap } from '../site/kit/layout'
import { CaveatLine } from '../site/kit/proof'
import { Reveal } from '../site/kit/motion'
import { LinkCards } from '../site/kit/story'
import { Eyebrow, Heading, Lede, renderInline } from '../site/kit/type'
import { font, text, weight } from '../site/theme'
import { downloadTiles, tileView, type TileView } from './model'
import { formatTimestamp, type OpenStats } from './stats'

/**
 * `/open` — the project in live numbers, fetched once per build
 * (`vite-plugins/open-stats.ts`), copy from `_channels.json`. Static HTML;
 * the download chart is the one island (tooltip, keyboard), and the server
 * renders its first frame as SVG.
 */

// The chart is interactive, so on this static page it is an island.
const TrendChartIsland = island(() => import('./TrendChart'), { name: 'OpenTrendChart', hydrate: 'visible', prefetch: 'idle' })

const Hero = el.config({ name: 'OpenHero' }).attrs({ block: true, contentAlignX: 'block', gap: 22 }).theme(() => ({ maxWidth: 860 }))
const Row = el.config({ name: 'OpenRow' }).attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 10 }).theme(() => ({ flexWrap: 'wrap' }))
const Stack = el.config({ name: 'OpenStack' }).attrs({ block: true, contentAlignX: 'block', gap: 18 })

const Updated = txt
  .config({ name: 'OpenUpdated' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, fontFamily: font.mono, fontSize: text.mono.size, color: tone(m, 'fog') }))

const Value = txt
  .config({ name: 'OpenValue' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({
    margin: 0,
    fontFamily: font.sans,
    fontSize: 'clamp(30px, 3.4vw, 42px)',
    lineHeight: 1.05,
    letterSpacing: '-.03em',
    fontWeight: weight.medium,
    color: tone(m, 'strong'),
    extendCss: 'font-variant-numeric: tabular-nums;',
  }))
  .states((_t, m) => ({
    default: {},
    missing: { fontSize: text.ui.size, lineHeight: 1.5, letterSpacing: 0, fontFamily: font.mono, color: tone(m, 'fog') },
  }))

const Hint = txt
  .config({ name: 'OpenHint' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, fontFamily: font.mono, fontSize: text.mono.size, lineHeight: 1.5, color: tone(m, 'fog') }))

const Figure = el
  .config({ name: 'OpenChart' })
  .attrs({ tag: 'figure', block: true, contentAlignX: 'block', gap: 12 })
  .theme((_t, m) => ({
    margin: 0,
    marginTop: 8,
    padding: { xs: 16, md: 24 },
    borderRadius: 22,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'card'),
    minWidth: 0,
    overflow: 'hidden',
    // The chart island sizes itself to its box: let the box shrink with the page.
    extendCss: '& > * { min-width: 0; max-width: 100%; } & canvas, & svg { max-width: 100%; }',
  }))

const Caption = txt
  .config({ name: 'OpenChartCaption' })
  .attrs({ tag: 'figcaption' })
  .theme((_t, m) => ({ fontFamily: font.sans, fontSize: text.small.size, lineHeight: text.small.lineHeight, color: tone(m, 'mist') }))

function Tile(props: { tile: TileView }) {
  const t = props.tile
  const body = (
    <>
      <Eyebrow>{t.label}</Eyebrow>
      {t.value !== null ? (
        <Value data-open-value="">{t.value}</Value>
      ) : (
        <Value state="missing" title={t.reason} data-open-value="">
          {OPEN_COPY.unavailable}
        </Value>
      )}
      <Show when={() => t.hint !== undefined}>
        <Hint>{t.hint ?? ''}</Hint>
      </Show>
    </>
  )
  return t.href ? (
    <GlowCard href={t.href} padding="compact">
      {body}
    </GlowCard>
  ) : (
    <GlowCard padding="compact">{body}</GlowCard>
  )
}

function Tiles(props: { tiles: readonly TileView[] }) {
  return (
    <AutoGrid min={220} gap={12} tag="ul">
      <For each={props.tiles} by={(t) => t.label}>
        {(t) => (
          <li>
            <Tile tile={t} />
          </li>
        )}
      </For>
    </AutoGrid>
  )
}

function DownloadTrend(props: { stats: OpenStats }) {
  const trend = props.stats.npm.trend
  if (!trend.ok) return <CaveatLine text={OPEN_COPY.downloads.chartMissing} />
  return (
    <Figure>
      <TrendChartIsland label={trend.value.label} points={trend.value.points} />
      <Caption>{fill(OPEN_COPY.downloads.chart, { package: trend.value.label })}</Caption>
    </Figure>
  )
}

export function OpenStatsView(props: { stats: OpenStats }) {
  const c = OPEN_COPY
  const stats = props.stats
  return (
    <>
      <Section size="hero">
        <Wrap>
          <Hero>
            <Eyebrow>{c.hero.eyebrow}</Eyebrow>
            <Heading tag="h1" size="hero">
              {c.hero.title}
            </Heading>
            <Lede size="hero">{renderInline(c.hero.lede)}</Lede>
            <Row>
              <For each={c.hero.actions} by={(a) => a.label}>
                {(a) => (
                  <Pill href={a.href ?? '/'} variant="solid">
                    {a.label}
                  </Pill>
                )}
              </For>
            </Row>
            <Updated>
              {`${c.updated} `}
              <time datetime={stats.generatedAt}>{formatTimestamp(stats.generatedAt)}</time>
            </Updated>
          </Hero>
        </Wrap>
      </Section>

      <Section size="tight" aria-labelledby="open-work">
        <Wrap>
          <SectionHead id="open-work" label={c.work.label} title={c.work.title} text={c.work.text} />
          <Stack>
            <Tiles tiles={c.work.tiles.map((t) => tileView(stats, t))} />
            <CaveatLine text={c.work.note} link={c.work.noteLink} />
          </Stack>
        </Wrap>
      </Section>

      <Reveal>
        <Section aria-labelledby="open-npm">
          <Wrap>
            <SectionHead id="open-npm" label={c.downloads.label} title={c.downloads.title} text={c.downloads.text} />
            <Stack>
              <Tiles tiles={downloadTiles(stats, c)} />
              <DownloadTrend stats={stats} />
            </Stack>
          </Wrap>
        </Section>
      </Reveal>

      <Reveal>
        <Section size="tight" aria-labelledby="open-community">
          <Wrap>
            <SectionHead id="open-community" label={c.community.label} title={c.community.title} text={c.community.text} />
            <Stack>
              <Tiles tiles={c.community.tiles.map((t) => tileView(stats, t))} />
              <Row>
                <For each={c.community.actions.map((a, i) => ({ a, i }))} by={(x) => x.i}>
                  {(x) => (
                    <Pill href={x.a.href ?? '/'} variant={x.i === 0 ? 'solid' : 'ghost'}>
                      {x.a.label}
                    </Pill>
                  )}
                </For>
              </Row>
            </Stack>
          </Wrap>
        </Section>
      </Reveal>

      <Reveal>
        <Section aria-labelledby="open-bench">
          <Wrap>
            <SectionHead id="open-bench" label={c.benchmarks.label} title={c.benchmarks.title} text={c.benchmarks.text} />
            <LinkCards items={c.benchmarks.links} />
          </Wrap>
        </Section>
      </Reveal>
    </>
  )
}
