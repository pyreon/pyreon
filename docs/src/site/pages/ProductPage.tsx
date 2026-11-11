import { For, Show } from '@pyreon/core'
import { useHead } from '@pyreon/head'
import { EXTRA_SECTIONS } from '../content/extra-sections'
import { EXTRA_SECTIONS_MORE } from '../content/extra-sections.more'
import { ProductHeroVisual } from '../demos/_asset-b'
import type { ExtraSection, ProductData } from '../content/model'
import { DEMOS } from '../demos/registry'
import { PRODUCTS, productHref } from '../nav'
import { gradient } from '../theme'
import { el, pair, tone } from '../kit/bases'
import { BenchmarkTable } from '../kit/bench'
import { FactList, FeatureList, Faq, LimitNote, NumberedCards, StatRow, StepCards, ApiGroups } from '../kit/blocks'
import { EmberGradientDefs, GlowCard, PackageCard, ProductTag } from '../kit/cards'
import { ExtraMoreBody, isExtraMore } from '../kit/extra'
import { BeforeAfter, CodeCard, ComingFrom } from '../kit/code'
import { InstallCommand, Pill } from '../kit/controls'
import { useLinkClick } from '../kit/link'
import { AutoGrid, Section, SectionHead, Wrap } from '../kit/layout'
import { Reveal } from '../kit/motion'
import { ProofBand } from '../kit/proof'
import { Eyebrow, Heading, Lede, renderInline } from '../kit/type'
import { inlineText } from '../kit/inline'

/**
 * One template renders every product page from `content/products/<id>.json`.
 * Section order is fixed (the reference pages' order, plus the content set's
 * optional fields): hero → proof → why → difference → extra sections →
 * coming from → demo → benchmarks → features → recipes → api → good to know
 * → faq → works with → closing CTA → product switcher.
 * Optional sections render only when their data is present.
 */
const HeroGlow = el
  .config({ name: 'ProductHeroGlow' })
  .attrs({ 'aria-hidden': 'true' })
  .theme((_t, m) => ({
    position: 'absolute',
    right: -240,
    top: -120,
    width: 1000,
    height: 760,
    pointerEvents: 'none',
    backgroundImage: pair(m, gradient.heroGlow),
  }))

const HeroGrid = el
  .config({ name: 'ProductHeroGrid' })
  .attrs({ block: true })
  .theme(() => ({
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1.3fr) minmax(0, 1fr)' },
    gap: { xs: 48, lg: 64 },
    alignItems: 'end',
  }))

const Ctas = el
  .config({ name: 'ProductCtas' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 12 })
  .theme(() => ({ flexWrap: 'wrap' }))

const CenteredCtas = el
  .config({ name: 'ProductEndCtas' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignX: 'center', contentAlignY: 'center', gap: 12 })
  .theme(() => ({ flexWrap: 'wrap' }))

const EndInner = el.config({ name: 'ProductEnd' }).attrs({ block: true, contentAlignX: 'center', gap: 0 }).theme(() => ({ textAlign: 'center' }))

const Stack = el.config({ name: 'Stack' }).attrs({ block: true, gap: 24 })

const Switcher = el
  .config({ name: 'ProductSwitcher' })
  .attrs({ tag: 'nav', block: true })
  .theme((_t, m) => ({ borderTop: '1px solid', borderColor: tone(m, 'line'), paddingTop: 26, paddingBottom: 26 }))

const SwitchList = el
  .config({ name: 'ProductSwitchList' })
  .attrs({ tag: 'ul', block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 8 })
  .theme(() => ({ flexWrap: 'wrap', listStyle: 'none', margin: 0, padding: 0 }))

const SwitchLink = el
  .config({ name: 'ProductSwitchLink' })
  .attrs<{ href?: string; onClick?: (e: MouseEvent) => void }>({ tag: 'a' })
  .theme((_t, m) => ({
    display: 'inline-block',
    fontSize: 13,
    color: tone(m, 'mist'),
    textDecoration: 'none',
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 14,
    paddingRight: 14,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    borderRadius: 9999,
    hover: { color: tone(m, 'text'), borderColor: tone(m, 'line2') },
    focus: { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: tone(m, 'focus'), outlineOffset: '2px' },
    extendCss: `&[aria-current='page'] { color: ${tone(m, 'text')}; border-color: ${tone(m, 'currentBorder')}; background: ${tone(m, 'currentFill')}; }`,
  }))

function Extra(props: { section: ExtraSection }) {
  const s = props.section
  return (
    <Reveal>
      <Section size="tight">
        <Wrap>
          <SectionHead label={s.label} title={s.title} text={s.text} />
          {isExtraMore(s) ? (
            <ExtraMoreBody section={s} />
          ) : s.kind === 'packages' ? (
            <AutoGrid min={s.cols ? undefined : 250} cols={s.cols} gap={12}>
              <For each={s.items} by={(i) => i.pkg}>
                {(i) => <PackageCard pkg={i.pkg} kind={i.role} text={i.text} />}
              </For>
            </AutoGrid>
          ) : s.kind === 'steps' ? (
            <StepCards items={s.items} />
          ) : (
            <StatRow stats={s.stats} />
          )}
        </Wrap>
      </Section>
    </Reveal>
  )
}

export function ProductPage(props: { data: ProductData }) {
  const d = props.data
  const click = useLinkClick()
  const Demo = DEMOS[d.demo.component]
  const extra = d.extraSections ?? EXTRA_SECTIONS[d.id] ?? EXTRA_SECTIONS_MORE[d.id] ?? []
  const docsHref = `/docs/${d.id}`

  useHead({
    title: `${d.name} — ${inlineText(d.hero.title)} · Pyreon`,
    meta: [
      { name: 'description', content: inlineText(d.hero.lede) },
      { property: 'og:title', content: `${d.name} · Pyreon` },
      { property: 'og:description', content: inlineText(d.hero.lede) },
    ],
  })

  return (
    <>
      <EmberGradientDefs />

      {/* 1 · hero */}
      <Section size="hero">
        <HeroGlow />
        <Wrap>
          <HeroGrid>
            <div>
              <ProductTag glyph={d.glyphSvg} name={d.package} category={d.category} />
              <Heading tag="h1" size="hero">
                {d.hero.title}
              </Heading>
              <Lede size="hero">{renderInline(d.hero.lede)}</Lede>
              <Ctas id="install">
                <InstallCommand command={d.hero.install} variant="hot" />
                <Pill size="lg" href={docsHref}>
                  Documentation
                </Pill>
              </Ctas>
            </div>
            <FactList facts={d.hero.facts} />
          </HeroGrid>
          <ProductHeroVisual id={d.id} />
        </Wrap>
      </Section>

      {/* 2 · proof */}
      <Show when={() => (d.proof?.length ?? 0) > 0}>
        <Section size="tight">
          <Wrap>
            <ProofBand
              items={(d.proof ?? []).map((p) => ({ stat: p.stat, label: p.label, source: p.source }))}
              caveat="synthetic · author-run · M3 Max · record of 2026-11-05"
              link={{ label: 'Every result, including where we lose →', href: '/benchmarks' }}
            />
          </Wrap>
        </Section>
      </Show>

      {/* 3 · why teams pick it */}
      <Reveal>
        <Section size="tight">
          <Wrap>
            <SectionHead label="why teams pick it" title={d.why.title} />
            <NumberedCards items={d.why.items} />
          </Wrap>
        </Section>
      </Reveal>

      {/* 4 · the difference */}
      {d.difference ? (
        <Reveal>
          <Section size="tight">
            <Wrap>
              <SectionHead label="the difference" title={d.difference.title} />
              <BeforeAfter before={d.difference.before} after={d.difference.after} />
            </Wrap>
          </Section>
        </Reveal>
      ) : null}

      {/* 5 · extra sections (typed) */}
      <For each={extra} by={(s) => s.title}>
        {(s) => <Extra section={s} />}
      </For>

      {/* 6 · coming from */}
      <Show when={() => (d.comingFrom?.length ?? 0) > 0}>
        <Reveal>
          <Section size="tight">
            <Wrap>
              <SectionHead label="coming from" title={`Coming from ${(d.comingFrom ?? []).map((c) => c.lib).join(' or ')}?`} />
              <Stack>
                <For each={d.comingFrom ?? []} by={(c) => c.lib}>
                  {(c) => (
                    <Stack>
                      <Heading tag="h3" size="card">
                        {c.title}
                      </Heading>
                      <ComingFrom lib={c.lib} before={c.before} after={c.after} beforeHtml={c.beforeHtml} afterHtml={c.afterHtml} note={c.note} />
                    </Stack>
                  )}
                </For>
              </Stack>
            </Wrap>
          </Section>
        </Reveal>
      </Show>

      {/* 7 · try it */}
      <Section size="tight" id="demo">
        <Wrap>
          <SectionHead label="try it" title={d.demo.title} text={d.demo.text} />
          {Demo ? <Demo /> : null}
        </Wrap>
      </Section>

      {/* 8 · benchmarks */}
      {d.benchmarks ? (
        <Reveal>
          <Section size="tight" id="benchmarks">
            <Wrap>
              <SectionHead label="benchmarks" title={d.benchmarks.h} text={d.benchmarks.p} />
              <BenchmarkTable data={d.benchmarks} />
            </Wrap>
          </Section>
        </Reveal>
      ) : null}

      {/* 9 · what's included */}
      <Reveal>
        <Section size="tight">
          <Wrap>
            <SectionHead label="what's included" title={d.features.title} />
            <FeatureList items={d.features.items} />
          </Wrap>
        </Section>
      </Reveal>

      {/* 10 · recipes */}
      <Show when={() => (d.recipes?.length ?? 0) > 0}>
        <Reveal>
          <Section size="tight">
            <Wrap>
              <SectionHead label="recipes" title="Things to build with it." />
              <Stack>
                <For each={d.recipes ?? []} by={(r) => r.title}>
                  {(r) => (
                    <CodeCard
                      label={r.status ? `${r.title} · ${r.status}` : r.title}
                      caption={r.text}
                      code={r.code}
                      html={r.codeHtml}
                    />
                  )}
                </For>
              </Stack>
            </Wrap>
          </Section>
        </Reveal>
      </Show>

      {/* 11 · api */}
      <Reveal>
        <Section size="tight">
          <Wrap>
            <SectionHead
              label="api"
              title={d.api.title}
              text="Every export has a reference page with its signature, an example and the mistakes people make with it."
            />
            <ApiGroups groups={d.api.groups} />
          </Wrap>
        </Section>
      </Reveal>

      {/* 12 · good to know */}
      <Reveal>
        <Section size="tight">
          <Wrap>
            <SectionHead label="good to know" title="Good to know before you start." />
            <AutoGrid min={300} gap={12}>
              <For each={d.limits} by={(l) => l.title}>
                {(l) => <LimitNote title={l.title} text={l.text} />}
              </For>
            </AutoGrid>
          </Wrap>
        </Section>
      </Reveal>

      {/* 13 · faq */}
      <Show when={() => (d.faq?.length ?? 0) > 0}>
        <Reveal>
          <Section size="tight">
            <Wrap>
              <SectionHead label="questions" title="What people ask first." />
              <Faq items={d.faq ?? []} />
            </Wrap>
          </Section>
        </Reveal>
      </Show>

      {/* 14 · works with */}
      <Reveal>
        <Section size="tight">
          <Wrap>
            <SectionHead label="works with" title="Built to be used together." />
            <AutoGrid min={230}>
              <For each={d.related} by={(r) => r.href}>
                {(r) => (
                  <GlowCard href={r.href}>
                    <Eyebrow>{r.category}</Eyebrow>
                    <Heading tag="h3" size="card">
                      {r.name}
                    </Heading>
                    <Lede size="small">{r.text}</Lede>
                    <Eyebrow state="accent">{`${r.package} →`}</Eyebrow>
                  </GlowCard>
                )}
              </For>
            </AutoGrid>
          </Wrap>
        </Section>
      </Reveal>

      {/* 15 · closing CTA */}
      <Section size="end" id="start">
        <Wrap>
          <EndInner>
            <Heading tag="h2" size="end">
              {d.end.title}
            </Heading>
            <CenteredCtas>
              <InstallCommand command={d.hero.install} variant="hot" />
              <Pill variant="solid" size="lg" href={docsHref}>
                {d.end.cta}
              </Pill>
            </CenteredCtas>
          </EndInner>
        </Wrap>
      </Section>

      {/* 16 · other products */}
      <Switcher aria-label="Other products">
        <Wrap>
          <SwitchList>
            <li>
              <Eyebrow>more products</Eyebrow>
            </li>
            <For each={PRODUCTS} by={(p) => p.id}>
              {(p) => (
                <li>
                  <SwitchLink href={productHref(p.id)} aria-current={p.id === d.id ? 'page' : undefined} onClick={click(productHref(p.id))}>
                    {p.name}
                  </SwitchLink>
                </li>
              )}
            </For>
          </SwitchList>
        </Wrap>
      </Switcher>
    </>
  )
}

