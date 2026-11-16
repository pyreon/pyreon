import { For, Show } from '@pyreon/core'
import type { BlogPost, BlogTag, BlogTagCount } from '@pyreon/zero-content/blog'
import { formatPostDate, isoDay } from '@pyreon/zero-content/blog'
import { fill } from '../../site/content/channels'
import type { BlogChannel, Cta } from '../../site/content/types-site'
import { el, focusRing, tone, txt, type LinkAttrs } from '../../site/kit/bases'
import { GlowCard } from '../../site/kit/cards'
import { Pill } from '../../site/kit/controls'
import { AutoGrid } from '../../site/kit/layout'
import { Lede, renderInline } from '../../site/kit/type'
import { font, motion, radius, text, weight } from '../../site/theme'
import type { PlannedPost } from '../planned'

/**
 * Pieces the blog's index, tag and post views share: chips and meta lines,
 * the tag filter, the post and planned-post cards, the pager, a section head
 * and the subscribe strip. Everything here renders on the server only (blog
 * pages are static HTML). Design: the canvas's `Blog.html` / `Blog post.html`.
 */

/** Dates print in this locale, always in UTC (the same day on every machine). */
export const BLOG_LOCALE = 'en-GB'

const MetaRow = el
  .config({ name: 'BlogMeta' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 10 })
  .theme((_t, m) => ({
    margin: 0,
    flexWrap: 'wrap',
    fontFamily: font.mono,
    fontSize: text.mono.size,
    lineHeight: 1.6,
    color: tone(m, 'fog'),
  }))

const Dot = txt.config({ name: 'BlogMetaDot' }).attrs({ tag: 'span', 'aria-hidden': 'true' })

/** `.chipb` — a small uppercase mono label. state: default | accent (a post's topic) | warn (planned). */
export const PostChip = txt
  .config({ name: 'BlogChip' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({
    display: 'inline-block',
    paddingTop: 5,
    paddingBottom: 4,
    paddingLeft: 10,
    paddingRight: 10,
    borderRadius: radius.pill,
    border: '1px solid',
    borderColor: tone(m, 'line2'),
    fontFamily: font.mono,
    fontSize: text.eyebrowTight.size,
    letterSpacing: '.12em',
    lineHeight: 1.3,
    textTransform: 'uppercase',
    color: tone(m, 'mist'),
  }))
  .states((_t, m) => ({
    default: {},
    accent: { color: tone(m, 'accent'), borderColor: tone(m, 'currentBorder'), backgroundColor: tone(m, 'glow') },
    warn: { color: tone(m, 'warn'), borderColor: tone(m, 'line2') },
  }))

/** `16 November 2026 · 7 min read` (plus the last revision when there is one). */
export function PostMetaLine(props: { post: BlogPost }) {
  const p = props.post
  return (
    <MetaRow>
      <time datetime={isoDay(p.date)}>{formatPostDate(p.date, BLOG_LOCALE)}</time>
      <Dot>·</Dot>
      <span>{`${p.readingMinutes} min read`}</span>
      <Show when={() => p.updated !== undefined}>
        <Dot>·</Dot>
        <span>
          {'Updated '}
          <time datetime={p.updated ? isoDay(p.updated) : ''}>{p.updated ? formatPostDate(p.updated, BLOG_LOCALE) : ''}</time>
        </span>
      </Show>
    </MetaRow>
  )
}

/** A card's meta row: an optional label chip, the first tag as a chip, the date and the reading time. */
export function CardMeta(props: { post: BlogPost; label?: string | undefined }) {
  const p = props.post
  const topic = p.tags[0]
  return (
    <MetaRow>
      {props.label ? <PostChip state="accent">{props.label}</PostChip> : null}
      {topic ? <PostChip state={props.label ? 'default' : 'accent'}>{topic.name}</PostChip> : null}
      <time datetime={isoDay(p.date)}>{formatPostDate(p.date, BLOG_LOCALE)}</time>
      <Dot>·</Dot>
      <span>{`${p.readingMinutes} min read`}</span>
    </MetaRow>
  )
}

const TagRow = el
  .config({ name: 'BlogTagRow' })
  .attrs({ tag: 'ul', block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 6 })
  .theme(() => ({ flexWrap: 'wrap', listStyle: 'none', margin: 0, padding: 0 }))

const TagLink = el
  .config({ name: 'BlogTag' })
  .attrs<LinkAttrs>({ tag: 'a', contentDirection: 'inline', contentAlignY: 'center', gap: 6 })
  .theme((_t, m) => ({
    minHeight: 32,
    paddingLeft: 14,
    paddingRight: 14,
    borderRadius: radius.pill,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    color: tone(m, 'mist'),
    fontFamily: font.mono,
    fontSize: text.mono.size,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    transition: `border-color ${motion.hover}, color ${motion.hover}`,
    hover: { borderColor: tone(m, 'lineHover'), color: tone(m, 'text') },
    focus: focusRing(m),
    extendCss: `&[aria-current] { border-color: ${tone(m, 'accent')}; background-color: ${tone(m, 'glow')}; color: ${tone(m, 'strong')}; }`,
  }))

const TagCount = txt
  .config({ name: 'BlogTagCount' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ color: tone(m, 'fog') }))

/**
 * The tag filter: an "every post" chip, then the most-used tags, each with its
 * post count; the current one carries `aria-current="page"`. A tag page always
 * shows its own tag, even when it is not among the most used. Plain links: a
 * tag is a page of its own (prerendered, in the sitemap), so filtering costs
 * no JavaScript and works before anything loads.
 */
export function TagChips(props: {
  label: string
  tags: readonly (BlogTag | BlogTagCount)[]
  all?: { label: string; href: string } | undefined
  current?: BlogTagCount | undefined
}) {
  const all = props.all
  const current = props.current
  const tags = current && !props.tags.some((t) => t.slug === current.slug) ? [...props.tags, current] : props.tags
  return (
    <nav aria-label={props.label}>
      <TagRow>
        {all ? (
          <li>
            <TagLink href={all.href} aria-current={current === undefined ? 'page' : undefined}>
              {all.label}
            </TagLink>
          </li>
        ) : null}
        <For each={tags} by={(t) => t.slug}>
          {(t) => (
            <li>
              <TagLink href={t.url} rel="tag" aria-current={current?.slug === t.slug ? 'page' : undefined}>
                {`#${t.name}`}
                {'count' in t ? <TagCount>{String(t.count)}</TagCount> : null}
              </TagLink>
            </li>
          )}
        </For>
      </TagRow>
    </nav>
  )
}

/** "Read the post →" inside a card that is one link. */
export const ReadMore = txt
  .config({ name: 'BlogReadMore' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ fontFamily: font.mono, fontSize: text.ui.size, color: tone(m, 'accent'), marginTop: 6 }))

const CardTitle = txt
  .config({ name: 'BlogCardTitle' })
  .attrs({ tag: 'h3' })
  .theme((_t, m) => ({
    margin: 0,
    marginTop: 6,
    fontFamily: font.sans,
    fontSize: 21,
    lineHeight: 1.2,
    letterSpacing: '-.02em',
    fontWeight: weight.medium,
    color: tone(m, 'strong'),
    textWrap: 'balance',
    overflowWrap: 'break-word',
  }))

/** One published post in a grid: the whole card is the link. */
export function PostCard(props: { post: BlogPost; level?: 'h2' | 'h3' | undefined }) {
  const p = props.post
  return (
    <GlowCard href={p.url} padding="compact">
      <CardMeta post={p} />
      <CardTitle tag={props.level ?? 'h3'}>{p.title}</CardTitle>
      <Lede size="small">{p.description}</Lede>
    </GlowCard>
  )
}

/** The posts of a listing page as a card grid (three columns on a wide screen). */
export function PostGrid(props: { posts: readonly BlogPost[]; level?: 'h2' | 'h3' | undefined }) {
  return (
    <AutoGrid min={300} gap={14} tag="ol">
      <For each={props.posts} by={(p) => p.slug}>
        {(p) => (
          <li>
            <PostCard post={p} level={props.level} />
          </li>
        )}
      </For>
    </AutoGrid>
  )
}

/**
 * A scheduled post: written, dated, not out yet. Not a link (the post has no
 * page until its date); the chip says when it goes live.
 */
export function PlannedCard(props: { post: PlannedPost; planned: string }) {
  const p = props.post
  const date = new Date(`${p.date}T00:00:00Z`)
  const topic = p.tags[0]
  const [before, after] = splitAt(props.planned, '{date}')
  return (
    <GlowCard padding="compact">
      <MetaRow data-planned="">
        {topic ? <PostChip>{topic}</PostChip> : null}
        <PostChip state="warn">
          {before}
          <time datetime={p.date}>{formatPostDate(date, BLOG_LOCALE)}</time>
          {after}
        </PostChip>
        <span>{`${p.readingMinutes} min read`}</span>
      </MetaRow>
      <CardTitle>{p.title}</CardTitle>
      <Lede size="small">{p.description}</Lede>
    </GlowCard>
  )
}

/** The scheduled posts, soonest first. */
export function PlannedGrid(props: { posts: readonly PlannedPost[]; planned: string }) {
  return (
    <AutoGrid min={300} gap={14} tag="ul">
      <For each={props.posts} by={(p) => `${p.date}:${p.title}`}>
        {(p) => (
          <li>
            <PlannedCard post={p} planned={props.planned} />
          </li>
        )}
      </For>
    </AutoGrid>
  )
}

/** `"Planned · {date}"` → `["Planned · ", ""]`: the text around a placeholder that is filled with markup. */
export function splitAt(template: string, placeholder: string): [string, string] {
  const i = template.indexOf(placeholder)
  if (i < 0) throw new Error(`[Pyreon] Content string "${template}" has no ${placeholder}.`)
  return [template.slice(0, i), template.slice(i + placeholder.length)]
}

const HeadRow = el
  .config({ name: 'BlogListHead' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'bottom' })
  .theme(() => ({ flexWrap: 'wrap', columnGap: 16, rowGap: 6, marginTop: 50, marginBottom: 4, alignItems: 'baseline' }))

const HeadTitle = txt
  .config({ name: 'BlogListHeadTitle' })
  .attrs({ tag: 'h2' })
  .theme((_t, m) => ({
    margin: 0,
    fontFamily: font.sans,
    fontSize: 'clamp(26px, 3vw, 38px)',
    lineHeight: 1.1,
    letterSpacing: '-.03em',
    fontWeight: weight.medium,
    color: tone(m, 'text'),
  }))

const HeadText = txt
  .config({ name: 'BlogListHeadText' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, fontFamily: font.sans, fontSize: text.small.size, lineHeight: text.small.lineHeight, color: tone(m, 'fog') }))

/** `.b-h` — a list's h2 with a short dim line beside it. */
export function ListHead(props: { title: string; text: string; id?: string | undefined }) {
  return (
    <HeadRow>
      <HeadTitle id={props.id}>{props.title}</HeadTitle>
      <HeadText>{props.text}</HeadText>
    </HeadRow>
  )
}

const PagerRow = el
  .config({ name: 'BlogPager' })
  .attrs({ tag: 'nav', block: true, contentDirection: 'inline', contentAlignX: 'spaceBetween', contentAlignY: 'center', gap: 12 })
  .theme(() => ({ flexWrap: 'wrap', marginTop: 36 }))

const PagerStatus = txt
  .config({ name: 'BlogPagerStatus' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ fontFamily: font.mono, fontSize: text.mono.size, color: tone(m, 'fog') }))

/** "← Newer posts · Page 2 of 3 · Older posts →". Nothing for one page. */
export function Pager(props: { copy: BlogChannel; page: number; pageCount: number; href: (page: number) => string }) {
  if (props.pageCount <= 1) return null
  return (
    <PagerRow aria-label={props.copy.pager}>
      <span>{props.page > 1 ? <Pill href={props.href(props.page - 1)}>{props.copy.newer}</Pill> : null}</span>
      <PagerStatus aria-current="page">{fill(props.copy.page, { page: props.page, pages: props.pageCount })}</PagerStatus>
      <span>{props.page < props.pageCount ? <Pill href={props.href(props.page + 1)}>{props.copy.older}</Pill> : null}</span>
    </PagerRow>
  )
}

const ActionRow = el
  .config({ name: 'BlogActions' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 10 })
  .theme(() => ({ flexWrap: 'wrap' }))

/** A row of pill links from content `Cta`s; the first is solid when `solidFirst`. */
export function Actions(props: { items: readonly Cta[]; solidFirst?: boolean | undefined }) {
  return (
    <ActionRow>
      <For each={props.items.map((c, i) => ({ c, i }))} by={(x) => x.i}>
        {(x) => (
          <Pill href={x.c.href ?? '/'} variant={props.solidFirst && x.i === 0 ? 'solid' : 'ghost'}>
            {x.c.label}
          </Pill>
        )}
      </For>
    </ActionRow>
  )
}

const Strip = el
  .config({ name: 'BlogStrip' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 12 })
  .theme((_t, m) => ({
    flexWrap: 'wrap',
    padding: 22,
    borderRadius: radius.pane,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'card'),
  }))
  .states((_t, m) => ({
    default: {},
    hot: {
      borderColor: tone(m, 'currentBorder'),
      backgroundImage: `radial-gradient(100% 120% at 0% 0%, ${tone(m, 'glow')}, transparent 60%)`,
    },
  }))

const StripText = el.config({ name: 'BlogStripText' }).attrs({ gap: 4 }).theme(() => ({ flex: '1 1 240px', minWidth: 0 }))

const StripActions = el
  .config({ name: 'BlogStripActions' })
  .attrs({ contentDirection: 'inline', contentAlignY: 'center', gap: 10 })
  .theme(() => ({ flexWrap: 'wrap', flex: '0 1 auto', minWidth: 0 }))

const StripTitle = txt
  .config({ name: 'BlogStripTitle' })
  .attrs({ tag: 'h2' })
  .theme((_t, m) => ({ margin: 0, fontFamily: font.sans, fontSize: 17, lineHeight: 1.35, fontWeight: weight.medium, color: tone(m, 'text') }))

const StripLede = txt
  .config({ name: 'BlogStripLede' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, fontFamily: font.sans, fontSize: text.small.size, lineHeight: text.small.lineHeight, color: tone(m, 'mist') }))

/** `.b-sub` — "Get new posts": the feed and GitHub releases (and the newsletter once it opens), on one line. */
export function SubscribeBand(props: { copy: BlogChannel; level?: 'h2' | 'h3' | undefined }) {
  const s = props.copy.subscribe
  return (
    <Strip tag="aside" aria-label={s.title}>
      <StripText>
        <StripTitle tag={props.level ?? 'h2'}>{s.title}</StripTitle>
        <StripLede>{renderInline(s.text)}</StripLede>
      </StripText>
      <StripActions>
        <For each={s.links} by={(l) => l.href}>
          {(l) => <Pill href={l.href}>{l.label}</Pill>}
        </For>
      </StripActions>
    </Strip>
  )
}

/** `.bp-cta` — the closing card after a post: one line, one solid link. */
export function EndCard(props: { title: string; text: string; link: { label: string; href: string } }) {
  return (
    <Strip state="hot" tag="aside" aria-label={props.title}>
      <StripText>
        <StripTitle>{props.title}</StripTitle>
        <StripLede>{props.text}</StripLede>
      </StripText>
      <Pill href={props.link.href} variant="solid">
        {props.link.label}
      </Pill>
    </Strip>
  )
}

/** Vertical stack with the kit's gap. */
export const Stack = el.config({ name: 'BlogStack' }).attrs({ block: true, contentAlignX: 'block', gap: 20 })

