import type { VNodeChild } from '@pyreon/core'
import { h, onMount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { DocsGlyph as Glyph } from './glyph'
import { Badge } from './sidebar'
import { useLinkClick } from '../site/kit/link'
import { editUrlOf, PageActions, SITE_ORIGIN } from './actions'
import { useDocsData, type RailProduct } from './data'
import { prevNextOf, trailOf, type PageLink } from './nav'
import { InlineToc, RailToc, tocEntries, useScrollSpy, type TocHeading } from './toc'

export function Breadcrumbs(props: { path: string; title: string }) {
  const click = useLinkClick()
  const t = trailOf(props.path)
  const link = (href: string, text: string) => h('li', null, h('a', { href, onClick: click(href) }, text))
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
  const click = useLinkClick()
  const p = props.product
  // h(): the badge is a conditional child (#4385).
  return h(
    'a',
    { class: 'dx-rcard', href: p.href, onClick: click(p.href) },
    h('span', { class: 'dx-tile' }, h(Glyph, { id: p.id, size: 22 })),
    h('b', null, p.name),
    h('span', { class: 'dx-rcard__cond' }, `${p.package} · ${p.category}`),
    p.badge ? h(Badge, { badge: p.badge }) : null,
    h('em', null, `Explore ${p.name} →`),
  )
}

function PrevNext(props: { path: string }) {
  const click = useLinkClick()
  const { prev, next } = prevNextOf(props.path)
  const card = (l: PageLink, dir: 'prev' | 'next') =>
    h(
      'a',
      { class: `dx-pn__link dx-pn__link--${dir}`, href: l.href, onClick: click(l.href), rel: dir },
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

/**
 * "Was this page helpful?" — nothing is recorded (the site has no analytics).
 * "No" turns into a link to a GitHub issue that names the page, which is the
 * one thing that actually gets a page fixed.
 */
function Helpful(props: { title: string; url: string }) {
  const answer = signal<'yes' | 'no' | null>(null)
  const issue = `https://github.com/pyreon/pyreon/issues/new?title=${encodeURIComponent(`docs: ${props.title}`)}&body=${encodeURIComponent(`Page: ${props.url}\n\nWhat was missing or wrong:\n`)}`
  return (
    <div class="dx-helpful">
      {() =>
        answer() === null ? (
          <>
            <span id="dx-helpful-q">Was this page helpful?</span>
            <button type="button" aria-describedby="dx-helpful-q" onClick={() => answer.set('yes')}>
              Yes
            </button>
            <button type="button" aria-describedby="dx-helpful-q" onClick={() => answer.set('no')}>
              No
            </button>
          </>
        ) : answer() === 'yes' ? (
          <output>Good to hear. Nothing was recorded: this site has no analytics.</output>
        ) : (
          <output>
            Sorry about that.{' '}
            <a href={issue} rel="noopener noreferrer">
              Tell us what is missing on GitHub
            </a>
            .
          </output>
        )
      }
    </div>
  )
}

function Rail(props: { entries: readonly TocHeading[]; active: () => string | undefined; slug: string | undefined }) {
  const data = useDocsData()
  const click = useLinkClick()
  // h(): the card and the edit link are conditional children (#4385).
  return h(
    'aside',
    { class: 'dx-rail', 'aria-label': 'On this page and related' },
    h(RailToc, { entries: props.entries, active: props.active }),
    data.rail ? h(RailCard, { product: data.rail }) : null,
    h(
      'ul',
      { class: 'dx-rlinks' },
      props.slug !== undefined ? h('li', null, h('a', { href: editUrlOf(props.slug), rel: 'noopener noreferrer' }, 'Edit this page')) : null,
      h('li', null, h('a', { href: '/docs/mcp', onClick: click('/docs/mcp') }, 'Ask your AI assistant (MCP)')),
      h('li', null, h('a', { href: '/benchmarks', onClick: click('/benchmarks') }, 'Benchmarks')),
    ),
  )
}

/**
 * One docs page in the reading column + right rail. The body is the compiled
 * Markdown (or the docs home); everything around it is the same on every
 * page: breadcrumbs, page actions, the title, the inline TOC below 1180px,
 * "helpful?", prev / next, and the rail (TOC, one product card, links).
 *
 * `title` renders as the page's h1 unless the body brings its own: a
 * product overview's pitch strip, or a Markdown `# Heading` at the top (the
 * stylesheet hides the generic title then, so a page always has one h1).
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
  const slots = useDocsData().slots
  const entries = tocEntries([...slots.before, ...props.headings, ...slots.after])
  const active = useScrollSpy(() => entries.map((h) => h.slug))
  const url = `${SITE_ORIGIN}${props.path}`
  let prose: HTMLElement | null = null
  // Heading anchors: a "#" link after each h2/h3 that has an id. Added once the
  // page is mounted (the compiled Markdown emits bare headings); the heading
  // text stays the heading's accessible name.
  onMount(() => {
    for (const h of prose?.querySelectorAll<HTMLElement>('h2[id], h3[id]') ?? []) {
      // Skip the selling slots' headings: a slot may still be hydrating (it
      // loads on demand), and an extra child would make it re-render.
      if (h.querySelector('.dx-anchor') || h.closest('.dx-slot')) continue
      const a = document.createElement('a')
      a.className = 'dx-anchor'
      a.href = `#${h.id}`
      a.setAttribute('aria-label', `Link to this section: ${h.textContent ?? ''}`)
      a.textContent = '#'
      h.append(a)
    }
  })
  // h() throughout: the generic title is a conditional child (#4385).
  return h(
    'div',
    { class: 'dx-page' },
    h(
      'div',
      { class: 'dx-article' },
      h(Breadcrumbs, { path: props.path, title: props.title }),
      h(PageActions, { title: props.title, url, slug: props.slug }),
      props.ownTitle
        ? null
        : h('header', { class: 'dx-head' }, h('h1', { class: 'dx-title' }, props.title), props.description ? h('p', { class: 'dx-desc' }, props.description) : null),
      h(InlineToc, { entries, active }),
      h(
        'div',
        {
          class: 'dx-prose',
          id: 'dx-article',
          tabIndex: -1,
          ref: (el: HTMLElement | null) => {
            prose = el
          },
        },
        props.children,
      ),
      h(Helpful, { title: props.title, url }),
      h(PrevNext, { path: props.path }),
    ),
    h(Rail, { entries, active, slug: props.slug }),
  )
}
