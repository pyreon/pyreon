import type { VNodeChild } from '@pyreon/core'
import { For, Show } from '@pyreon/core'
import { htmlOf, type WhyMeta } from '../content/pages'
import whyMeta from '../content/pages/why/_meta.json'
import type { SiteSection } from '../content/types-site'
import { el, tone, txt } from '../kit/bases'
import { Faq } from '../kit/blocks'
import { CodeCard } from '../kit/code'
import { AutoGrid, Section, SectionHead, Wrap } from '../kit/layout'
import { Reveal } from '../kit/motion'
import { CaveatLine, ProofBand, QuoteBlock } from '../kit/proof'
import { CompareStrip, ItemCards, LinkCards, Prose, StepList, StorySplit } from '../kit/story'
import { DataTable } from '../kit/table'
import { Heading, renderInline } from '../kit/type'
import { font, text } from '../theme'
import { BrandSection, isBrandSection } from './BrandSections'

/**
 * Renders the content set's `SiteSection` union (`types-site.ts`) for the
 * story (`/why/*`) and project pages. One component per `kind`; the switch is
 * exhaustive, so a new kind in the schema fails the typecheck here rather
 * than rendering nothing. Every string goes through the inline grammar.
 *
 * The label above each kind (and the proof band's caveat and link) is the
 * content's `template.sections` in `_why.json`, shared with the project pages.
 * This renders on the server only (static pages), so the import costs no
 * client bytes.
 *
 * `figures` places page-specific extras (the diagram from the asset set, a
 * live island) beside or after a given section: `beside` puts a diagram next
 * to a `story` section's prose from 992px; `after` adds a full-width block.
 */
export interface SectionFigure {
  /** Index into the page's `sections`. */
  at: number
  place: 'beside' | 'after'
  node: VNodeChild
}

const Caption = txt
  .config({ name: 'SiteSectionCaption' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, marginTop: 14, maxWidth: 760, fontFamily: font.mono, fontSize: text.caveat.size, lineHeight: 1.6, color: tone(m, 'fog') }))

const Stack = el.config({ name: 'SiteSectionStack' }).attrs({ block: true, contentAlignX: 'block', gap: 16 })

const L = (whyMeta as unknown as WhyMeta).template.sections

function Body(props: { s: SiteSection }): VNodeChild {
  const s = props.s
  switch (s.kind) {
    case 'proof':
      return (
        <ProofBand
          title={s.title}
          items={s.stats.map((p) => ({ stat: p.stat, label: p.label, condition: p.condition }))}
          caveat={s.note ?? L.proofCaveat}
          link={L.proofLink}
        />
      )
    case 'diff':
      return (
        <>
          <SectionHead label={L.diff} title={s.title} />
          <AutoGrid cols={2} gap={16}>
            <CodeCard label={s.before.label} code={s.before.code} html={htmlOf(s.before)} rail="del" />
            <CodeCard label={s.after.label} code={s.after.code} html={htmlOf(s.after)} state="hot" rail="ins" />
          </AutoGrid>
          <Caption>{renderInline(s.caption)}</Caption>
        </>
      )
    case 'code':
      return (
        <>
          <SectionHead label={L.code} title={s.title} text={s.text} />
          <AutoGrid cols={Math.min(2, s.blocks.length)} gap={16}>
            <For each={s.blocks} by={(b) => b.label}>
              {(b) => <CodeCard label={b.label} code={b.code} html={htmlOf(b)} />}
            </For>
          </AutoGrid>
          <Show when={() => !!s.caption}>
            <Caption>{renderInline(s.caption ?? '')}</Caption>
          </Show>
        </>
      )
    case 'story':
      return (
        <>
          <Heading tag="h2" size="section">
            {s.title}
          </Heading>
          <Prose paragraphs={s.text} />
        </>
      )
    case 'steps':
      return (
        <>
          <SectionHead label={L.steps} title={s.title} />
          <StepList items={s.items.map((i) => ({ ...i, codeHtml: htmlOf(i) }))} />
        </>
      )
    case 'list':
      return (
        <>
          <SectionHead label={L.list} title={s.title} text={s.text} />
          <ItemCards items={s.items.map((i) => ({ ...i, codeHtml: htmlOf(i) }))} />
        </>
      )
    case 'quote':
      return <QuoteBlock text={s.text} attribution={s.attribution} href={s.href} />
    case 'compare-strip':
      return (
        <>
          <SectionHead label={L.compareStrip} title={s.title} />
          <CompareStrip items={s.items} />
        </>
      )
    case 'faq':
      return (
        <>
          <SectionHead label={L.faq} title={s.title} />
          <Faq items={s.items} />
        </>
      )
    case 'links':
      return (
        <>
          <SectionHead label={L.links} title={s.title} />
          <LinkCards items={s.items} />
        </>
      )
    case 'note':
      return <CaveatLine text={s.text} link={s.href ? { label: L.noteLink, href: s.href } : undefined} />
    case 'table':
      return (
        <>
          <SectionHead label={L.table} title={s.title} />
          <DataTable
            columns={s.columns}
            rows={s.rows.map((r) => ({ key: r[0] ?? '', cells: r.map((c) => ({ content: renderInline(c) })) }))}
          />
        </>
      )
    case 'logos':
    case 'palette':
    case 'type':
    case 'dodont':
      return isBrandSection(s) ? <BrandSection s={s} /> : null
    default: {
      const never: never = s
      return never
    }
  }
}

export function SiteSections(props: { sections: readonly SiteSection[]; figures?: readonly SectionFigure[] | undefined }) {
  const figures = props.figures ?? []
  const items = props.sections.map((s, i) => ({ s, i }))
  return (
    <For each={items} by={(x) => x.i}>
      {(x) => {
        const beside = figures.find((f) => f.at === x.i && f.place === 'beside')
        const after = figures.filter((f) => f.at === x.i && f.place === 'after')
        return (
          <>
            <Reveal>
              <Section size="tight">
                <Wrap>
                  <Stack>
                    {beside ? <StorySplit diagram={beside.node}>{<Body s={x.s} />}</StorySplit> : <Body s={x.s} />}
                  </Stack>
                </Wrap>
              </Section>
            </Reveal>
            <For each={after.map((f, k) => ({ f, k }))} by={(y) => y.k}>
              {(y) => (
                <Section size="tight">
                  <Wrap>{y.f.node}</Wrap>
                </Section>
              )}
            </For>
          </>
        )
      }}
    </For>
  )
}
