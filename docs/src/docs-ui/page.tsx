import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { DocsGlyph as Glyph } from './glyph'
import { Badge } from './sidebar'
import { editUrlOf, SITE_ORIGIN } from './actions'
import { useDocsData, type RailProduct } from './data'
import { prevNextOf, trailOf, type PageLink } from './nav'
import { PitchHead } from './sell/ProductPitch'
import { DocsActionsIsland, DocsEnhanceIsland, DocsHelpfulIsland } from './islands'
import { InlineToc, RailToc, tocEntries, type TocHeading } from './toc'

export function Breadcrumbs(props: { path: string; title: string }) {
  const t = trailOf(props.path)
  const link = (href: string, text: string) => h('li', null, h('a', { href }, text))
  // h(): the middle crumbs are conditional children (#4385).
  return h(
    'nav',
    { class: 'dx-crumbs', 'aria-label': 'Breadcrumb' },
    h(
      'ol',
      null,
      link('/docs', 'Docs'),
      t && t.item.href !== '/docs' ? h('li', null, h('span', null, t.group.group)) : null,
      t?.parent ? link(t.parent.href, t.parent.title) : null,
      h('li', null, h('span', { 'aria-current': 'page' }, t?.item.title ?? props.title)),
    ),
  )
}

/** The rail's ONE product card: the most relevant other product, with its proof badge (and the badge's source) when it has one. */
export function RailCard(props: { product: RailProduct }) {
  const p = props.product
  // h(): the badge is a conditional child (#4385).
  return h(
    'a',
    { class: 'dx-rcard', href: p.href },
    h('span', { class: 'dx-tile' }, h(Glyph, { id: p.id, size: 22 })),
    h('b', null, p.name),
    h('span', { class: 'dx-rcard__cond' }, `${p.package} · ${p.category}`),
    p.badge ? h(Badge, { badge: p.badge }) : null,
    h('em', null, `Explore ${p.name} →`),
  )
}

function PrevNext(props: { path: string }) {
  const { prev, next } = prevNextOf(props.path)
  const card = (l: PageLink, dir: 'prev' | 'next') =>
    h(
      'a',
      { class: `dx-pn__link dx-pn__link--${dir}`, href: l.href, rel: dir },
      h('small', null, dir === 'prev' ? 'Previous' : 'Next'),
      dir === 'prev' ? `← ${l.title}` : `${l.title} →`,
    )
  // h(): either card may be absent (#4385).
  return h(
    'nav',
    { class: 'dx-pn', 'aria-label': 'Previous and next page' },
    prev ? card(prev, 'prev') : h('span', null),
    next ? card(next, 'next') : h('span', null),
  )
}

function Rail(props: { entries: readonly TocHeading[]; slug: string | undefined }) {
  const data = useDocsData()
  // h(): the TOC, the card and the edit link are conditional children (#4385).
  return h(
    'aside',
    { class: 'dx-rail', 'aria-label': 'On this page and related' },
    props.entries.length > 0 ? h(RailToc, { entries: props.entries }) : null,
    data.rail ? h(RailCard, { product: data.rail }) : null,
    h(
      'ul',
      { class: 'dx-rlinks' },
      props.slug !== undefined ? h('li', null, h('a', { href: editUrlOf(props.slug), rel: 'noopener noreferrer' }, 'Edit this page')) : null,
      h('li', null, h('a', { href: '/docs/mcp' }, 'Ask your AI assistant (MCP)')),
      h('li', null, h('a', { href: '/benchmarks' }, 'Benchmarks')),
    ),
  )
}

/**
 * One docs page in the reading column + right rail. The body is the compiled
 * Markdown (or the docs home); everything around it is the same on every
 * page: breadcrumbs, page actions, the title, the inline TOC below 1180px,
 * "helpful?", prev / next, and the rail (TOC, one product card, links).
 *
 * The page is static HTML (`site/render-mode.ts`); the actions and "helpful?"
 * are islands, and one enhance island adds code copy, the TOCs' scroll-spy
 * and heading anchors (`islands.ts`).
 *
 * `title` renders as the page's h1, except on a product overview (whose page
 * data carries the product), where the pitch strip is the head and its h1 is
 * the product name, and on the docs home (`ownTitle`: its hero has the h1).
 * Either way the inline TOC sits under the title.
 */
export function DocsPage(props: {
  path: string
  title: string
  description?: string | undefined
  slug?: string | undefined
  headings: readonly TocHeading[]
  ownTitle?: boolean | undefined
  children?: VNodeChild
}) {
  const { slots, product } = useDocsData()
  const entries = tocEntries([...slots.before, ...props.headings, ...slots.after])
  const url = `${SITE_ORIGIN}${props.path}`
  // h() throughout: the generic title is a conditional child (#4385).
  return h(
    'div',
    { class: 'dx-page' },
    h(
      'div',
      { class: 'dx-article' },
      h(Breadcrumbs, { path: props.path, title: props.title }),
      h(DocsActionsIsland, { title: props.title, url, slug: props.slug }),
      props.ownTitle
        ? null
        : product
          ? h(PitchHead, { product })
          : h('header', { class: 'dx-head' }, h('h1', { class: 'dx-title' }, props.title), props.description ? h('p', { class: 'dx-desc' }, props.description) : null),
      entries.length > 0 ? h(InlineToc, { entries }) : null,
      h('div', { class: 'dx-prose', id: 'dx-article', tabIndex: -1 }, props.children),
      h(DocsHelpfulIsland, { title: props.title, url }),
      h(PrevNext, { path: props.path }),
      h(DocsEnhanceIsland, {}),
    ),
    h(Rail, { entries, slug: props.slug }),
  )
}
