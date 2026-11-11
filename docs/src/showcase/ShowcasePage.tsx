import { For } from '@pyreon/core'
import { fill, SHOWCASE_COPY } from '../site/content/channels'
import type { ShowcaseExample } from '../site/content/types-site'
import { el, tone, txt } from '../site/kit/bases'
import { GlowCard } from '../site/kit/cards'
import { Chip, InstallCommand, Pill } from '../site/kit/controls'
import { AutoGrid, Section, SectionHead, Wrap } from '../site/kit/layout'
import { Picture } from '../site/kit/media'
import { Reveal } from '../site/kit/motion'
import { Eyebrow, Heading, Lede, renderInline } from '../site/kit/type'
import { usePageHead } from '../site/head'
import { breakpoints, font, radius, text } from '../site/theme'

/**
 * `/showcase` — apps from the repository, every screenshot a real capture
 * from the asset set (`09-site/assets`, slot `showcase-card`), every word from
 * `_channels.json`. Static HTML: the only script is the copy buttons of the
 * commands (the kit's copy island).
 */

export const REPO_URL = 'https://github.com/pyreon/pyreon'

/** GitHub URL of an example's source directory. */
export function sourceUrl(dir: string): string {
  return `${REPO_URL}/tree/main/examples/${dir}`
}

const Hero = el.config({ name: 'ShowcaseHero' }).attrs({ block: true, contentAlignX: 'block', gap: 22 }).theme(() => ({ maxWidth: 860 }))
const Row = el.config({ name: 'ShowcaseRow' }).attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 10 }).theme(() => ({ flexWrap: 'wrap' }))
const End = el
  .config({ name: 'ShowcaseEnd' })
  .attrs({ block: true, contentAlignX: 'center', gap: 18 })
  .theme(() => ({ textAlign: 'center', extendCss: '& > p { max-width: 640px; }' }))
const Stack = el.config({ name: 'ShowcaseStack' }).attrs({ block: true, contentAlignX: 'block', gap: 16 })

const Shots = el
  .config({ name: 'ShowcaseShots' })
  .attrs({ tag: 'ul', block: true })
  .theme(() => ({
    display: 'grid',
    gap: 14,
    listStyle: 'none',
    margin: 0,
    padding: 0,
    gridTemplateColumns: 'minmax(0, 1fr)',
    extendCss: `@media (min-width: ${breakpoints.md}px) { grid-template-columns: repeat(2, minmax(0, 1fr)); & > li:first-child { grid-column: 1 / -1; } }`,
  }))

const Shot = el
  .config({ name: 'ShowcaseShot' })
  .attrs({ tag: 'figure', block: true })
  .theme((_t, m) => ({
    margin: 0,
    borderRadius: radius.card,
    overflow: 'hidden',
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'card'),
    extendCss: '& picture { display: block; } & img { display: block; width: 100%; height: auto; }',
  }))

const ShotCaption = txt
  .config({ name: 'ShowcaseShotCaption' })
  .attrs({ tag: 'figcaption' })
  .theme((_t, m) => ({
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 18,
    paddingRight: 18,
    borderTop: '1px solid',
    borderColor: tone(m, 'line'),
    fontFamily: font.mono,
    fontSize: text.mono.size,
    lineHeight: 1.5,
    color: tone(m, 'mist'),
  }))

const Note = txt
  .config({ name: 'ShowcaseNote' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, fontFamily: font.mono, fontSize: text.mono.size, lineHeight: 1.6, color: tone(m, 'fog') }))

const ChipList = el
  .config({ name: 'ShowcaseChips' })
  .attrs({ tag: 'ul', block: true, contentDirection: 'inline', gap: 6 })
  .theme(() => ({ flexWrap: 'wrap', listStyle: 'none', margin: 0, padding: 0 }))

function Packages(props: { names: readonly string[] }) {
  return (
    <ChipList aria-label={SHOWCASE_COPY.labels.packages}>
      <For each={props.names} by={(n) => n}>
        {(n) => (
          <li>
            <Chip>{`@pyreon/${n}`}</Chip>
          </li>
        )}
      </For>
    </ChipList>
  )
}

/** Run command, where it serves, a note, and the links: live demo, source, related sources. */
function RunAndLinks(props: { example: ShowcaseExample }) {
  const ex = props.example
  const labels = SHOWCASE_COPY.labels
  return (
    <>
      <InstallCommand command={ex.run} />
      <Note>
        {fill(labels.open, { url: ex.open })}
        {ex.note ? <>{' · '}{renderInline(ex.note)}</> : null}
      </Note>
      <Row>
        {ex.liveDemo ? (
          <Pill href={ex.liveDemo} variant="solid">
            {labels.liveDemo}
          </Pill>
        ) : null}
        <Pill href={sourceUrl(ex.dir)}>{labels.source}</Pill>
        <For each={ex.alsoSource ?? []} by={(s) => s.dir}>
          {(s) => <Pill href={sourceUrl(s.dir)}>{s.label}</Pill>}
        </For>
      </Row>
    </>
  )
}

function ExampleCard(props: { example: ShowcaseExample }) {
  const ex = props.example
  return (
    <GlowCard>
      <Heading tag="h3" size="card" id={ex.dir}>
        {ex.title}
      </Heading>
      <Lede size="card">{renderInline(ex.summary)}</Lede>
      <Packages names={ex.highlights} />
      <RunAndLinks example={ex} />
    </GlowCard>
  )
}

export function ShowcasePage() {
  const c = SHOWCASE_COPY
  usePageHead({ path: c.route, title: c.meta.title, description: c.meta.description })
  const f = c.featured
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
              <For each={c.hero.actions.map((a, i) => ({ a, i }))} by={(x) => x.i}>
                {(x) => (
                  <Pill href={x.a.href ?? '/'} variant={x.i === 0 ? 'solid' : 'ghost'}>
                    {x.a.label}
                  </Pill>
                )}
              </For>
            </Row>
          </Hero>
        </Wrap>
      </Section>

      <Section size="tight">
        <Wrap>
          <GlowCard state="hot">
            <Heading tag="h2" size="card">
              {c.setup.title}
            </Heading>
            <Lede size="card">{renderInline(c.setup.text)}</Lede>
            <InstallCommand command={c.setup.command} />
          </GlowCard>
        </Wrap>
      </Section>

      <Reveal>
        <Section>
          <Wrap>
            <SectionHead label={f.label} title={f.title} text={f.text} id={f.example.dir} />
            <Stack>
              <Shots>
                <For each={f.captures} by={(s) => s.file}>
                  {(s) => (
                    <li>
                      <Shot>
                        <Picture file={s.file} sizes={`(min-width: ${breakpoints.md}px) 620px, 100vw`} />
                        <ShotCaption>{s.label}</ShotCaption>
                      </Shot>
                    </li>
                  )}
                </For>
              </Shots>
              <Packages names={f.example.highlights} />
              <RunAndLinks example={f.example} />
            </Stack>
          </Wrap>
        </Section>
      </Reveal>

      <Section size="tight">
        <Wrap>
          <SectionHead label={c.more.label} title={c.more.title} text={c.more.text} />
          <AutoGrid min={420} gap={14}>
            <For each={c.more.items} by={(ex) => ex.dir}>
              {(ex) => <ExampleCard example={ex} />}
            </For>
          </AutoGrid>
        </Wrap>
      </Section>

      <Section size="end">
        <Wrap>
          <End>
            <Eyebrow>{c.submit.label}</Eyebrow>
            <Heading tag="h2" size="end">
              {c.submit.title}
            </Heading>
            <Lede size="section">{renderInline(c.submit.text)}</Lede>
            <Pill href={c.submit.cta.href ?? REPO_URL} variant="solid" size="lg">
              {c.submit.cta.label}
            </Pill>
          </End>
        </Wrap>
      </Section>
    </>
  )
}
