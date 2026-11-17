import { For, Show } from '@pyreon/core'
import type { MigrateMeta } from '../content/pages'
import { fill } from '../content/fill'
import { htmlOf } from '../content/pages'
import type { MigrateGuide, MigrateLanding, MigrateLayer } from '../content/types-site'
import { el, tone } from '../kit/bases'
import { GlowCard } from '../kit/cards'
import { CodeCard } from '../kit/code'
import { InstallCommand, Pill } from '../kit/controls'
import { inlineText } from '../kit/inline'
import { Section, SectionHead } from '../kit/layout'
import { AutoGrid, Box, Stack, Text, Wrap } from '../kit/primitives'
import { Reveal } from '../kit/motion'
import { EndCTA, HookHero } from '../kit/proof'
import { Diagram, InlineText, LinkCards, StepList } from '../kit/story'
import { Eyebrow, Heading, Lede, renderInline, StatusDot } from '../kit/type'
import { font, text } from '../theme'
import { usePageHead } from '../head'
import { emberWordOf } from './ember'
import { RivalSwitcher } from './RivalSwitcher'
import { WideDiagram } from './WideDiagram'
import { Note } from '../kit/note'

/**
 * `/migrate` and `/migrate/<framework>` (`content/pages/migrate/*`): the
 * steps, the before/after visual from the asset set (an illustration of the
 * code, not a recording), what each compat layer covers ("near-full
 * public-API parity", never "drop-in") and, as prominently, what it does not,
 * with the link to the Migrate product page.
 */


const Bullets = el
  .config({ name: 'MigrateBullets' })
  .attrs({ tag: 'ul', block: true, gap: 12 })
  .theme((_t, m) => ({ listStyle: 'none', margin: 0, padding: 0, fontFamily: font.sans, fontSize: text.small.size, lineHeight: text.small.lineHeight, color: tone(m, 'mist') }))

const Bullet = el
  .config({ name: 'MigrateBullet' })
  .attrs({ tag: 'li', block: true })
  .theme(() => ({ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr)', alignItems: 'baseline' }))


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
  const T = props.view.meta.template
  const L = T.landing
  const title = inlineText(d.hook.title)
  usePageHead({ path: d.route, title: fill(L.meta.title, { title }), description: inlineText(d.hook.lede) })

  return (
    <>
      <HookHero
        eyebrow={d.hook.eyebrow}
        title={title}
        emberWord={emberWordOf(title)}
        lede={d.hook.lede}
        install={d.cta.command}
        ctas={[d.cta.secondary, { label: T.product, href: d.productHref }]}
      />

      <Section size="tight" id="steps">
        <Wrap>
          <SectionHead label={L.steps.label} title={L.steps.title} />
          <Stack gap={200}>
            {props.view.svg ? (
              <WideDiagram>
                <Diagram svg={props.view.svg} caption={L.steps.caption} scrollLabel={L.steps.scroll} />
              </WideDiagram>
            ) : null}
            <StepList items={d.steps.map((s) => ({ title: s.title, text: s.text, code: s.code, file: s.file, codeHtml: htmlOf(s) }))} />
          </Stack>
        </Wrap>
      </Section>

      <Reveal>
        <Section size="tight" id="tools">
          <Wrap>
            <SectionHead label={L.tools.label} title={d.tools.title} />
            <AutoGrid min={320} gap={150}>
              <For each={d.tools.items} by={(t) => t.name}>
                {(t) => (
                  <GlowCard padding="compact">
                    <Heading tag="h3" size="step">
                      {renderInline(t.name)}
                    </Heading>
                    <Text variant="mono" tone="accentText" block>{t.package}</Text>
                    <Lede size="small">{renderInline(t.what)}</Lede>
                    <Box padTop={100}>
                      <Text variant="badge" tone="fog" medium block tag="b">
                        {L.tools.how}
                      </Text>
                    </Box>
                    <Lede size="small">{renderInline(t.how)}</Lede>
                    <Box padTop={100}>
                      <Text variant="badge" tone="fog" medium block tag="b">
                        {L.tools.limits}
                      </Text>
                    </Box>
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
            <SectionHead label={L.layers.label} title={d.layersTitle} />
            <AutoGrid min={220} gap={150}>
              <For each={props.view.meta.order} by={(l) => l.id}>
                {(l) => (
                  <GlowCard href={`/migrate/${l.id}`} padding="compact">
                    <Eyebrow state="accent">{fill(L.layers.eyebrow, { name: l.name })}</Eyebrow>
                    <Heading tag="h3" size="step">
                      {fill(L.layers.name, { name: l.name })}
                    </Heading>
                    <Text variant="mono" tone="accentText" block>{l.package}</Text>
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
            <SectionHead label={L.guides.label} title={d.guidesTitle} />
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

/** The layer page's install and config section: each config file with its note. */
function SetupSection(props: { layer: MigrateLayerView['layer']; labels: MigrateLayerView['meta']['template']['layer'] }) {
  const d = props.layer
  const L = props.labels

  return (
    <Reveal>
      <Section size="tight" id="setup">
        <Wrap>
          <SectionHead label={L.setup.label} title={L.setup.title} />
          <Stack gap={200}>
            <InstallCommand command={d.install} />
            <AutoGrid cols={Math.min(2, d.config.length)} gap={200}>
              <For each={d.config} by={(c) => c.file}>
                {(c) => (
                  <div>
                    <CodeCard label={c.file} code={c.code} html={htmlOf(c)} />
                    <Box padTop={125}>
                      <Note>{renderInline(c.note)}</Note>
                    </Box>
                  </div>
                )}
              </For>
            </AutoGrid>
            <Show when={() => d.scaffold !== null}>
              <Eyebrow>{L.setup.scaffold}</Eyebrow>
              <InstallCommand command={d.scaffold ?? ''} />
            </Show>
          </Stack>
        </Wrap>
      </Section>
    </Reveal>
  )
}

export function MigrateLayerPage(props: { view: MigrateLayerView }) {
  const d = props.view.layer
  const T = props.view.meta.template
  const L = T.layer
  const title = inlineText(d.hook.title)
  usePageHead({ path: d.route, title: fill(L.meta.title, { name: d.name, title }), description: inlineText(d.hook.lede) })

  return (
    <>
      <HookHero
        eyebrow={fill(L.eyebrow, { name: d.name, package: d.package })}
        title={title}
        emberWord={emberWordOf(title)}
        lede={d.hook.lede}
        install={d.install}
        ctas={[{ label: T.product, href: props.view.productHref }]}
      />

      {props.view.svg ? (
        <Section size="tight" id="before-after">
          <Wrap>
            <SectionHead label={L.beforeAfter.label} title={fill(L.beforeAfter.title, { name: d.name })} />
            <WideDiagram>
              <Diagram svg={props.view.svg} caption={L.beforeAfter.caption} scrollLabel={fill(L.beforeAfter.scroll, { name: d.name })} />
            </WideDiagram>
          </Wrap>
        </Section>
      ) : null}

      <Reveal>
        <Section size="tight" id="coverage">
          <Wrap>
            <SectionHead label={L.coverage.label} title={fill(L.coverage.title, { package: d.package })} />
            <AutoGrid cols={2} gap={200}>
              <GlowCard>
                <Eyebrow state="accent">{L.coverage.covers}</Eyebrow>
                <Checklist items={d.covers} tone="ok" />
              </GlowCard>
              <GlowCard>
                <Eyebrow>{L.coverage.doesNotCover}</Eyebrow>
                <Checklist items={d.doesNotCover} tone="warn" />
              </GlowCard>
            </AutoGrid>
          </Wrap>
        </Section>
      </Reveal>

      <SetupSection layer={d} labels={L} />

      <For each={d.ports} by={(p) => p.title}>
        {(p) => (
          <Reveal>
            <Section size="tight">
              <Wrap>
                <SectionHead label={L.ports.label} title={p.title} />
                <AutoGrid cols={2} gap={200}>
                  <CodeCard label={`${p.before.label} · ${p.before.file}`} code={p.before.code} html={htmlOf(p.before)} rail="del" />
                  <CodeCard label={`${p.after.label} · ${p.after.file}`} code={p.after.code} html={htmlOf(p.after)} state="hot" rail="ins" />
                </AutoGrid>
                <Box padTop={125}>
                  <Note>{renderInline(p.note)}</Note>
                </Box>
              </Wrap>
            </Section>
          </Reveal>
        )}
      </For>

      <Section size="tight" id="docs">
        <Wrap>
          <SectionHead label={L.docs.label} title={L.docs.title} />
          <Stack gap={200}>
            <LinkCards items={d.docs.map((l) => ({ label: l.label, href: l.href, text: l.href }))} />
            <div>
              <Pill href={props.view.productHref} variant="solid">
                {T.product}
              </Pill>
            </div>
          </Stack>
        </Wrap>
      </Section>

      <RivalSwitcher label={T.switcher} current={d.id} items={props.view.meta.order.map((l) => ({ id: l.id, href: `/migrate/${l.id}`, label: l.name }))} />
    </>
  )
}
