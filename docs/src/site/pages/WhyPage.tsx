import { island } from '@pyreon/zero'
import type { WhyPage as Data } from '../content/types-site'
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
type Slot = { file: string; place: 'beside' | 'after'; kind: Data['sections'][number]['kind']; nth?: number; caption?: string }
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
      caption: 'Diagram of the hand-off, not a capture of this page.',
    },
  ],
}

export const whyDiagramFiles = (id: Data['id']): string[] => (WHY_DIAGRAMS[id] ?? []).map((s) => s.file)

export interface WhyView {
  page: Data
  svgs: Record<string, string>
  order: { id: string; title: string }[]
}

function figuresFor(page: Data, svgs: Record<string, string>): SectionFigure[] {
  const out: SectionFigure[] = []
  for (const slot of WHY_DIAGRAMS[page.id] ?? []) {
    const svg = svgs[slot.file]
    if (!svg) continue
    let seen = 0
    const at = page.sections.findIndex((s) => s.kind === slot.kind && seen++ === (slot.nth ?? 0))
    if (at < 0) continue
    out.push({ at, place: slot.place, node: <Diagram svg={svg} caption={slot.caption} scrollLabel={slot.place === 'after' ? 'Diagram' : undefined} /> })
  }
  if (page.id === 'components-run-once') {
    const at = page.sections.findIndex((s) => s.kind === 'code')
    if (at >= 0) {
      out.push({
        at,
        place: 'after',
        node: (
          <>
            <SectionHead
              label="try it"
              title="Click it. Count the renders."
              text="A real Pyreon counter, running in this page. The numbers come from the component and the DOM, not from a script."
            />
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
  const title = inlineText(d.hook.title)

  usePageHead({ path: d.route, title: `${d.share.ogTitle} · Pyreon`, description: inlineText(d.hook.lede) })

  return (
    <>
      <HookHero
        eyebrow={d.hook.eyebrow}
        title={title}
        emberWord={emberWordOf(title)}
        lede={d.hook.lede}
        install={d.hook.cta.command}
        ctas={d.hook.cta.href ? [{ label: d.hook.cta.label, href: d.hook.cta.href }] : [{ label: 'See the benchmarks', href: '/benchmarks' }]}
      />
      <SiteSections sections={d.sections} figures={figuresFor(d, props.view.svgs)} />
      <Section size="end">
        <Wrap>
          {d.end.cta.command ? (
            <EndCTA title={d.end.title} install={d.end.cta.command} primary={d.end.cta.href ? { label: d.end.cta.label, href: d.end.cta.href } : undefined} />
          ) : (
            <EndCTA title={d.end.title} install="npm create @pyreon/zero@latest" primary={d.end.cta.href ? { label: d.end.cta.label, href: d.end.cta.href } : undefined} />
          )}
        </Wrap>
      </Section>
      <RivalSwitcher label="Why Pyreon" current={d.id} items={props.view.order.map((p) => ({ id: p.id, href: `/why/${p.id}`, label: p.title }))} />
    </>
  )
}
