import { For, h, Show } from '@pyreon/core'
import { island } from '@pyreon/zero'
import type { BlogPost, BlogPostView } from '@pyreon/zero-content/blog'
import { shareTargets } from '@pyreon/zero-content/blog'
import { BLOG_COPY } from '../../site/content/channels'
import { el, focusRing, tone, txt, type LinkAttrs } from '../../site/kit/bases'
import { AutoGrid, Section, Wrap } from '../../site/kit/layout'
import { Eyebrow, Heading, Lede } from '../../site/kit/type'
import { breakpoints, font, layout, text, weight } from '../../site/theme'
import { PostCard, PostMetaLine, Stack, SubscribeBand, TagChips } from './parts'
import { PostProse } from './prose'

/**
 * `/blog/<slug>`, rendered by `@pyreon/zero-content/blog` through
 * `views.post`. Design: the canvas's `Blog post.html` — back link, tags and
 * meta, the title, the description as the lede, the byline; then the body in a
 * 68ch measure beside a sticky table of contents (from 992px); then share
 * links, the subscribe band and the posts to read next.
 *
 * The page is static HTML; the copy-link button, the code blocks' copy
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
    fontSize: text.ui.size,
    color: tone(m, 'mist'),
    textDecoration: 'none',
    borderRadius: 4,
    hover: { color: tone(m, 'text') },
    focus: focusRing(m),
  }))

const Byline = el
  .config({ name: 'BlogByline' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 10 })
  .theme((_t, m) => ({
    flexWrap: 'wrap',
    marginTop: 8,
    paddingTop: 16,
    paddingBottom: 16,
    borderTop: '1px solid',
    borderBottom: '1px solid',
    borderColor: tone(m, 'line'),
    fontFamily: font.sans,
    fontSize: text.ui.size,
    color: tone(m, 'mist'),
    extendCss: `& a { color: ${tone(m, 'text')}; text-decoration: underline; text-decoration-color: ${tone(m, 'accent')}; text-underline-offset: 3px; border-radius: 2px; } & a:focus-visible { outline: 2px solid ${tone(m, 'focus')}; outline-offset: 2px; }`,
  }))

const Body = el
  .config({ name: 'BlogPostBody' })
  .attrs({ block: true })
  .theme(() => ({
    display: 'grid',
    gap: 56,
    gridTemplateColumns: 'minmax(0, 1fr)',
    extendCss: `@media (min-width: ${breakpoints.lg}px) { grid-template-columns: 200px minmax(0, 1fr); }`,
  }))

const Toc = el
  .config({ name: 'BlogToc' })
  .attrs({ tag: 'nav', block: true, gap: 2 })
  .theme(() => ({
    display: 'none',
    extendCss: `@media (min-width: ${breakpoints.lg}px) { display: flex; position: sticky; top: ${layout.navTop + layout.navHeight + 32}px; align-self: start; max-height: calc(100vh - 140px); overflow-y: auto; }`,
  }))

const TocTitle = txt
  .config({ name: 'BlogTocTitle' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({
    margin: 0,
    marginBottom: 10,
    fontFamily: font.mono,
    fontSize: text.eyebrow.size,
    letterSpacing: text.eyebrow.tracking,
    textTransform: 'uppercase',
    color: tone(m, 'fog'),
  }))

const TocLink = el
  .config({ name: 'BlogTocLink' })
  .attrs<LinkAttrs>({ tag: 'a' })
  .theme((_t, m) => ({
    display: 'block',
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 12,
    borderLeft: '1px solid',
    borderColor: tone(m, 'line'),
    fontFamily: font.sans,
    fontSize: text.ui.size,
    lineHeight: 1.4,
    color: tone(m, 'mist'),
    textDecoration: 'none',
    hover: { color: tone(m, 'text') },
    focus: focusRing(m),
    extendCss: `&[aria-current] { color: ${tone(m, 'text')}; border-left-color: ${tone(m, 'accent')}; }`,
  }))

const EndRow = el
  .config({ name: 'BlogPostEnd' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 10 })
  .theme((_t, m) => ({ flexWrap: 'wrap', maxWidth: '68ch', marginTop: 40, paddingTop: 24, borderTop: '1px solid', borderColor: tone(m, 'line') }))

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
    borderRadius: 9999,
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

/** `"By {author}"` → `["By ", ""]`: the text around a placeholder that is filled with links. */
export function splitAt(template: string, placeholder: string): [string, string] {
  const i = template.indexOf(placeholder)
  if (i < 0) throw new Error(`[Pyreon] Content string "${template}" has no ${placeholder}.`)
  return [template.slice(0, i), template.slice(i + placeholder.length)]
}

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
              <span>
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
              </span>
              <PostMetaLine post={post} />
            </Byline>
          </Head>
        </Wrap>
      </Section>
      <Section size="tight">
        <Wrap>
          <Body>
            <Toc aria-label={copy.post.toc} data-blog-toc="">
              <Show when={() => toc.length > 0}>
                <TocTitle>{copy.post.toc}</TocTitle>
                <For each={toc} by={(x) => x.slug}>
                  {(x) => <TocLink href={`#${x.slug}`}>{x.text}</TocLink>}
                </For>
              </Show>
            </Toc>
            <div>
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
                <PostToolsIsland url={view.url} label={copy.post.copyLink} copied={copy.post.copied} />
              </EndRow>
            </div>
          </Body>
        </Wrap>
      </Section>
      <Section size="tight">
        <Wrap>
          <Stack>
            <SubscribeBand copy={copy} />
            <Show when={() => more.length > 0}>
              <Heading tag="h2" size="card">
                {copy.post.more}
              </Heading>
              <AutoGrid min={280} gap={14}>
                <For each={more} by={(x) => x.post.slug}>
                  {(x) => <PostCard post={x.post} label={label[x.kind]} />}
                </For>
              </AutoGrid>
            </Show>
          </Stack>
        </Wrap>
      </Section>
    </article>
  )
}
