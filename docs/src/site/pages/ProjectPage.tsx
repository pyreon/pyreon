import type { VNodeChild } from '@pyreon/core'
import { For, Show } from '@pyreon/core'
import type { ProjectPage as Data } from '../content/types-site'
import type { ReleaseData } from '../releases/parse'
import { el, focusRing, tone, txt, type LinkAttrs } from '../kit/bases'
import { GlowCard } from '../kit/cards'
import { Chip, InstallCommand, Pill } from '../kit/controls'
import { inlineText } from '../kit/inline'
import { AutoGrid, Section, SectionHead, Wrap } from '../kit/layout'
import { CaveatLine } from '../kit/proof'
import { Eyebrow, Heading, Lede, renderInline, StatusBadge } from '../kit/type'
import { font, radius, text, weight } from '../theme'
import { assetUrl, useSitePageHead, type ImageAsset } from './assets'
import { SiteSections, type SectionFigure } from './SiteSections'

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
  images?: Record<string, ImageAsset> | undefined
}

/** Files the brand page shows or offers (copied by scripts/sync-site-pages.ts). */
export const BRAND_IMAGES = {
  clearSpace: ['brand/clear-space-dark.png', 'brand/clear-space-light.png'],
  typeSpecimen: ['brand/type-specimen-dark.png', 'brand/type-specimen-light.png'],
  swatches: ['brand/swatches-dark.png', 'brand/swatches-light.png'],
} as const
export const BRAND_PACK = 'brand/logo-pack.zip'

const Hero = el.config({ name: 'ProjectHero' }).attrs({ block: true, contentAlignX: 'block' }).theme(() => ({ maxWidth: 860 }))

const Mono = txt
  .config({ name: 'ProjectMono' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ fontFamily: font.mono, fontSize: text.mono.size, lineHeight: 1.6, color: tone(m, 'fog') }))

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
  .theme((_t, m) => ({ fontFamily: font.mono, fontSize: text.mono.size, color: tone(m, 'link'), focus: focusRing(m), borderRadius: 2 }))

const Version = txt
  .config({ name: 'ReleaseVersion' })
  .attrs({ tag: 'h3' })
  .theme((_t, m) => ({ margin: 0, fontFamily: font.mono, fontSize: 22, fontWeight: weight.medium, color: tone(m, 'strong') }))

const Chips = el
  .config({ name: 'ReleaseChips' })
  .attrs({ tag: 'ul', block: true, contentDirection: 'inline', gap: 6 })
  .theme(() => ({ flexWrap: 'wrap', listStyle: 'none', margin: 0, padding: 0 }))

const Pic = el
  .config({ name: 'ThemedPicture' })
  .attrs({ tag: 'picture', block: true })
  .theme((_t, m) => ({
    borderRadius: radius.card,
    overflow: 'hidden',
    border: '1px solid',
    borderColor: tone(m, 'line'),
    extendCss: `
      & img { display: block; width: 100%; height: auto; }
      [data-theme='light'] &[data-for-theme='dark'], [data-theme='dark'] &[data-for-theme='light'] { display: none; }
    `,
  }))

const Stack = el.config({ name: 'ProjectStack' }).attrs({ block: true, contentAlignX: 'block', gap: 20 })

const EndRow = el
  .config({ name: 'ProjectEndRow' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignX: 'center', contentAlignY: 'center', gap: 12 })
  .theme(() => ({ flexWrap: 'wrap', textAlign: 'center' }))

const DownloadRow = el.config({ name: 'BrandDownloads' }).attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 12 }).theme(() => ({ flexWrap: 'wrap' }))

/** A raster image from the asset set: AVIF/WebP width variants, explicit size, lazy. */
function Picture(props: { img: ImageAsset; theme?: 'dark' | 'light' | undefined }) {
  const byFormat = (f: string) =>
    props.img.variantFiles
      .filter((v) => v.format === f)
      .map((v) => `${assetUrl(v.file)} ${v.width}w`)
      .join(', ')
  return (
    <Pic data-for-theme={props.theme}>
      <source type="image/avif" srcSet={byFormat('avif')} sizes="(min-width: 1240px) 1160px, 100vw" />
      <source type="image/webp" srcSet={byFormat('webp')} sizes="(min-width: 1240px) 1160px, 100vw" />
      <img src={assetUrl(props.img.file)} alt={props.img.alt} width={props.img.width} height={props.img.height} loading="lazy" decoding="async" />
    </Pic>
  )
}

/** Dark and light variants of one image; CSS shows the one matching the site theme. */
function ThemedPair(props: { images: Record<string, ImageAsset>; files: readonly [string, string] }) {
  const dark = props.images[props.files[0]]
  const light = props.images[props.files[1]]
  return (
    <>
      {dark ? <Picture img={dark} theme="dark" /> : null}
      {light ? <Picture img={light} theme="light" /> : null}
    </>
  )
}

function Releases(props: { data: ReleaseData }) {
  const d = props.data
  if (!d.ok) {
    return <CaveatLine text={`The release history is unavailable in this build (${d.reason}). It comes back with the next deploy.`} link={{ label: 'Releases on GitHub →', href: 'https://github.com/pyreon/pyreon/releases' }} />
  }
  return (
    <Stack>
      <SectionHead label="from the repository" title="What shipped, read from the changelogs." text="Built from every published package's CHANGELOG.md and the changesets on main when this page was built. Each change is listed once, with its pull request." />
      <Show when={() => d.unreleased !== null}>
        <GlowCard state="hot">
          <Eyebrow state="accent">
            unreleased · on main
            <StatusBadge>next release</StatusBadge>
          </Eyebrow>
          <Heading tag="h3" size="card">
            {`${d.unreleased?.count ?? 0} changesets waiting for the next release`}
          </Heading>
          <Lede size="small">{`${d.unreleased?.minor ?? 0} with a minor bump, ${d.unreleased?.patch ?? 0} patch only. Most touched:`}</Lede>
          <Chips>
            <For each={d.unreleased?.packages ?? []} by={(p) => p.name}>
              {(p) => (
                <li>
                  <Chip>{`${p.name} · ${p.count}`}</Chip>
                </li>
              )}
            </For>
          </Chips>
        </GlowCard>
      </Show>
      <AutoGrid min={420} gap={12}>
        <For each={d.releases} by={(r) => r.version}>
          {(r) => (
            <GlowCard>
              <Version>{r.version}</Version>
              <Mono>{`${r.date ? `${r.date} · ` : ''}${r.minor} minor · ${r.patch} patch changes`}</Mono>
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
                <Mono>{`and ${r.minor + r.patch - r.entries.length} more in the changelogs`}</Mono>
              </Show>
            </GlowCard>
          )}
        </For>
      </AutoGrid>
    </Stack>
  )
}

function BrandExtras(props: { images: Record<string, ImageAsset> }) {
  return (
    <Stack>
      <SectionHead label="downloads" title="The files." />
      <DownloadRow>
        <Pill href={`/${BRAND_PACK}`} variant="solid">
          Download the logo pack (.zip)
        </Pill>
        <Pill href={assetUrl(BRAND_IMAGES.swatches[0])}>Swatches, dark (.png)</Pill>
        <Pill href={assetUrl(BRAND_IMAGES.swatches[1])}>Swatches, light (.png)</Pill>
        <Pill href="/brand/kit">The component kit →</Pill>
      </DownloadRow>
      <Mono>SVG and PNG marks and lockups, dark, light and transparent.</Mono>
      <ThemedPair images={props.images} files={BRAND_IMAGES.clearSpace} />
      <ThemedPair images={props.images} files={BRAND_IMAGES.typeSpecimen} />
    </Stack>
  )
}

export function ProjectPageView(props: { view: ProjectView }) {
  const d = props.view.page
  useSitePageHead({ path: d.route, title: `${d.title} · Pyreon`, description: inlineText(d.lede) })

  const figures: SectionFigure[] = []
  if (d.id === 'releases' && props.view.releases) {
    figures.push({ at: 0, place: 'after', node: <Releases data={props.view.releases} /> })
  }
  if (d.id === 'brand' && props.view.images) {
    const at = d.sections.findIndex((s) => s.kind === 'logos')
    figures.push({ at: at < 0 ? 0 : at, place: 'after', node: <BrandExtras images={props.view.images} /> })
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
              {d.title}
            </Heading>
            <Lede size="hero">{renderInline(d.lede)}</Lede>
          </Hero>
        </Wrap>
      </Section>
      <SiteSections sections={d.sections} figures={figures} />
      <Section size="end">
        <Wrap>
          <Heading tag="h2" size="end">
            {d.end.title}
          </Heading>
          <EndRow>{ctaNode}</EndRow>
        </Wrap>
      </Section>
    </>
  )
}
