import { For, onMount } from '@pyreon/core'
import { fill } from '../site/content/channels'
import type { StableLinkChannel } from '../site/content/types-site'
import { usePageHead } from '../site/head'
import { el, tone, txt } from '../site/kit/bases'
import { C } from '../site/kit/classes'
import { GlowCard } from '../site/kit/cards'
import { Pill } from '../site/kit/controls'
import { CopyButtonIsland } from '../site/kit/islands'
import { Section, Wrap } from '../site/kit/layout'
import { Eyebrow, Heading, Lede, renderInline } from '../site/kit/type'
import { font, text } from '../site/theme'
import { SiteSections } from '../site/pages/SiteSections'

/**
 * A stable address on pyreon.dev (`/discord`, `/newsletter`) that either
 * forwards to its channel or, while there is none, is a useful page of its
 * own. Copy comes from `_channels.json`; the target from `site-links.ts`.
 *
 * Forwarding works on a static host: the prerendered HTML carries a
 * `<meta http-equiv="refresh">`, a canonical link to the target and a visible
 * "Continue" link, so it works with JavaScript off. A visitor who reaches the
 * page by in-app navigation in the docs app (no document load, so no meta
 * refresh) is forwarded on mount instead.
 */
export interface StableLinkPageProps {
  copy: StableLinkChannel
  /** Where to send the visitor, or `null` while the channel is not open. */
  target: string | null
}

const Hero = el.config({ name: 'StableLinkHero' }).attrs({ block: true, contentAlignX: 'block', gap: 22 }).theme(() => ({ maxWidth: 860 }))
const Row = el.config({ name: 'StableLinkRow' }).attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 10 }).theme(() => ({ flexWrap: 'wrap' }))
const Note = txt
  .config({ name: 'StableLinkNote' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, fontFamily: font.sans, fontSize: text.small.size, lineHeight: text.small.lineHeight, color: tone(m, 'fog') }))

/** An address with a copy button (the command line's look, without the `$`). */
function CopyField(props: { value: string }) {
  return (
    <div class={C.cmd}>
      <code class={C.cmdText} title={props.value}>
        {props.value}
      </code>
      <CopyButtonIsland text={props.value} />
    </div>
  )
}

export function StableLinkPage(props: StableLinkPageProps) {
  const c = props.copy
  const target = props.target
  if (target === null) {
    usePageHead({ path: c.route, title: c.meta.title, description: c.meta.description })
    const feed = c.feed
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
                    <Pill href={x.a.href ?? '/'} variant={x.i === 0 ? 'solid' : 'ghost'} size="lg">
                      {x.a.label}
                    </Pill>
                  )}
                </For>
              </Row>
            </Hero>
          </Wrap>
        </Section>
        {feed ? (
          <Section size="tight">
            <Wrap>
              <GlowCard state="hot">
                <Heading tag="h2" size="card">
                  {feed.title}
                </Heading>
                <Lede size="card">{renderInline(feed.text)}</Lede>
                <CopyField value={feed.url} />
                <Note>{renderInline(feed.note)}</Note>
              </GlowCard>
            </Wrap>
          </Section>
        ) : null}
        <SiteSections sections={c.sections} />
      </>
    )
  }

  usePageHead({
    path: c.route,
    title: c.meta.title,
    description: c.meta.description,
    canonical: target,
    meta: [
      { 'http-equiv': 'refresh', content: `0; url=${target}` },
      { name: 'robots', content: 'noindex' },
    ],
  })
  onMount(() => {
    window.location.replace(target)
  })
  return (
    <Section size="hero">
      <Wrap>
        <Hero>
          <Heading tag="h1" size="hero">
            {fill(c.redirect.title, { destination: c.destination })}
          </Heading>
          <Lede size="hero">{fill(c.redirect.text, { destination: c.destination })}</Lede>
          <Row>
            <Pill href={target} variant="solid" size="lg">
              {fill(c.redirect.cta, { destination: c.destination })}
            </Pill>
          </Row>
        </Hero>
      </Wrap>
    </Section>
  )
}
