import { Show } from '@pyreon/core'
import type { BlogListView, BlogPost } from '@pyreon/zero-content/blog'
import planned from 'virtual:pyreon-blog-planned'
import { BLOG_COPY, fill } from '../../site/content/channels'
import { el, tone } from '../../site/kit/bases'
import { GlowCard } from '../../site/kit/cards'
import { Section, Wrap } from '../../site/kit/layout'
import { Eyebrow, Heading, Lede, renderInline } from '../../site/kit/type'
import { breakpoints, radius } from '../../site/theme'
import { coverVariants } from '../cover'
import { upNext } from '../planned'
import { Actions, CardMeta, ListHead, Pager, PlannedGrid, PostGrid, ReadMore, Stack, SubscribeBand, TagChips } from './parts'

/**
 * `/blog`, `/blog/page/<n>`, `/blog/tags/<tag>` and its pages, rendered by
 * `@pyreon/zero-content/blog` through `views.index` / `views.tag`: the blog
 * computes the page (published posts only, pagination, 404s, head tags), this
 * draws it in the site's kit. Design: the canvas's `Blog.html` — hero with the
 * tag filter, the newest post as a featured card with its cover, the rest as
 * a card grid, then "Up next" (the scheduled posts, page 1 of the index only)
 * and the "Get new posts" strip.
 *
 * Before the first post's date the index has no published post: it shows the
 * hero, "Up next" and the strip, and the first build on or after a post's date
 * moves it from "Up next" to the list.
 */

const Hero = el.config({ name: 'BlogHero' }).attrs({ block: true, contentAlignX: 'block', gap: 22 }).theme(() => ({ maxWidth: 860 }))

const FeaturedGrid = el
  .config({ name: 'BlogFeatured' })
  .attrs({ block: true })
  .theme(() => ({
    display: 'grid',
    gap: 36,
    alignItems: 'center',
    gridTemplateColumns: 'minmax(0, 1fr)',
    extendCss: `@media (min-width: ${breakpoints.lg}px) { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); }`,
  }))

const FeaturedText = el.config({ name: 'BlogFeaturedText' }).attrs({ block: true, contentAlignX: 'block', gap: 14 }).theme(() => ({ minWidth: 0 }))

const CoverFrame = el
  .config({ name: 'BlogCover' })
  .attrs({ block: true, contentAlignX: 'block' })
  .theme((_t, m) => ({
    borderRadius: radius.pane,
    overflow: 'hidden',
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'well'),
    extendCss: '& picture { display: block; } & img { display: block; width: 100%; height: auto; }',
  }))

/** The cover of the featured post: WebP at two widths, the PNG as fallback. */
function Cover(props: { post: BlogPost }) {
  const cover = props.post.cover
  if (!cover) return null
  const variants = coverVariants(cover.src)
  return (
    <CoverFrame>
      <picture>
        {variants ? (
          <source type="image/webp" srcSet={variants.map((v) => `${v.src} ${v.width}w`).join(', ')} sizes={`(min-width: ${breakpoints.lg}px) 560px, 100vw`} />
        ) : null}
        {/* The cover repeats the title as an image: decorative here, the title is the card's heading. */}
        <img src={cover.src} alt="" width={1600} height={840} decoding="async" />
      </picture>
    </CoverFrame>
  )
}

/** The newest post, large: text left, cover right (stacked below 992px). */
function Featured(props: { post: BlogPost; label: string; readPost: string }) {
  const p = props.post
  return (
    <GlowCard href={p.url} state="hot">
      <FeaturedGrid data-featured="">
        <FeaturedText>
          <CardMeta post={p} label={props.label} />
          <Heading tag="h2" size="section">
            {p.title}
          </Heading>
          <Lede size="section">{p.description}</Lede>
          <ReadMore>{props.readPost}</ReadMore>
        </FeaturedText>
        <Cover post={p} />
      </FeaturedGrid>
    </GlowCard>
  )
}

function Empty() {
  const e = BLOG_COPY.empty
  return (
    <GlowCard>
      <Heading tag="h2" size="card">
        {e.title}
      </Heading>
      <Lede size="card">{renderInline(e.text)}</Lede>
    </GlowCard>
  )
}

export function BlogList(view: BlogListView) {
  const copy = BLOG_COPY
  const tag = view.tag
  const first = view.kind === 'index' && view.page === 1
  const featured = first ? view.posts[0] : undefined
  const rest = featured ? view.posts.slice(1) : view.posts
  const next = first ? upNext(planned, view.posts.map((p) => p.title)) : []
  const posts = tag ? copy.tag.posts[tag.count === 1 ? 0 : 1] : ''
  const allHref = view.config.basePath || '/'

  return (
    <>
      <Section size="hero">
        <Wrap>
          <Hero>
            <Eyebrow>{tag ? copy.tag.eyebrow : copy.hero.eyebrow}</Eyebrow>
            <Heading tag="h1" size="hero">
              {tag ? fill(copy.tag.title, { tag: tag.name }) : copy.hero.title}
            </Heading>
            <Lede size="hero">
              {tag ? fill(copy.tag.lede, { tag: tag.name, count: tag.count, posts }) : renderInline(copy.hero.lede)}
            </Lede>
            <Actions items={copy.hero.actions} solidFirst />
            <Show when={() => view.tags.length > 0}>
              <TagChips label={copy.tagsLabel} all={{ label: copy.allTags, href: allHref }} tags={view.tags} current={tag} />
            </Show>
          </Hero>
        </Wrap>
      </Section>
      <Section size="tight">
        <Wrap>
          <Stack>
            {view.total === 0 && next.length === 0 ? <Empty /> : null}
            {featured ? <Featured post={featured} label={copy.latest} readPost={copy.readPost} /> : null}
            {rest.length > 0 ? (
              <>
                {featured ? <ListHead title={copy.list.title} text={copy.list.text} /> : null}
                <PostGrid posts={rest} level={featured ? 'h3' : 'h2'} />
              </>
            ) : null}
            <Pager copy={copy} page={view.page} pageCount={view.pageCount} href={view.href} />
            {next.length > 0 ? (
              <section aria-labelledby="up-next" data-up-next="">
                <Stack>
                  <ListHead id="up-next" title={copy.upNext.title} text={copy.upNext.text} />
                  <PlannedGrid posts={next} planned={copy.upNext.planned} />
                </Stack>
              </section>
            ) : null}
          </Stack>
        </Wrap>
      </Section>
      <Section size="tight">
        <Wrap>
          <SubscribeBand copy={copy} />
        </Wrap>
      </Section>
    </>
  )
}
