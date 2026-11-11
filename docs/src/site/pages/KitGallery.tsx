import type { VNodeChild } from '@pyreon/core'
import { For } from '@pyreon/core'
import { useHead } from '@pyreon/head'
import { island } from '@pyreon/zero'
import { HOME, type HomeHero } from '../content/home'
import { shareImage } from '../kit/assets'
import { AnimatedSvg, Loop, Picture, Poster } from '../kit/media'
import notFoundArt from '../media/illustrations/404.svg?raw'
import { PyreonUI } from '@pyreon/ui-core'
import type { ProductData } from '../content/model'
import form from '../content/products/form.json'
import reactivity from '../content/products/reactivity.json'
import { el, tone, txt } from '../kit/bases'
import { BenchmarkTable, CompareBars, VerdictChip } from '../kit/bench'
import { ApiGroups, Faq, FactList, FeatureList, LimitNote, NumberedCards, StatRow, StepCards } from '../kit/blocks'
import { EmberGradientDefs, GlowCard, Glyph, PackageCard, ProductTag } from '../kit/cards'
import { BeforeAfter, CodeCard, CodeDiff } from '../kit/code'
import { Chip, InstallCommand, Pill } from '../kit/controls'
import { AutoGrid, Rule, Section, SectionHead, Wrap } from '../kit/layout'
import { Reveal } from '../kit/motion'
import { CaveatLine, EndCTA, HookHero, ProofBand, QuoteBlock } from '../kit/proof'
import { Code, Eyebrow, Heading, Lede, renderInline, StatusBadge, StatusDot } from '../kit/type'
import { color, font, type ColorKey } from '../theme'

// The gallery's interactive specimens: one island (the page is static).
const KitLiveIsland = island(() => import('./KitGalleryLive'), { name: 'KitGalleryLive', hydrate: 'visible', prefetch: 'idle' })
// The forced-theme panels' button Pills (a button outside an island does nothing on a static page).
const KitScopePillsIsland = island(() => import('./KitScopePills'), { name: 'KitScopePills', hydrate: 'visible' })
const HERO_MEDIA = (HOME.sections.find((s) => s.kind === 'hero') as HomeHero).visual.media

const FORM = form as unknown as ProductData
const REACTIVITY = reactivity as unknown as ProductData

/**
 * `/brand/kit` — every kit component in its variants and states, built from
 * the kit itself, shown in the page theme and (below) inside a forced
 * dark and a forced light scope. It is the brand/kit reference and the
 * visual test surface: the browser spec checks its contrast and overflow.
 */
const Block = el.config({ name: 'KitBlock' }).attrs({ tag: 'section', block: true, gap: 20 }).theme(() => ({ marginBottom: 72 }))
const Row = el.config({ name: 'KitRow' }).attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 12 }).theme(() => ({ flexWrap: 'wrap' }))
const Name = txt
  .config({ name: 'KitName' })
  .attrs({ tag: 'h3' })
  .theme((_t, m) => ({
    margin: 0,
    fontFamily: font.mono,
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: '.04em',
    color: tone(m, 'accentText'),
    paddingBottom: 8,
    borderBottom: '1px solid',
    borderColor: tone(m, 'line'),
  }))

function Specimen(props: { name: string; children?: VNodeChild }) {
  return (
    <Block aria-label={props.name}>
      <Name>{props.name}</Name>
      {props.children}
    </Block>
  )
}

const Swatch = el
  .config({ name: 'KitSwatch' })
  .attrs({ block: true, gap: 6 })
  .theme((_t, m) => ({ padding: 12, borderRadius: 12, border: '1px solid', borderColor: tone(m, 'line'), fontFamily: font.mono, fontSize: 11.5, color: tone(m, 'mist') }))

const Chip2 = el.config({ name: 'KitChipColour' }).attrs({ block: true }).theme(() => ({ height: 36, borderRadius: 8, border: '1px solid rgba(128,128,128,.25)' }))

const SWATCHES: ColorKey[] = ['bg', 'card', 'raised', 'line', 'line2', 'text', 'strong', 'mist', 'fog', 'accent', 'accentText', 'link', 'prompt', 'ok', 'warn', 'err']

const ScopeBox = el.config({ name: 'KitScope' }).attrs({ block: true, gap: 16 }).theme((_t, m) => ({ padding: 24, borderRadius: 22, border: '1px dashed', borderColor: tone(m, 'line2'), backgroundColor: tone(m, 'bg'), color: tone(m, 'text') }))

/** The same few components forced into one theme (a nested provider scopes `data-theme`). */
function Scope(props: { mode: 'dark' | 'light' }) {
  return (
    <PyreonUI mode={props.mode}>
      <ScopeBox data-testid={`kit-scope-${props.mode}`}>
        <Eyebrow>{`forced ${props.mode}`}</Eyebrow>
        <Heading tag="h3" size="card">
          Components run once.
        </Heading>
        <Lede size="card">{renderInline('Every token from `theme.ts` resolves through one CSS variable per mode pair.')}</Lede>
        <Row>
          <KitScopePillsIsland mode={props.mode} />
          <VerdictChip verdict="win" />
          <VerdictChip verdict="tie" />
          <VerdictChip verdict="loss" />
          <Chip>signal()</Chip>
        </Row>
        <InstallCommand command="npm create @pyreon/zero@latest" />
      </ScopeBox>
    </PyreonUI>
  )
}

export function KitGallery() {
  useHead({ title: 'Brand and kit · Pyreon', meta: [{ name: 'description', content: 'Every building block of pyreon.dev, in both themes.' }] })
  return (
    <>
      <EmberGradientDefs />
      <Section size="hero">
        <Wrap>
          <SectionHead
            label="brand · kit"
            title="The blocks pyreon.dev is made of."
            text="Every component in `src/site/kit`, in its variants and states, rendered by the kit itself. Toggle the theme in the bar to see both; the two panels at the end force one theme each."
          />

          <Specimen name="theme.ts → color (this theme)">
            <AutoGrid min={140} gap={10}>
              <For each={SWATCHES} by={(k) => k}>
                {(k) => (
                  <Swatch>
                    <Chip2 style={`background:${color[k].dark}`} data-mode="dark" />
                    <Chip2 style={`background:${color[k].light}`} data-mode="light" />
                    <span>{k}</span>
                  </Swatch>
                )}
              </For>
            </AutoGrid>
          </Specimen>

          <Specimen name="Eyebrow · Heading · Lede · Code · StatusDot · StatusBadge">
            <Eyebrow>eyebrow default</Eyebrow>
            <Eyebrow state="accent">eyebrow accent</Eyebrow>
            <Heading tag="h2" size="section">
              Heading section
            </Heading>
            <Heading tag="h3" size="card">
              Heading card
              <StatusBadge>next release</StatusBadge>
            </Heading>
            <Lede size="section">{renderInline('Lede section with `inline code`, {dot:ok} ok, {dot:warn} warn and {dot:err} err dots.')}</Lede>
            <Lede size="card">
              Lede card with <Code>signal(0)</Code> and <StatusDot state="ok" />a dot.
            </Lede>
          </Specimen>

          <Specimen name="Pill · InstallCommand · Chip · Segmented">
            <Row>
              <Pill href="/docs">Ghost md</Pill>
              <Pill href="/docs" size="lg">
                Ghost lg
              </Pill>
              <Pill href="/docs" variant="solid">
                Solid md
              </Pill>
              <Pill href="/docs" variant="solid" size="lg">
                Solid lg
              </Pill>
            </Row>
            <Row>
              <InstallCommand command="bun add @pyreon/form" />
              <InstallCommand command="npm create @pyreon/zero@latest" variant="hot" />
            </Row>
            <Row>
              <Chip>useForm</Chip>
              <Chip>useField</Chip>
              <Chip>FormProvider</Chip>
            </Row>
          </Specimen>

          <Specimen name="GlowCard · PackageCard · ProductTag · Glyph">
            <AutoGrid min={240}>
              <GlowCard state="hot">
                <Eyebrow state="accent">01 · hot</Eyebrow>
                <Heading tag="h3" size="card">
                  A hot card
                </Heading>
                <Lede size="card">The first card in a set carries the ember glow.</Lede>
              </GlowCard>
              <GlowCard>
                <Eyebrow>02 · default</Eyebrow>
                <Heading tag="h3" size="card">
                  A default card
                </Heading>
                <Lede size="card">Gradient edge, inner sheen.</Lede>
              </GlowCard>
              <GlowCard href="/products/form">
                <Eyebrow>03 · link</Eyebrow>
                <Heading tag="h3" size="card">
                  A card that is a link
                </Heading>
                <Lede size="card">The whole card is one link.</Lede>
              </GlowCard>
              <PackageCard pkg="@pyreon/runtime-dom" kind="browser" text="Fine-grained DOM updates and hydration." />
            </AutoGrid>
            <Row>
              <ProductTag glyph={FORM.glyphSvg} name={FORM.package} category={FORM.category} />
              <ProductTag id="reactivity" name="@pyreon/reactivity" category="core · signals" />
              <Glyph id="pyreon" size={40} />
              <Glyph id="charts" size={40} />
              <Glyph id="native" size={40} />
            </Row>
          </Specimen>

          <Specimen name="FactList">
            <FactList facts={FORM.hero.facts} />
          </Specimen>

          <Specimen name="NumberedCards">
            <NumberedCards items={FORM.why.items} />
          </Specimen>

          <Specimen name="StepCards">
            <StepCards
              items={[
                { title: 'Write it once', text: 'One `.tsx` file.' },
                { title: 'Build the web', text: 'SSG, SSR or SPA per route.' },
                { title: 'Compile the apps', text: 'SwiftUI and Compose (experimental).' },
              ]}
            />
          </Specimen>

          <Specimen name="BeforeAfter · CodeCard (build-time highlighting)">
            {FORM.difference ? <BeforeAfter before={FORM.difference.before} after={FORM.difference.after} /> : null}
            <CodeCard label="plain code (no build-time html)" caption="Falls back to the theme foreground." code={'const count = signal(0)\ncount.set(1)'} />
          </Specimen>

          <Specimen name="CodeDiff (C2)">
            <CodeDiff
              rows={[
                ['-', 'const [count, setCount] = useState(0)'],
                ['+', 'const count = signal(0)'],
                ['-', 'const double = useMemo(() => count * 2, [count])'],
                ['+', 'const double = computed(() => count() * 2)'],
                [' ', 'return <p>{double()}</p>'],
              ]}
              caption="Your component runs once. Nothing to memoise."
            />
          </Specimen>

          <Specimen name="ProofBand (C1)">
            <ProofBand
              title="Same app. Less code shipped, less work done."
              items={[
                { stat: '4×', label: 'less JavaScript than React 19 for the same app', detail: '17.2 KB vs 69.6 KB gzip', condition: 'same app, gzip -9' },
                { stat: '2.6×', label: 'faster than React 19 creating 10,000 rows', detail: '72.6 ms vs 192.0 ms', condition: 'real Chromium, row board' },
                { stat: '1.94–1.95×', label: 'faster batching of 50 signals than Preact Signals', detail: '456 ns vs 888 ns', condition: 'final pass, two runs' },
              ]}
              caveat="synthetic · author-run · M3 Max · record of 2026-11-05"
              link={{ label: 'Every result, including where we lose →', href: '/benchmarks' }}
            />
          </Specimen>

          <Specimen name="StatRow">
            <StatRow
              stats={[
                { value: '72.6 ms', label: 'create 10,000 rows' },
                { value: '0.13 ms', label: 'clear them' },
                { value: '17.2 KB', label: 'whole app, gzip' },
                { value: '24', label: 'MCP tools' },
              ]}
            />
          </Specimen>

          <Specimen name="VerdictChip · CompareBars · BenchmarkTable · CaveatLine">
            <Row>
              <VerdictChip verdict="win" />
              <VerdictChip verdict="tie" />
              <VerdictChip verdict="split" />
              <VerdictChip verdict="loss" />
              <VerdictChip verdict="info" />
            </Row>
            <CompareBars pyreon={456} rival={888} unit="ns" />
            {REACTIVITY.benchmarks ? <BenchmarkTable data={REACTIVITY.benchmarks} /> : null}
            <CaveatLine text="synthetic · author-run · one run · M3 Max · record of 2026-11-05" link={{ label: 'Every result, including where we lose →', href: '/benchmarks' }} />
          </Specimen>

          <Specimen name="FeatureList · ApiGroups · LimitNote · Faq">
            <FeatureList items={FORM.features.items.slice(0, 4)} />
            <ApiGroups groups={FORM.api.groups.slice(0, 2)} />
            <AutoGrid min={300} gap={12}>
              <For each={FORM.limits.slice(0, 2)} by={(l) => l.title}>
                {(l) => <LimitNote title={l.title} text={l.text} />}
              </For>
            </AutoGrid>
            <Faq items={(FORM.faq ?? []).slice(0, 2)} />
          </Specimen>

          <Specimen name="Pill (button) · Segmented · DemoSurface · Meters: live, one island (KitScope)">
            <KitLiveIsland />
          </Specimen>

          <Specimen name="Picture · Poster · Loop · AnimatedSvg · shareImage (the asset set, kit/media.tsx)">
            <AutoGrid cols={2} gap={16}>
              <Picture file="showcase/app-dashboard.png" sizes="(min-width: 960px) 600px, 100vw" />
              <Poster file="home/runs-once-tree.svg" sizes="(min-width: 960px) 600px, 100vw" />
            </AutoGrid>
            <Loop media={HERO_MEDIA} />
            <AutoGrid cols={2} gap={16}>
              <AnimatedSvg file="illustrations/404.svg" markup={notFoundArt} />
              <Lede size="small" style="overflow-wrap:anywhere;min-width:0">{renderInline(`\`shareImage('/')\` → \`${shareImage('/').url}\` (${shareImage('/').width}×${shareImage('/').height})`)}</Lede>
            </AutoGrid>
          </Specimen>

          <Specimen name="QuoteBlock (C4)">
            <QuoteBlock text="Components run once. What you write in the body runs once, and only the expressions that read a signal update." attribution="Pyreon docs" href="/docs/reactivity" />
            <QuoteBlock text="A tie is a tie." attribution="Pyreon benchmark record" href="/benchmarks" />
          </Specimen>

          <Specimen name="Reveal">
            <Reveal>
              <GlowCard>
                <Lede size="card">This card fades up the first time it scrolls into view (instant under reduced motion).</Lede>
              </GlowCard>
            </Reveal>
          </Specimen>

          <Specimen name="Both themes, forced">
            <AutoGrid cols={2} gap={16}>
              <Scope mode="dark" />
              <Scope mode="light" />
            </AutoGrid>
          </Specimen>

          <Rule />
        </Wrap>
      </Section>

      <HookHero
        eyebrow="HookHero (C3)"
        title="Your component runs once. Ever."
        emberWord="Ever."
        lede="The hook hero: one bold line, one word in the display gradient with its underline sweep, the hot install command and status dots."
        install="npm create @pyreon/zero@latest"
        ctas={[{ label: 'Read the docs', href: '/docs' }]}
        status={[
          { dot: 'ok', text: 'MIT, no strings' },
          { dot: 'warn', text: 'iOS and Android: experimental', href: '/products/native' },
        ]}
      />

      <EndCTA
        title="Start building in one line."
        emberWord="one line."
        lede="EndCTA (C6): the closing call to action, centred on a punch surface."
        install="npm create @pyreon/zero@latest"
        primary={{ label: 'Follow the tutorial', href: '/docs/getting-started' }}
        native={{ label: 'Want the apps from day one?', command: 'npm create @pyreon/multiplatform@latest' }}
        links={[
          { label: 'Star on GitHub', href: 'https://github.com/pyreon/pyreon' },
          { label: 'Join the Discord', href: '/discord' },
          { label: 'Get the newsletter', href: '/newsletter' },
        ]}
      />
    </>
  )
}
