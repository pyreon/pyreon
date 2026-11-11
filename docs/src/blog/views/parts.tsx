import { For, Show } from '@pyreon/core'
import type { BlogPost, BlogTag, BlogTagCount } from '@pyreon/zero-content/blog'
import { formatPostDate, isoDay } from '@pyreon/zero-content/blog'
import { fill } from '../../site/content/channels'
import type { BlogChannel, Cta } from '../../site/content/types-site'
import { el, focusRing, tone, txt, type LinkAttrs } from '../../site/kit/bases'
import { GlowCard } from '../../site/kit/cards'
import { Pill } from '../../site/kit/controls'
import { AutoGrid } from '../../site/kit/layout'
import { Eyebrow, Heading, Lede, renderInline } from '../../site/kit/type'
import { font, motion, radius, text, weight } from '../../site/theme'

/**
 * Pieces the blog's index, tag and post views share: the meta line, the tag
 * chips, a post card, the pager and the subscribe band. Everything here
 * renders on the server only (blog pages are static HTML).
 */

/** Dates print in this locale, always in UTC (the same day on every machine). */
export const BLOG_LOCALE = 'en-GB'

const MetaRow = el
  .config({ name: 'BlogMeta' })
  .attrs({ tag: 'p', block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 10 })
  .theme((_t, m) => ({
    margin: 0,
    flexWrap: 'wrap',
    fontFamily: font.mono,
    fontSize: text.mono.size,
    lineHeight: 1.6,
    color: tone(m, 'fog'),
  }))

const Dot = txt.config({ name: 'BlogMetaDot' }).attrs({ tag: 'span', 'aria-hidden': 'true' })

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

const TagRow = el
  .config({ name: 'BlogTagRow' })
  .attrs({ tag: 'ul', block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 6 })
  .theme(() => ({ flexWrap: 'wrap', listStyle: 'none', margin: 0, padding: 0 }))

const TagLink = el
  .config({ name: 'BlogTag' })
  .attrs<LinkAttrs>({ tag: 'a', contentDirection: 'inline', contentAlignY: 'center', gap: 6 })
  .theme((_t, m) => ({
    height: 32,
    paddingLeft: 14,
    paddingRight: 14,
    borderRadius: radius.pill,
    border: '1px solid',
    borderColor: tone(m, 'line2'),
    color: tone(m, 'mist'),
    fontFamily: font.mono,
    fontSize: text.mono.size,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    transition: `border-color ${motion.hover}, color ${motion.hover}`,
    hover: { borderColor: tone(m, 'lineHover'), color: tone(m, 'text') },
    focus: focusRing(m),
    extendCss: `&[aria-current] { border-color: ${tone(m, 'currentBorder')}; background-color: ${tone(m, 'currentFill')}; color: ${tone(m, 'text')}; }`,
  }))

const TagCount = txt
  .config({ name: 'BlogTagCount' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ color: tone(m, 'fog') }))

/**
 * Tag links as chips, each with its post count when it has one; with `all`,
 * an "every post" chip first. The current one carries `aria-current="page"`.
 * Plain links: on a static page a tag is a page of its own, not a filter.
 */
export function TagChips(props: {
  label: string
  tags: readonly (BlogTag | BlogTagCount)[]
  all?: { label: string; href: string } | undefined
  current?: string | undefined
}) {
  const all = props.all
  return (
    <nav aria-label={props.label}>
      <TagRow>
        {all ? (
          <li>
            <TagLink href={all.href} aria-current={props.current === undefined ? 'page' : undefined}>
              {all.label}
            </TagLink>
          </li>
        ) : null}
        <For each={props.tags} by={(t) => t.slug}>
          {(t) => (
            <li>
              <TagLink href={t.url} rel="tag" aria-current={props.current === t.slug ? 'page' : undefined}>
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

const TagText = txt
  .config({ name: 'BlogTagText' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, fontFamily: font.mono, fontSize: text.mono.size, lineHeight: 1.6, color: tone(m, 'fog') }))

/** A post's tags as text (inside a card that is one link, so they cannot be links). */
export function TagLine(props: { tags: readonly BlogTag[] }) {
  return <TagText>{props.tags.map((t) => `#${t.name}`).join('  ')}</TagText>
}

/** "Read the post →" inside a card that is one link. */
export const ReadMore = txt
  .config({ name: 'BlogReadMore' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ fontFamily: font.mono, fontSize: text.ui.size, color: tone(m, 'accent'), marginTop: 6 }))

/** One post in a grid: the whole card is the link. */
export function PostCard(props: { post: BlogPost; label?: string | undefined; level?: 'h2' | 'h3' | undefined }) {
  const p = props.post
  return (
    <GlowCard href={p.url} padding="compact">
      <Show when={() => props.label !== undefined}>
        <Eyebrow>{props.label ?? ''}</Eyebrow>
      </Show>
      <PostMetaLine post={p} />
      <Heading tag={props.level ?? 'h3'} size="step">
        {p.title}
      </Heading>
      <Lede size="small">{p.description}</Lede>
      <TagLine tags={p.tags} />
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

const BandRow = el
  .config({ name: 'BlogSubscribe' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignX: 'spaceBetween', contentAlignY: 'center', gap: 18 })
  .theme(() => ({ flexWrap: 'wrap' }))

const BandText = el.config({ name: 'BlogSubscribeText' }).attrs({ block: true, gap: 6 }).theme(() => ({ flexGrow: 1, flexBasis: 320, minWidth: 0, maxWidth: 640 }))

const BandTitle = txt
  .config({ name: 'BlogSubscribeTitle' })
  .attrs({ tag: 'h2' })
  .theme((_t, m) => ({ margin: 0, fontFamily: font.sans, fontSize: text.step.size, lineHeight: text.step.lineHeight, fontWeight: weight.medium, color: tone(m, 'text') }))

/** "Get new posts": the feed, the newsletter page and GitHub releases. */
export function SubscribeBand(props: { copy: BlogChannel }) {
  const s = props.copy.subscribe
  return (
    <GlowCard state="hot">
      <BandRow>
        <BandText>
          <BandTitle>{s.title}</BandTitle>
          <Lede size="small">{renderInline(s.text)}</Lede>
        </BandText>
        <ActionRow>
          <For each={s.links} by={(l) => l.href}>
            {(l) => <Pill href={l.href}>{l.label}</Pill>}
          </For>
        </ActionRow>
      </BandRow>
    </GlowCard>
  )
}

/** Vertical stack with the kit's gap. */
export const Stack = el.config({ name: 'BlogStack' }).attrs({ block: true, contentAlignX: 'block', gap: 20 })

