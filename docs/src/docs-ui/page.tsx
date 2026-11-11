import type { VNodeChild } from '@pyreon/core'
import { onMount, Show } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { Glyph } from '../site/kit/cards'
import { useLinkClick } from '../site/kit/link'
import { renderInline } from '../site/kit/type'
import { editUrlOf, PageActions, SITE_ORIGIN } from './actions'
import { useDocsData, type ProductSummary } from './data'
import { prevNextOf, trailOf, type PageLink } from './nav'
import { InlineToc, RailToc, tocEntries, useScrollSpy, type TocHeading } from './toc'

export function Breadcrumbs(props: { path: string; title: string }) {
  const click = useLinkClick()
  const t = trailOf(props.path)
  return (
    <nav class="dx-crumbs" aria-label="Breadcrumb">
      <ol>
        <li>
          <a href="/docs" onClick={click('/docs')}>
            Docs
          </a>
        </li>
        {t && t.item.href !== '/docs' ? (
          <li>
            <span>{t.group.group}</span>
          </li>
        ) : null}
        {t?.parent ? (
          <li>
            <a href={t.parent.href} onClick={click(t.parent.href)}>
              {t.parent.title}
            </a>
          </li>
        ) : null}
        <li>
          <span aria-current="page">{t?.item.title ?? props.title}</span>
        </li>
      </ol>
    </nav>
  )
}

/** The rail's ONE product card: the most relevant other product, with its proof line when it has one. */
export function RailCard(props: { product: ProductSummary }) {
  const click = useLinkClick()
  const p = props.product
  return (
    <a class="dx-rcard" href={p.href} onClick={click(p.href)}>
      <span class="dx-tile">
        <Glyph id={p.id} size={22} />
      </span>
      <Show when={() => p.status !== undefined}>
        <span class="dx-bdg dx-bdg--preview">{p.status}</span>
      </Show>
      <b>{p.name}</b>
      <span class="dx-rcard__text">{p.proof ? `${p.proof.stat} ${p.proof.label}` : renderInline(p.pitch)}</span>
      <Show when={() => p.proof !== undefined}>
        <span class="dx-rcard__cond">{p.proof?.condition}</span>
      </Show>
      <em>Explore {p.name} →</em>
    </a>
  )
}

function PrevNext(props: { path: string }) {
  const click = useLinkClick()
  const { prev, next } = prevNextOf(props.path)
  const card = (l: PageLink, dir: 'prev' | 'next') => (
    <a class={`dx-pn__link dx-pn__link--${dir}`} href={l.href} onClick={click(l.href)} rel={dir}>
      <small>{dir === 'prev' ? 'Previous' : 'Next'}</small>
      {dir === 'prev' ? `← ${l.title}` : `${l.title} →`}
    </a>
  )
  return (
    <nav class="dx-pn" aria-label="Previous and next page">
      {prev ? card(prev, 'prev') : <span />}
      {next ? card(next, 'next') : <span />}
    </nav>
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
  return (
    <aside class="dx-rail" aria-label="On this page and related">
      <RailToc entries={props.entries} active={props.active} />
      {data.rail ? <RailCard product={data.rail} /> : null}
      <ul class="dx-rlinks">
        {props.slug !== undefined ? (
          <li>
            <a href={editUrlOf(props.slug)} rel="noopener noreferrer">
              Edit this page
            </a>
          </li>
        ) : null}
        <li>
          <a href="/docs/mcp" onClick={click('/docs/mcp')}>
            Ask your AI assistant (MCP)
          </a>
        </li>
        <li>
          <a href="/benchmarks" onClick={click('/benchmarks')}>
            Benchmarks
          </a>
        </li>
      </ul>
    </aside>
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
      if (h.querySelector('.dx-anchor')) continue
      const a = document.createElement('a')
      a.className = 'dx-anchor'
      a.href = `#${h.id}`
      a.setAttribute('aria-label', `Link to this section: ${h.textContent ?? ''}`)
      a.textContent = '#'
      h.append(a)
    }
  })
  return (
    <div class="dx-page">
      <div class="dx-article">
        <Breadcrumbs path={props.path} title={props.title} />
        <PageActions title={props.title} url={url} slug={props.slug} />
        {props.ownTitle ? null : (
          <header class="dx-head">
            <h1 class="dx-title">{props.title}</h1>
            {props.description ? <p class="dx-desc">{props.description}</p> : null}
          </header>
        )}
        <InlineToc entries={entries} active={active} />
        <div
          class="dx-prose"
          id="dx-article"
          tabIndex={-1}
          ref={(el: HTMLElement | null) => {
            prose = el
          }}
        >
          {props.children}
        </div>
        <Helpful title={props.title} url={url} />
        <PrevNext path={props.path} />
      </div>
      <Rail entries={entries} active={active} slug={props.slug} />
    </div>
  )
}
