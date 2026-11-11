import { For, Show } from '@pyreon/core'
import type { MigrateMeta } from '../content/pages'
import { htmlOf } from '../content/pages'
import type { MigrateGuide, MigrateLanding, MigrateLayer } from '../content/types-site'
import { el, tone, txt } from '../kit/bases'
import { GlowCard } from '../kit/cards'
import { CodeCard } from '../kit/code'
import { InstallCommand, Pill } from '../kit/controls'
import { inlineText } from '../kit/inline'
import { AutoGrid, Section, SectionHead, Wrap } from '../kit/layout'
import { Reveal } from '../kit/motion'
import { EndCTA, HookHero } from '../kit/proof'
import { Diagram, InlineText, LinkCards, StepList } from '../kit/story'
import { Eyebrow, Heading, Lede, renderInline, StatusDot } from '../kit/type'
import { font, text, weight } from '../theme'
import { useSitePageHead } from './assets'
import { emberWordOf } from './ember'
import { RivalSwitcher } from './RivalSwitcher'

/**
 * `/migrate` and `/migrate/<framework>` (`content/pages/migrate/*`): the
 * steps, the before/after visual from the asset set (an illustration of the
 * code, not a recording), what each compat layer covers ("near-full
 * public-API parity", never "drop-in") and, as prominently, what it does not,
 * with the link to the Migrate product page.
 */

const Stack = el.config({ name: 'MigrateStack' }).attrs({ block: true, contentAlignX: 'block', gap: 16 })

const Mono = txt
  .config({ name: 'MigrateMono' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ display: 'block', fontFamily: font.mono, fontSize: text.mono.size, color: tone(m, 'accentText') }))

const Term = txt
  .config({ name: 'MigrateTerm' })
  .attrs({ tag: 'b' })
  .theme((_t, m) => ({ display: 'block', marginTop: 8, fontFamily: font.mono, fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: weight.medium, color: tone(m, 'fog') }))

const Bullets = el
  .config({ name: 'MigrateBullets' })
  .attrs({ tag: 'ul', block: true, gap: 12 })
  .theme((_t, m) => ({ listStyle: 'none', margin: 0, padding: 0, fontFamily: font.sans, fontSize: text.small.size, lineHeight: text.small.lineHeight, color: tone(m, 'mist') }))

const Bullet = el
  .config({ name: 'MigrateBullet' })
  .attrs({ tag: 'li', block: true })
  .theme(() => ({ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr)', alignItems: 'baseline' }))

const Note = txt
  .config({ name: 'MigrateNote' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, marginTop: 10, fontFamily: font.mono, fontSize: text.caveat.size, lineHeight: 1.6, color: tone(m, 'fog') }))

function Checklist(props: { items: readonly string[]; tone: 'ok' | 'warn' }) {
  return (
    <Bullets>
      <For each={props.items} by={(i) => i}>
        {(i) => (
          <Bullet>
            <StatusDot state={props.tone} />
            <InlineText>{renderInline(i)}</InlineText>
          </Bullet>
        )}
      </For>
    </Bullets>
  )
}

// ─── /migrate ─────────────────────────────────────────────────────────────

export interface MigrateLandingView {
  landing: MigrateLanding
  guides: MigrateGuide[]
  meta: MigrateMeta
  svg: string | undefined
}

export function MigrateLandingPage(props: { view: MigrateLandingView }) {
  const d = props.view.landing
  const title = inlineText(d.hook.title)
  useSitePageHead({ path: d.route, title: `${title} · Pyreon`, description: inlineText(d.hook.lede) })

  return (
    <>
      <HookHero
        eyebrow={d.hook.eyebrow}
        title={title}
        emberWord={emberWordOf(title)}
        lede={d.hook.lede}
        install={d.cta.command}
        ctas={[d.cta.secondary, { label: 'The Migrate product', href: d.productHref }]}
      />

      <Section size="tight" id="steps">
        <Wrap>
          <SectionHead label="five steps" title="From React to Pyreon, without a rewrite." />
          <Stack>
            {props.view.svg ? <Diagram svg={props.view.svg} caption="The five steps as a loop: an illustration, not a recording." scrollLabel="The five migration steps" /> : null}
            <StepList items={d.steps.map((s) => ({ title: s.title, text: s.text, code: s.code, file: s.file, codeHtml: htmlOf(s) }))} />
          </Stack>
        </Wrap>
      </Section>

      <Reveal>
        <Section size="tight" id="tools">
          <Wrap>
            <SectionHead label="tools" title={d.tools.title} />
            <AutoGrid min={320} gap={12}>
              <For each={d.tools.items} by={(t) => t.name}>
                {(t) => (
                  <GlowCard padding="compact">
                    <Heading tag="h3" size="step">
                      {renderInline(t.name)}
                    </Heading>
                    <Mono>{t.package}</Mono>
                    <Lede size="small">{renderInline(t.what)}</Lede>
                    <Term>how</Term>
                    <Lede size="small">{renderInline(t.how)}</Lede>
                    <Term>limits</Term>
                    <Lede size="small">{renderInline(t.limits)}</Lede>
                  </GlowCard>
                )}
              </For>
            </AutoGrid>
          </Wrap>
        </Section>
      </Reveal>

      <Reveal>
        <Section size="tight" id="layers">
          <Wrap>
            <SectionHead label="compat layers" title={d.layersTitle} />
            <AutoGrid min={220} gap={12}>
              <For each={props.view.meta.order} by={(l) => l.id}>
                {(l) => (
                  <GlowCard href={`/migrate/${l.id}`} padding="compact">
                    <Eyebrow state="accent">{`from ${l.name}`}</Eyebrow>
                    <Heading tag="h3" size="step">
                      {`${l.name} →`}
                    </Heading>
                    <Mono>{l.package}</Mono>
                  </GlowCard>
                )}
              </For>
            </AutoGrid>
          </Wrap>
        </Section>
      </Reveal>

      <Reveal>
        <Section size="tight" id="guides">
          <Wrap>
            <SectionHead label="guides" title={d.guidesTitle} />
            <LinkCards min={320} items={props.view.guides.map((g) => ({ label: g.name, href: g.href, text: `${g.text} ${g.why}` }))} />
          </Wrap>
        </Section>
      </Reveal>

      <Section size="end">
        <Wrap>
          <EndCTA title={d.cta.title} install={d.cta.command} primary={d.cta.secondary} />
        </Wrap>
      </Section>
    </>
  )
}

// ─── /migrate/<framework> ─────────────────────────────────────────────────

export interface MigrateLayerView {
  layer: MigrateLayer
  meta: MigrateMeta
  svg: string | undefined
  productHref: string
}

export function MigrateLayerPage(props: { view: MigrateLayerView }) {
  const d = props.view.layer
  const title = inlineText(d.hook.title)
  useSitePageHead({ path: d.route, title: `Migrate from ${d.name}: ${title} · Pyreon`, description: inlineText(d.hook.lede) })

  return (
    <>
      <HookHero
        eyebrow={`Migrate from ${d.name} · ${d.package}`}
        title={title}
        emberWord={emberWordOf(title)}
        lede={d.hook.lede}
        install={d.install}
        ctas={[{ label: 'The Migrate product', href: props.view.productHref }]}
      />

      {props.view.svg ? (
        <Section size="tight" id="before-after">
          <Wrap>
            <SectionHead label="before and after" title={`The same ${d.name} code, on Pyreon.`} />
            <Diagram svg={props.view.svg} caption="An illustration of the code on each side, not a recording." scrollLabel={`${d.name} to Pyreon, before and after`} />
          </Wrap>
        </Section>
      ) : null}

      <Reveal>
        <Section size="tight" id="coverage">
          <Wrap>
            <SectionHead label="coverage" title={`What ${d.package} covers, and what it does not.`} />
            <AutoGrid cols={2} gap={16}>
              <GlowCard>
                <Eyebrow state="accent">covers</Eyebrow>
                <Checklist items={d.covers} tone="ok" />
              </GlowCard>
              <GlowCard>
                <Eyebrow>does not cover</Eyebrow>
                <Checklist items={d.doesNotCover} tone="warn" />
              </GlowCard>
            </AutoGrid>
          </Wrap>
        </Section>
      </Reveal>

      <Reveal>
        <Section size="tight" id="setup">
          <Wrap>
            <SectionHead label="setup" title="Install it, point the config at it." />
            <Stack>
              <InstallCommand command={d.install} />
              <AutoGrid cols={Math.min(2, d.config.length)} gap={16}>
                <For each={d.config} by={(c) => c.file}>
                  {(c) => (
                    <div>
                      <CodeCard label={c.file} code={c.code} html={htmlOf(c)} />
                      <Note>{renderInline(c.note)}</Note>
                    </div>
                  )}
                </For>
              </AutoGrid>
              <Show when={() => d.scaffold !== null}>
                <Eyebrow>or start from a scaffold</Eyebrow>
                <InstallCommand command={d.scaffold ?? ''} />
              </Show>
            </Stack>
          </Wrap>
        </Section>
      </Reveal>

      <For each={d.ports} by={(p) => p.title}>
        {(p) => (
          <Reveal>
            <Section size="tight">
              <Wrap>
                <SectionHead label="port it" title={p.title} />
                <AutoGrid cols={2} gap={16}>
                  <CodeCard label={`${p.before.label} · ${p.before.file}`} code={p.before.code} html={htmlOf(p.before)} rail="del" />
                  <CodeCard label={`${p.after.label} · ${p.after.file}`} code={p.after.code} html={htmlOf(p.after)} state="hot" rail="ins" />
                </AutoGrid>
                <Note>{renderInline(p.note)}</Note>
              </Wrap>
            </Section>
          </Reveal>
        )}
      </For>

      <Section size="tight" id="docs">
        <Wrap>
          <SectionHead label="read more" title="The guides behind this page." />
          <Stack>
            <LinkCards items={d.docs.map((l) => ({ label: l.label, href: l.href, text: l.href }))} />
            <div>
              <Pill href={props.view.productHref} variant="solid">
                The Migrate product
              </Pill>
            </div>
          </Stack>
        </Wrap>
      </Section>

      <RivalSwitcher label="Migrate from" current={d.id} items={props.view.meta.order.map((l) => ({ id: l.id, href: `/migrate/${l.id}`, label: l.name }))} />
    </>
  )
}
