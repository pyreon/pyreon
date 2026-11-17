import type { VNodeChild } from '@pyreon/core'
import { For, Show } from '@pyreon/core'
import type { ProjectPage as Data } from '../content/types-site'
import type { ReleaseData } from '../releases/parse'
import { el, focusRing, tone, txt, type LinkAttrs, tapArea } from '../kit/bases'
import { GlowCard } from '../kit/cards'
import { InstallCommand, Pill } from '../kit/controls'
import { inlineText } from '../kit/inline'
import { Section, SectionHead } from '../kit/layout'
import { AutoGrid, Cluster, Stack, Text, Wrap } from '../kit/primitives'
import { CaveatLine } from '../kit/proof'
import { Eyebrow, Heading, Lede, renderInline } from '../kit/type'
import { font, radius, text, weight } from '../theme'
import { mediaUrl } from '../kit/assets'
import { Picture } from '../kit/media'
import { usePageHead } from '../head'
import { SiteSections, type SectionFigure } from './SiteSections'
import { Badge } from '../kit/badge'
import { Tag } from '../kit/tag'

/**
 * `/status`, `/releases`, `/community`, `/brand` — the "plain" template
 * (`content/pages/project/<id>.json`): a short hero, the content's sections,
 * a closing call to action. Two pages add data the content set cannot hold:
 * `/releases` the release history read from the repository at build time
 * (`virtual:pyreon-site-releases`), `/brand` the downloadable logo pack and
 * the brand images from the asset set.
 */
export interface ProjectView {
  page: Data
  releases?: ReleaseData | undefined
}

/** Files the brand page shows or offers (copied by scripts/sync-site-content.ts). */
export const BRAND_IMAGES = {
  // A theme pair: `Picture` renders both, CSS shows the one for the theme.
  clearSpace: 'brand/clear-space-dark.png',
  typeSpecimen: 'brand/type-specimen-dark.png',
  swatches: ['brand/swatches-dark.png', 'brand/swatches-light.png'],
} as const
export const BRAND_PACK = 'brand/logo-pack.zip'

const Hero = el.config({ name: 'ProjectHero' }).attrs({ block: true, contentAlignX: 'block' }).theme(() => ({ maxWidth: 860 }))

const EntryList = el
  .config({ name: 'ReleaseEntries' })
  .attrs({ tag: 'ul', block: true, gap: 10 })
  .theme(() => ({ listStyle: 'none', margin: 0, marginTop: 12, padding: 0 }))

const Entry = txt
  .config({ name: 'ReleaseEntry' })
  .attrs({ tag: 'li' })
  .theme((_t, m) => ({ fontFamily: font.sans, fontSize: text.small.size, lineHeight: text.small.lineHeight, color: tone(m, 'mist') }))

const PrLink = el
  .config({ name: 'ReleasePr' })
  .attrs<LinkAttrs>({ tag: 'a' })
  .theme((_t, m) => ({ fontFamily: font.mono, fontSize: text.mono.size, color: tone(m, 'link'), focus: focusRing(m), borderRadius: 2,
    extendCss: tapArea,
  }))

const Version = txt
  .config({ name: 'ReleaseVersion' })
  .attrs({ tag: 'h3' })
  .theme((_t, m) => ({ margin: 0, fontFamily: font.mono, fontSize: 22, fontWeight: weight.medium, color: tone(m, 'strong') }))

const Figure = el
  .config({ name: 'BrandFigure' })
  .attrs({ block: true })
  .theme((_t, m) => ({
    borderRadius: radius.card,
    overflow: 'hidden',
    border: '1px solid',
    borderColor: tone(m, 'line'),
    extendCss: '& img { display: block; width: 100%; height: auto; }',
  }))

const EndRow = el
  .config({ name: 'ProjectEndRow' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignX: 'center', contentAlignY: 'center', gap: 12 })
  .theme(() => ({ flexWrap: 'wrap', textAlign: 'center' }))

function Releases(props: { data: ReleaseData }) {
  const d = props.data
  if (!d.ok) {
    return <CaveatLine text={`The release history is unavailable in this build (${d.reason}). It comes back with the next deploy.`} link={{ label: 'Releases on GitHub →', href: 'https://github.com/pyreon/pyreon/releases' }} />
  }
  return (
    <Stack gap={250}>
      <SectionHead label="from the repository" title="What shipped, read from the changelogs." text="Built from every published package's CHANGELOG.md and the changesets on main when this page was built. Each change is listed once, with its pull request." />
      <Show when={() => d.unreleased !== null}>
        <GlowCard state="hot">
          <Eyebrow state="accent">
            unreleased · on main
            <Badge tone="experimental" size="sm" placement="after">next release</Badge>
          </Eyebrow>
          <Heading tag="h3" size="card">
            {`${d.unreleased?.count ?? 0} changesets waiting for the next release`}
          </Heading>
          <Lede size="small">{`${d.unreleased?.minor ?? 0} with a minor bump, ${d.unreleased?.patch ?? 0} patch only. Most touched:`}</Lede>
          <Cluster tag="ul" gap={75}>
            <For each={d.unreleased?.packages ?? []} by={(p) => p.name}>
              {(p) => (
                <li>
                  <Tag>{`${p.name} · ${p.count}`}</Tag>
                </li>
              )}
            </For>
          </Cluster>
        </GlowCard>
      </Show>
      <AutoGrid min={420} gap={150}>
        <For each={d.releases} by={(r) => r.version}>
          {(r) => (
            <GlowCard>
              <Version>{r.version}</Version>
              <Text variant="mono" tone="fog" leading="relaxed">{`${r.date ? `${r.date} · ` : ''}${r.minor} minor · ${r.patch} patch changes`}</Text>
              <EntryList>
                <For each={r.entries} by={(e) => `${e.pr ?? ''}${e.summary}`}>
                  {(e) => (
                    <Entry>
                      {renderInline(e.summary)}{' '}
                      {e.pr !== null ? (
                        <PrLink href={`https://github.com/pyreon/pyreon/pull/${e.pr}`} rel="noopener">{`#${e.pr}`}</PrLink>
                      ) : null}
                    </Entry>
                  )}
                </For>
              </EntryList>
              <Show when={() => r.minor + r.patch > r.entries.length}>
                <Text variant="mono" tone="fog" leading="relaxed">{`and ${r.minor + r.patch - r.entries.length} more in the changelogs`}</Text>
              </Show>
            </GlowCard>
          )}
        </For>
      </AutoGrid>
    </Stack>
  )
}

function BrandExtras() {
  return (
    <Stack gap={250}>
      <SectionHead label="downloads" title="The files." />
      <Cluster gap={150} alignY="center">
        <Pill href={`/${BRAND_PACK}`} variant="solid">
          Download the logo pack (.zip)
        </Pill>
        <Pill href={mediaUrl(BRAND_IMAGES.swatches[0])}>Swatches, dark (.png)</Pill>
        <Pill href={mediaUrl(BRAND_IMAGES.swatches[1])}>Swatches, light (.png)</Pill>
        <Pill href="/brand/kit">The component kit →</Pill>
      </Cluster>
      <Text variant="mono" tone="fog" leading="relaxed">SVG and PNG marks and lockups, dark, light and transparent.</Text>
      <Figure>
        <Picture file={BRAND_IMAGES.clearSpace} sizes="(min-width: 1240px) 1160px, 100vw" />
      </Figure>
      <Figure>
        <Picture file={BRAND_IMAGES.typeSpecimen} sizes="(min-width: 1240px) 1160px, 100vw" />
      </Figure>
    </Stack>
  )
}

export function ProjectPageView(props: { view: ProjectView }) {
  const d = props.view.page
  usePageHead({ path: d.route, title: `${d.title} · Pyreon`, description: inlineText(d.lede) })

  const figures: SectionFigure[] = []
  if (d.id === 'releases' && props.view.releases) {
    figures.push({ at: 0, place: 'after', node: <Releases data={props.view.releases} /> })
  }
  if (d.id === 'brand') {
    const at = d.sections.findIndex((s) => s.kind === 'logos')
    figures.push({ at: at < 0 ? 0 : at, place: 'after', node: <BrandExtras /> })
  }

  const cta = d.end.cta
  let ctaNode: VNodeChild = null
  if (cta.command) ctaNode = <InstallCommand command={cta.command} variant="hot" />
  else if (cta.href)
    ctaNode = (
      <Pill href={cta.href} variant="solid" size="lg">
        {cta.label}
      </Pill>
    )

  return (
    <>
      <Section size="hero">
        <Wrap>
          <Hero>
            <Eyebrow>{d.id === 'status' ? 'Status and direction' : d.title}</Eyebrow>
            <Heading tag="h1" size="hero">
              {renderInline(d.title)}
            </Heading>
            <Lede size="hero">{renderInline(d.lede)}</Lede>
          </Hero>
        </Wrap>
      </Section>
      <SiteSections sections={d.sections} figures={figures} />
      <Section size="end">
        <Wrap>
          <Heading tag="h2" size="end">
            {renderInline(d.end.title)}
          </Heading>
          <EndRow>{ctaNode}</EndRow>
        </Wrap>
      </Section>
    </>
  )
}
