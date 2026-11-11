import { For } from '@pyreon/core'
import type { CompareMeta } from '../content/pages'
import { htmlOf } from '../content/pages'
import type { ComparePage as Data } from '../content/types-site'
import { el, tone, txt } from '../kit/bases'
import { GlowCard } from '../kit/cards'
import { CodeCard } from '../kit/code'
import { CompareTable, VerdictLegend } from '../kit/compare'
import { Pill } from '../kit/controls'
import { inlineText } from '../kit/inline'
import { AutoGrid, Section, SectionHead, Wrap } from '../kit/layout'
import { Reveal } from '../kit/motion'
import { CaveatLine, EndCTA, HookHero, ProofBand, TextLink } from '../kit/proof'
import { CompareStrip, Diagram, InlineText } from '../kit/story'
import { Eyebrow, Heading, Lede, renderInline } from '../kit/type'
import { font, text } from '../theme'
import { useSitePageHead } from './assets'
import { emberWordOf } from './ember'
import { RivalSwitcher } from './RivalSwitcher'

/**
 * `/compare/<rival>` — one template for the six rival pages
 * (`content/pages/compare/<id>.json`): the hook, the sourced proof band, the
 * line-by-line table with verdict chips, the measured chart (or diagram) from
 * the asset set, the code side by side, what you stop writing, the migration
 * pointer, then — plainly, lower down — when to pick the other one.
 * Every number carries its run condition and links to `/benchmarks`.
 */
export interface CompareView {
  page: Data
  meta: CompareMeta
  /** `compare/<id>.svg` from the asset set (a measured chart, or a diagram where there is no head-to-head). */
  svg: string | undefined
}

const Checked = txt
  .config({ name: 'CompareChecked' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, marginTop: 14, fontFamily: font.mono, fontSize: text.caveat.size, lineHeight: 1.6, color: tone(m, 'fog') }))

const PlainList = el
  .config({ name: 'ComparePickList' })
  .attrs({ tag: 'ul', block: true, gap: 10 })
  .theme((_t, m) => ({ margin: 0, paddingLeft: 20, maxWidth: 760, color: tone(m, 'mist'), fontFamily: font.sans, fontSize: text.body.size, lineHeight: text.body.lineHeight }))

const MigrateRow = el
  .config({ name: 'CompareMigrate' })
  .attrs({ block: true, gap: 14 })
  .theme(() => ({ maxWidth: 720 }))

const Stack = el.config({ name: 'CompareStack' }).attrs({ block: true, contentAlignX: 'block', gap: 18 })

export function ComparePage(props: { view: CompareView }) {
  const d = props.view.page
  const meta = props.view.meta
  const title = inlineText(d.hook.title)
  const measured = d.rivalMeasured !== null

  useSitePageHead({
    path: d.route,
    title: `Pyreon vs ${d.rival}: ${title} · Pyreon`,
    description: inlineText(d.hook.lede),
  })

  return (
    <>
      <HookHero
        eyebrow={d.hook.eyebrow}
        title={title}
        emberWord={emberWordOf(title)}
        lede={d.hook.lede}
        install={d.cta.command}
        ctas={[{ label: d.migrate.label, href: d.migrate.href }]}
      />

      {/* proof */}
      <Section size="tight">
        <Wrap>
          <ProofBand
            items={d.proof.map((p) => ({ stat: p.stat, label: p.label, condition: p.condition }))}
            caveat={meta.caveat}
            link={{ label: 'Every result, including where we lose →', href: '/benchmarks' }}
          />
        </Wrap>
      </Section>

      {/* the table */}
      <Reveal>
        <Section size="tight" id="table">
          <Wrap>
            <SectionHead label="side by side" title={d.table.title} text={d.table.note} />
            <VerdictLegend rival={d.rival} />
            <CompareTable rival={d.rival} rows={d.table.rows} caption={measured ? `Measured against ${d.rivalMeasured}` : undefined} />
            <Checked>
              {meta.caveat} <TextLink href="/benchmarks">Method and every result →</TextLink>
            </Checked>
          </Wrap>
        </Section>
      </Reveal>

      {/* the measured chart / diagram */}
      {props.view.svg ? (
        <Reveal>
          <Section size="tight" id="chart">
            <Wrap>
              <SectionHead
                label={measured ? 'measured' : 'how it works'}
                title={measured ? `The measured rows, drawn.` : `The two stacks, drawn.`}
              />
              <Diagram svg={props.view.svg} scrollLabel={measured ? `Pyreon vs ${d.rival}, measured` : `Pyreon vs ${d.rival}, diagram`} />
              <CaveatLine text={measured ? `${meta.caveat}` : 'Diagram, not a measurement.'} link={{ label: 'How we measure →', href: '/benchmarks' }} />
            </Wrap>
          </Section>
        </Reveal>
      ) : null}

      {/* code */}
      <Reveal>
        <Section size="tight" id="code">
          <Wrap>
            <SectionHead label="same component" title={d.code.title} text={d.code.caption} />
            <AutoGrid cols={2} gap={16}>
              <CodeCard label={`${d.code.rival.label} · ${d.code.rival.file}`} code={d.code.rival.code} html={htmlOf(d.code.rival)} rail="del" />
              <CodeCard label={`${d.code.pyreon.label} · ${d.code.pyreon.file}`} code={d.code.pyreon.code} html={htmlOf(d.code.pyreon)} state="hot" rail="ins" />
            </AutoGrid>
            <Checked>{renderInline(d.code.checked)}</Checked>
          </Wrap>
        </Section>
      </Reveal>

      {/* what you stop writing */}
      {d.deletes ? (
        <Reveal>
          <Section size="tight" id="deletes">
            <Wrap>
              <SectionHead label="the code you delete" title={d.deletes.title} />
              <CompareStrip beforeName="Stop writing" afterName="Instead" items={d.deletes.items.map((i) => ({ label: 'stop writing', before: i.what, after: i.instead }))} />
            </Wrap>
          </Section>
        </Reveal>
      ) : null}

      {/* migration pointer */}
      <Section size="tight" id="migrate">
        <Wrap>
          <GlowCard state="hot">
            <MigrateRow>
              <Eyebrow state="accent">migration</Eyebrow>
              <Heading tag="h2" size="card">
                {d.migrate.title}
              </Heading>
              <Lede size="card">{renderInline(d.migrate.text)}</Lede>
              <div>
                <Pill href={d.migrate.href} variant="solid">
                  {d.migrate.label}
                </Pill>
              </div>
            </MigrateRow>
          </GlowCard>
        </Wrap>
      </Section>

      {/* when to pick the other one: plain, lower on the page */}
      <Section size="tight" id="pick-the-other">
        <Wrap>
          <Stack>
            <Heading tag="h2" size="card">
              {d.pickTheOther.title}
            </Heading>
            <PlainList>
              <For each={d.pickTheOther.items} by={(i) => i}>
                {(i) => (
                  <li>
                    <InlineText>{renderInline(i)}</InlineText>
                  </li>
                )}
              </For>
            </PlainList>
          </Stack>
        </Wrap>
      </Section>

      <Section size="end">
        <Wrap>
          <EndCTA title={d.cta.title} install={d.cta.command} primary={{ label: d.cta.secondary.label, href: d.cta.secondary.href }} />
        </Wrap>
      </Section>

      <RivalSwitcher label="Compare with" current={d.id} items={meta.order.map((id) => ({ id, href: `/compare/${id}`, label: compareLabel(id) }))} />
    </>
  )
}

const LABELS: Record<string, string> = {
  react: 'React',
  next: 'Next.js',
  solid: 'Solid',
  vue: 'Vue',
  svelte: 'Svelte',
  'react-native': 'React Native',
}
const compareLabel = (id: string): string => LABELS[id] ?? id
