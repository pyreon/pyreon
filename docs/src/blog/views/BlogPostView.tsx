import { For, h, Show } from '@pyreon/core'
import { island } from '@pyreon/zero'
import type { BlogPost, BlogPostView } from '@pyreon/zero-content/blog'
import { shareTargets } from '@pyreon/zero-content/blog'
import { BLOG_COPY } from '../../site/content/channels'
import { el, focusRing, tone, txt, type LinkAttrs } from '../../site/kit/bases'
import { Glyph } from '../../site/kit/cards'
import { C } from '../../site/kit/classes'
import { Section, Wrap } from '../../site/kit/layout'
import { Eyebrow, Heading, Lede } from '../../site/kit/type'
import { breakpoints, font, layout, radius, text, weight } from '../../site/theme'
import { EndCard, PostMetaLine, splitAt, SubscribeBand, TagChips } from './parts'
import { PostProse } from './prose'

export { splitAt }

/**
 * `/blog/<slug>`, rendered by `@pyreon/zero-content/blog` through
 * `views.post`. Design: the canvas's `Blog post.html` — back link, tag chips,
 * the title, the description as the lede, the byline; then the body in a 68ch
 * measure beside a sticky "In this post" rail (table of contents and the
 * copy-link button, from 992px); then share links, the closing card, the posts
 * to read next and the subscribe strip.
 *
 * The page is static HTML; the copy-link buttons, the code blocks' copy
 * buttons and the table of contents' "you are here" are one small island.
 */
const PostToolsIsland = island(() => import('../PostTools'), { name: 'BlogPostTools', hydrate: 'idle' })

const Head = el.config({ name: 'BlogPostHead' }).attrs({ block: true, contentAlignX: 'block', gap: 20 }).theme(() => ({ maxWidth: 900 }))

const BackLink = el
  .config({ name: 'BlogBack' })
  .attrs<LinkAttrs>({ tag: 'a' })
  .theme((_t, m) => ({
    alignSelf: 'flex-start',
    fontFamily: font.mono,
    fontSize: text.caption.size,
    color: tone(m, 'mist'),
    textDecoration: 'none',
    borderRadius: 4,
    hover: { color: tone(m, 'text') },
    focus: focusRing(m),
  }))

const Byline = el
  .config({ name: 'BlogByline' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 12 })
  .theme((_t, m) => ({
    marginTop: 10,
    paddingTop: 16,
    paddingBottom: 16,
    borderTop: '1px solid',
    borderBottom: '1px solid',
    borderColor: tone(m, 'line'),
    color: tone(m, 'text'),
    extendCss: `& > svg { flex-shrink: 0; }`,
  }))

const BylineText = el.config({ name: 'BlogBylineText' }).attrs({ block: true, gap: 2 }).theme(() => ({ minWidth: 0 }))

const Author = txt
  .config({ name: 'BlogAuthor' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({
    fontFamily: font.sans,
    fontSize: text.body.size,
    fontWeight: weight.medium,
    color: tone(m, 'text'),
    extendCss: `& a { color: inherit; text-decoration: underline; text-decoration-color: ${tone(m, 'accent')}; text-underline-offset: 3px; border-radius: 2px; } & a:focus-visible { outline: 2px solid ${tone(m, 'focus')}; outline-offset: 2px; }`,
  }))

const Body = el
  .config({ name: 'BlogPostBody' })
  .attrs({ block: true })
  .theme(() => ({
    display: 'grid',
    gap: 60,
    gridTemplateColumns: 'minmax(0, 1fr)',
    extendCss: `@media (min-width: ${breakpoints.lg}px) { grid-template-columns: 220px minmax(0, 1fr); }`,
  }))

/** The "In this post" rail: sticky beside the body from 992px, hidden below (the body's headings are the outline there). */
const Rail = el
  .config({ name: 'BlogRail' })
  .attrs({ block: true, gap: 2 })
  .theme(() => ({
    display: 'none',
    extendCss: `@media (min-width: ${breakpoints.lg}px) { display: flex; position: sticky; top: ${layout.navTop + layout.navHeight + 32}px; align-self: start; max-height: calc(100vh - 140px); overflow-y: auto; }`,
  }))

const TocTitle = txt
  .config({ name: 'BlogTocTitle' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({
    margin: 0,
    marginBottom: 8,
    fontFamily: font.mono,
    fontSize: text.eyebrowTight.size,
    letterSpacing: text.eyebrowTight.tracking,
    fontWeight: weight.regular,
    textTransform: 'uppercase',
    color: tone(m, 'fog'),
  }))

const TocList = el.config({ name: 'BlogTocList' }).attrs({ tag: 'ul', block: true, gap: 2 }).theme(() => ({ listStyle: 'none', margin: 0, padding: 0 }))

const TocLink = el
  .config({ name: 'BlogTocLink' })
  .attrs<LinkAttrs>({ tag: 'a' })
  .theme((_t, m) => ({
    display: 'block',
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: 12,
    borderLeft: '1px solid',
    borderColor: tone(m, 'line'),
    fontFamily: font.sans,
    fontSize: text.ui.size,
    lineHeight: 1.4,
    color: tone(m, 'mist'),
    textDecoration: 'none',
    hover: { color: tone(m, 'text'), borderLeftColor: tone(m, 'lineHover') },
    focus: focusRing(m),
    extendCss: `&[aria-current] { color: ${tone(m, 'strong')}; border-left-color: ${tone(m, 'accent')}; }`,
  }))

const RailTools = el.config({ name: 'BlogRailTools' }).attrs({ block: true }).theme(() => ({ marginTop: 18 }))

const Main = el.config({ name: 'BlogPostMain' }).attrs({ block: true, contentAlignX: 'block' }).theme(() => ({ minWidth: 0, maxWidth: 760 }))

const EndRow = el
  .config({ name: 'BlogPostEnd' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 10 })
  .theme((_t, m) => ({ flexWrap: 'wrap', marginTop: 40, marginBottom: 26, paddingTop: 24, borderTop: '1px solid', borderColor: tone(m, 'line') }))

const ShareLabel = txt
  .config({ name: 'BlogShareLabel' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ fontFamily: font.mono, fontSize: text.mono.size, color: tone(m, 'fog'), marginRight: 4 }))

const ShareLink = el
  .config({ name: 'BlogShareLink' })
  .attrs<LinkAttrs>({ tag: 'a', contentDirection: 'inline', contentAlignY: 'center' })
  .theme((_t, m) => ({
    height: 38,
    paddingLeft: 16,
    paddingRight: 16,
    borderRadius: radius.pill,
    border: '1px solid',
    borderColor: tone(m, 'line2'),
    fontFamily: font.sans,
    fontSize: text.ui.size,
    fontWeight: weight.medium,
    color: tone(m, 'text'),
    textDecoration: 'none',
    hover: { borderColor: tone(m, 'lineHover') },
    focus: focusRing(m),
  }))

/** The end row's copy-link button: below 992px only (the rail has one above). The island wires it. */
const NarrowOnly = el
  .config({ name: 'BlogNarrowOnly' })
  .attrs({ tag: 'span', contentDirection: 'inline' })
  .theme(() => ({ extendCss: `@media (min-width: ${breakpoints.lg}px) { display: none; }` }))

const NextGrid = el
  .config({ name: 'BlogNext' })
  .attrs({ tag: 'ul', block: true })
  .theme(() => ({
    display: 'grid',
    gap: 12,
    listStyle: 'none',
    margin: 0,
    padding: 0,
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))',
  }))

const NextLink = el
  .config({ name: 'BlogNextLink' })
  .attrs<LinkAttrs>({ tag: 'a', block: true, gap: 4 })
  .theme((_t, m) => ({
    height: '100%',
    padding: 18,
    borderRadius: radius.pane,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'card'),
    color: tone(m, 'text'),
    textDecoration: 'none',
    hover: { borderColor: tone(m, 'lineHover') },
    focus: focusRing(m),
  }))

const NextLabel = txt
  .config({ name: 'BlogNextLabel' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({
    fontFamily: font.mono,
    fontSize: text.eyebrowTight.size,
    letterSpacing: '.14em',
    textTransform: 'uppercase',
    color: tone(m, 'fog'),
  }))

const NextTitle = txt
  .config({ name: 'BlogNextTitle' })
  .attrs({ tag: 'h3' })
  .theme((_t, m) => ({ margin: 0, fontFamily: font.sans, fontSize: 16, lineHeight: 1.35, fontWeight: weight.medium, color: tone(m, 'text') }))

const MoreHead = txt
  .config({ name: 'BlogMoreHead' })
  .attrs({ tag: 'h2' })
  .theme((_t, m) => ({ margin: 0, marginTop: 34, marginBottom: 14, fontFamily: font.sans, fontSize: text.step.size, lineHeight: text.step.lineHeight, fontWeight: weight.medium, color: tone(m, 'text') }))

/** The next post first, then the previous one, then related posts, without repeats. */
export function readNext(view: Pick<BlogPostView, 'previous' | 'next' | 'related'>, max = 3): { post: BlogPost; kind: 'next' | 'previous' | 'related' }[] {
  const out: { post: BlogPost; kind: 'next' | 'previous' | 'related' }[] = []
  const add = (post: BlogPost | undefined, kind: 'next' | 'previous' | 'related') => {
    if (post && out.length < max && !out.some((x) => x.post.slug === post.slug)) out.push({ post, kind })
  }
  add(view.next, 'next')
  add(view.previous, 'previous')
  for (const p of view.related) add(p, 'related')
  return out
}

export function BlogPostPage(view: BlogPostView) {
  const copy = BLOG_COPY
  const post = view.post
  const toc = view.headings.filter((x) => x.level === 2)
  const more = readNext(view)
  const label = { next: copy.post.next, previous: copy.post.previous, related: copy.post.related }
  const back = view.config.basePath || '/'
  const byline = splitAt(copy.post.byline, '{author}')

  return (
    <article>
      <Section size="hero">
        <Wrap>
          <Head>
            <BackLink href={back}>{copy.post.back}</BackLink>
            <Show when={() => view.status !== undefined}>
              <Eyebrow state="accent">{view.status ?? ''}</Eyebrow>
            </Show>
            <Show when={() => post.tags.length > 0}>
              <TagChips label={copy.tagsLabel} tags={post.tags} />
            </Show>
            <Heading tag="h1" size="hero">
              {post.title}
            </Heading>
            <Lede size="hero">{post.description}</Lede>
            <Byline>
              <Glyph id="pyreon" size={34} />
              <BylineText>
                <Author>
                  {byline[0]}
                  <For each={post.authors.map((a, i) => ({ a, i }))} by={(x) => x.a.name}>
                    {(x) => (
                      <>
                        {x.i > 0 ? ', ' : ''}
                        {x.a.url ? (
                          <a href={x.a.url} rel="author">
                            {x.a.name}
                          </a>
                        ) : (
                          x.a.name
                        )}
                      </>
                    )}
                  </For>
                  {byline[1]}
                </Author>
                <PostMetaLine post={post} />
              </BylineText>
            </Byline>
          </Head>
        </Wrap>
      </Section>
      <Section size="tight">
        <Wrap>
          <Body>
            <Rail>
              <Show when={() => toc.length > 0}>
                <nav aria-label={copy.post.toc} data-blog-toc="">
                  <TocTitle>{copy.post.toc}</TocTitle>
                  <TocList>
                    <For each={toc} by={(x) => x.slug}>
                      {(x) => (
                        <li>
                          <TocLink href={`#${x.slug}`}>{x.text}</TocLink>
                        </li>
                      )}
                    </For>
                  </TocList>
                </nav>
              </Show>
              <RailTools>
                <PostToolsIsland url={view.url} label={copy.post.copyLink} copied={copy.post.copied} />
              </RailTools>
            </Rail>
            <Main>
              <PostProse data-blog-body="">{h(view.Content, null)}</PostProse>
              <EndRow>
                <ShareLabel>{copy.post.share}</ShareLabel>
                <For each={shareTargets(view.url, post.title)} by={(t) => t.network}>
                  {(t) => (
                    <ShareLink href={t.href} target="_blank" rel="noopener noreferrer">
                      {t.label}
                    </ShareLink>
                  )}
                </For>
                <NarrowOnly>
                  <button type="button" class={C.pill} data-copy-link="">
                    {copy.post.copyLink}
                  </button>
                </NarrowOnly>
              </EndRow>
              <EndCard title={copy.post.cta.title} text={copy.post.cta.text} link={copy.post.cta.link} />
              <Show when={() => more.length > 0}>
                <nav aria-labelledby="keep-reading">
                  <MoreHead id="keep-reading">{copy.post.more}</MoreHead>
                  <NextGrid>
                    <For each={more} by={(x) => x.post.slug}>
                      {(x) => (
                        <li>
                          <NextLink href={x.post.url}>
                            <NextLabel>{label[x.kind]}</NextLabel>
                            <NextTitle>{x.post.title}</NextTitle>
                          </NextLink>
                        </li>
                      )}
                    </For>
                  </NextGrid>
                </nav>
              </Show>
            </Main>
          </Body>
        </Wrap>
      </Section>
      <Section size="tight">
        <Wrap>
          <SubscribeBand copy={copy} />
        </Wrap>
      </Section>
    </article>
  )
}
