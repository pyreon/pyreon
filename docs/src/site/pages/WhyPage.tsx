import { island } from '@pyreon/zero'
import { fill } from '../content/fill'
import type { WhyPage as Data, WhyTemplate } from '../content/types-site'
import { inlineText } from '../kit/inline'
import { Section, SectionHead, Wrap } from '../kit/layout'
import { EndCTA, HookHero } from '../kit/proof'
import { Diagram } from '../kit/story'
import { usePageHead } from '../head'
import { emberWordOf } from './ember'
import { RivalSwitcher } from './RivalSwitcher'
import { SiteSections, type SectionFigure } from './SiteSections'

/**
 * `/why/<id>` — one template for the five story pages
 * (`content/pages/why/<id>.json`): the hook hero, the content's sections in
 * order (`SiteSections`), each page's explanatory diagram from the asset set,
 * and, on `/why/components-run-once`, a live counter island on the real
 * `@pyreon/reactivity`.
 */

/** The live run-once counter (`demos/DemoRunOnce.tsx`), loaded when it scrolls near. */
const DemoRunOnce = island(() => import('../demos/DemoRunOnce'), { name: 'DemoRunOnce', hydrate: 'visible', prefetch: 'idle' })

/**
 * Where each page's diagram goes. The content set orders the sections; the
 * asset set has one diagram per page (`why/<id>.svg`, plus
 * `why/hydration-adopts.svg` for the hydration story). A diagram sits beside
 * the section that tells its story, or after the first section of a kind.
 */
type Slot = { file: string; place: 'beside' | 'after'; kind: Data['sections'][number]['kind']; nth?: number; caption?: keyof WhyTemplate['diagram'] }
export const WHY_DIAGRAMS: Readonly<Record<Data['id'], readonly Slot[]>> = {
  'components-run-once': [{ file: 'why/components-run-once.svg', place: 'beside', kind: 'story' }],
  'one-codebase': [{ file: 'why/one-codebase.svg', place: 'beside', kind: 'story' }],
  'ai-ready': [{ file: 'why/ai-ready.svg', place: 'after', kind: 'code' }],
  performance: [{ file: 'why/performance.svg', place: 'after', kind: 'proof' }],
  'full-stack': [
    { file: 'why/full-stack.svg', place: 'after', kind: 'code' },
    {
      file: 'why/hydration-adopts.svg',
      place: 'beside',
      kind: 'story',
      caption: 'handOff',
    },
  ],
}

export const whyDiagramFiles = (id: Data['id']): string[] => (WHY_DIAGRAMS[id] ?? []).map((s) => s.file)

export interface WhyView {
  page: Data
  svgs: Record<string, string>
  order: { id: string; title: string }[]
  template: WhyTemplate
}

function figuresFor(page: Data, svgs: Record<string, string>, T: WhyTemplate): SectionFigure[] {
  const out: SectionFigure[] = []
  for (const slot of WHY_DIAGRAMS[page.id] ?? []) {
    const svg = svgs[slot.file]
    if (!svg) continue
    let seen = 0
    const at = page.sections.findIndex((s) => s.kind === slot.kind && seen++ === (slot.nth ?? 0))
    if (at < 0) continue
    const caption = slot.caption ? T.diagram[slot.caption] : undefined
    out.push({ at, place: slot.place, node: <Diagram svg={svg} caption={caption} scrollLabel={slot.place === 'after' ? T.diagram.scroll : undefined} /> })
  }
  if (page.id === 'components-run-once') {
    const at = page.sections.findIndex((s) => s.kind === 'code')
    if (at >= 0) {
      out.push({
        at,
        place: 'after',
        node: (
          <>
            <SectionHead label={T.tryIt.label} title={T.tryIt.title} text={T.tryIt.text} />
            <DemoRunOnce />
          </>
        ),
      })
    }
  }
  return out
}

export function WhyPage(props: { view: WhyView }) {
  const d = props.view.page
  const T = props.view.template
  const title = inlineText(d.hook.title)
  const end = d.end.cta.href ? { label: d.end.cta.label, href: d.end.cta.href } : undefined

  usePageHead({ path: d.route, title: fill(T.meta.title, { title: d.share.ogTitle }), description: inlineText(d.hook.lede) })

  return (
    <>
      <HookHero
        eyebrow={d.hook.eyebrow}
        title={title}
        emberWord={emberWordOf(title)}
        lede={d.hook.lede}
        install={d.hook.cta.command}
        ctas={d.hook.cta.href ? [{ label: d.hook.cta.label, href: d.hook.cta.href }] : [T.heroLink]}
      />
      <SiteSections sections={d.sections} figures={figuresFor(d, props.view.svgs, T)} />
      <Section size="end">
        <Wrap>
          <EndCTA title={d.end.title} install={d.end.cta.command} primary={end} />
        </Wrap>
      </Section>
      <RivalSwitcher label={T.switcher} current={d.id} items={props.view.order.map((p) => ({ id: p.id, href: `/why/${p.id}`, label: p.title }))} />
    </>
  )
}
