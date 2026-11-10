import { cx, For, Show } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { RouterLink } from '@pyreon/router'
import { formatPostDate, isoDay } from './posts'
import type { BlogAuthor, BlogCover, BlogPost, BlogTag, BlogTagCount } from './posts'

// ─── Blog components ──────────────────────────────────────────────────────
//
// Plain, data-in components. Every class is `pyreon-blog-…`; the optional
// stylesheet `@pyreon/zero-content/blog.css` styles them with zero
// specificity and CSS variables that fall back to the host's colours, so a
// site restyles them with ordinary rules — or replaces any of them, since
// the routes only compose these from the queries.
//
// They render static data (a post does not change while its page is up),
// so props are read directly; conditional parts use `<Show>` with an
// accessor child so an absent value is never dereferenced.

/** Intrinsic size of cover images — sets `width`/`height` to avoid layout shift. */
export interface CoverSize {
  width: number
  height: number
}

export interface CoverImageProps {
  cover: BlogCover
  class: string
  size?: CoverSize | undefined
  /** `'lazy'` for cards below the fold; the post cover loads eagerly. */
  loading?: 'lazy' | 'eager' | undefined
}

/**
 * A post's cover `<img>`. A plain image, not zero's `<Image>`: covers are
 * arbitrary URLs (a file in `public/` or an absolute URL) whose size the
 * blog only knows when `coverSize` is configured, and `<Image>` needs a
 * `?optimize` import or both dimensions. (Exempted from
 * `pyreon/prefer-zero-image` in .pyreonlintrc.json for this reason.)
 */
export function CoverImage(props: CoverImageProps): VNodeChild {
  return (
    <img
      class={props.class}
      src={props.cover.src}
      alt={props.cover.alt}
      width={props.size?.width}
      height={props.size?.height}
      loading={props.loading ?? 'lazy'}
      decoding="async"
    />
  )
}

export interface PostDateProps {
  date: Date
  locale?: string | undefined
}

/** `<time>` with the machine-readable day and a localised label. */
export function PostDate(props: PostDateProps): VNodeChild {
  return <time datetime={isoDay(props.date)}>{formatPostDate(props.date, props.locale)}</time>
}

export interface TagListProps {
  tags: readonly (BlogTag | BlogTagCount)[]
  /** Accessible name of the list. Default `Tags`. */
  label?: string | undefined
  class?: string | undefined
}

/** Links to tag pages, with post counts when the tags carry them. */
export function TagList(props: TagListProps): VNodeChild {
  return (
    <Show when={props.tags.length > 0}>
      {() => (
        <ul class={props.class ?? 'pyreon-blog-tags'} aria-label={props.label ?? 'Tags'}>
          <For each={[...props.tags]} by={(tag) => tag.slug}>
            {(tag) => (
              <li class="pyreon-blog-tags__item">
                <RouterLink to={tag.url} class="pyreon-blog-tag" rel="tag">
                  <span class="pyreon-blog-tag__name">#{tag.name}</span>
                  <Show when={'count' in tag}>
                    {() => <span class="pyreon-blog-tag__count">{(tag as BlogTagCount).count}</span>}
                  </Show>
                </RouterLink>
              </li>
            )}
          </For>
        </ul>
      )}
    </Show>
  )
}

export interface BylineProps {
  authors: readonly BlogAuthor[]
}

/** "Ada Lovelace and Grace Hopper", each linked when the author has a URL. */
export function Byline(props: BylineProps): VNodeChild {
  return (
    <span class="pyreon-blog-byline">
      <For each={[...props.authors]} by={(author) => author.name}>
        {(author) => (
          <span class="pyreon-blog-byline__author">
            <Show when={author.url !== undefined} fallback={author.name}>
              {() => (
                <RouterLink to={author.url ?? '/'} rel="author">
                  {author.name}
                </RouterLink>
              )}
            </Show>
          </span>
        )}
      </For>
    </span>
  )
}

export interface PostMetaProps {
  post: BlogPost
  locale?: string | undefined
  /** Show the byline. Default `true`. */
  byline?: boolean | undefined
}

/** Date, byline and reading time of a post, in one line. */
export function PostMeta(props: PostMetaProps): VNodeChild {
  return (
    <p class="pyreon-blog-meta">
      <Show when={props.byline !== false && props.post.authors.length > 0}>
        {() => <Byline authors={props.post.authors} />}
      </Show>
      <span class="pyreon-blog-meta__date">
        <PostDate date={props.post.date} locale={props.locale} />
      </span>
      <Show when={props.post.updated !== undefined}>
        {() => (
          <span class="pyreon-blog-meta__updated">
            Updated <PostDate date={props.post.updated as Date} locale={props.locale} />
          </span>
        )}
      </Show>
      <span class="pyreon-blog-meta__reading">{props.post.readingMinutes} min read</span>
    </p>
  )
}

export interface PostCardProps {
  post: BlogPost
  locale?: string | undefined
  coverSize?: CoverSize | undefined
}

/** One post in a listing: cover, date, title, description, tags. */
export function PostCard(props: PostCardProps): VNodeChild {
  return (
    <article class="pyreon-blog-card">
      <RouterLink to={props.post.url} class="pyreon-blog-card__link">
        <Show when={props.post.cover !== undefined}>
          {() => (
            <CoverImage
              cover={props.post.cover as BlogCover}
              class="pyreon-blog-card__cover"
              size={props.coverSize}
            />
          )}
        </Show>
        <div class="pyreon-blog-card__text">
          <PostMeta post={props.post} locale={props.locale} byline={false} />
          <h2 class="pyreon-blog-card__title">{props.post.title}</h2>
          <p class="pyreon-blog-card__description">{props.post.description}</p>
        </div>
      </RouterLink>
      <TagList tags={props.post.tags} class="pyreon-blog-tags pyreon-blog-card__tags" />
    </article>
  )
}

export interface PostListProps {
  posts: readonly BlogPost[]
  locale?: string | undefined
  coverSize?: CoverSize | undefined
  /** Shown when there are no posts. Default `No posts yet.` */
  empty?: VNodeChild
}

/** A list of post cards, newest first as given. */
export function PostList(props: PostListProps): VNodeChild {
  return (
    <Show
      when={props.posts.length > 0}
      fallback={<p class="pyreon-blog-empty">{props.empty ?? 'No posts yet.'}</p>}
    >
      {() => (
        <ol class="pyreon-blog-list">
          <For each={[...props.posts]} by={(post) => post.slug}>
            {(post) => (
              <li class="pyreon-blog-list__item">
                <PostCard post={post} locale={props.locale} coverSize={props.coverSize} />
              </li>
            )}
          </For>
        </ol>
      )}
    </Show>
  )
}

export interface PostHeaderProps {
  post: BlogPost
  locale?: string | undefined
  /** Back link above the title, e.g. `{ href: '/blog', label: 'All posts' }`. */
  back?: { href: string; label: string } | undefined
  /** Only shown while previewing an unpublished post in dev. */
  status?: 'draft' | 'scheduled' | undefined
}

/** Title, byline, date, reading time and tags of a post. */
export function PostHeader(props: PostHeaderProps): VNodeChild {
  return (
    <header class="pyreon-blog-post__header">
      <Show when={props.back !== undefined}>
        {() => (
          <RouterLink to={props.back?.href ?? '/'} class="pyreon-blog-post__back">
            ← {props.back?.label}
          </RouterLink>
        )}
      </Show>
      <Show when={props.status !== undefined}>
        {() => (
          <p class="pyreon-blog-status" role="note">
            {props.status === 'draft'
              ? 'Draft: not published. Only visible in development.'
              : 'Scheduled: dated in the future. Only visible in development.'}
          </p>
        )}
      </Show>
      <h1 class="pyreon-blog-post__title">{props.post.title}</h1>
      <PostMeta post={props.post} locale={props.locale} />
      <TagList tags={props.post.tags} />
    </header>
  )
}

export interface PaginationProps {
  page: number
  pageCount: number
  /** Site path of page `n` (page 1 is usually the blog index). */
  href: (page: number) => string
}

/** "← Newer posts · Page 2 of 5 · Older posts →". Renders nothing for one page. */
export function Pagination(props: PaginationProps): VNodeChild {
  return (
    <Show when={props.pageCount > 1}>
      {() => (
        <nav class="pyreon-blog-pagination" aria-label="Pagination">
          <Show when={props.page > 1}>
            {() => (
              <RouterLink to={props.href(props.page - 1)} class="pyreon-blog-pagination__newer" rel="prev">
                ← Newer posts
              </RouterLink>
            )}
          </Show>
          <span class="pyreon-blog-pagination__status" aria-current="page">
            Page {props.page} of {props.pageCount}
          </span>
          <Show when={props.page < props.pageCount}>
            {() => (
              <RouterLink to={props.href(props.page + 1)} class="pyreon-blog-pagination__older" rel="next">
                Older posts →
              </RouterLink>
            )}
          </Show>
        </nav>
      )}
    </Show>
  )
}

export interface PostNavProps {
  /** The next older post. */
  previous?: BlogPost | undefined
  /** The next newer post. */
  next?: BlogPost | undefined
}

/** Links to the previous (older) and next (newer) posts. */
export function PostNav(props: PostNavProps): VNodeChild {
  return (
    <Show when={props.previous !== undefined || props.next !== undefined}>
      {() => (
        <nav class="pyreon-blog-postnav" aria-label="More posts">
          <Show when={props.previous !== undefined}>
            {() => (
              <RouterLink
                to={(props.previous as BlogPost).url}
                class="pyreon-blog-postnav__link pyreon-blog-postnav__link--previous"
                rel="prev"
              >
                <span class="pyreon-blog-postnav__label">← Previous post</span>
                <span class="pyreon-blog-postnav__title">{(props.previous as BlogPost).title}</span>
              </RouterLink>
            )}
          </Show>
          <Show when={props.next !== undefined}>
            {() => (
              <RouterLink
                to={(props.next as BlogPost).url}
                class="pyreon-blog-postnav__link pyreon-blog-postnav__link--next"
                rel="next"
              >
                <span class="pyreon-blog-postnav__label">Next post →</span>
                <span class="pyreon-blog-postnav__title">{(props.next as BlogPost).title}</span>
              </RouterLink>
            )}
          </Show>
        </nav>
      )}
    </Show>
  )
}

export interface RelatedPostsProps {
  posts: readonly BlogPost[]
  locale?: string | undefined
  /** Heading above the list. Default `Related posts`. */
  heading?: string | undefined
}

/** A short list of related posts. Renders nothing when there are none. */
export function RelatedPosts(props: RelatedPostsProps): VNodeChild {
  return (
    <Show when={props.posts.length > 0}>
      {() => (
        <section class="pyreon-blog-related" aria-label={props.heading ?? 'Related posts'}>
          <h2 class="pyreon-blog-related__heading">{props.heading ?? 'Related posts'}</h2>
          <ul class="pyreon-blog-related__list">
            <For each={[...props.posts]} by={(post) => post.slug}>
              {(post) => (
                <li class="pyreon-blog-related__item">
                  <RouterLink to={post.url} class="pyreon-blog-related__link">
                    {post.title}
                  </RouterLink>
                  <span class="pyreon-blog-related__date">
                    <PostDate date={post.date} locale={props.locale} />
                  </span>
                </li>
              )}
            </For>
          </ul>
        </section>
      )}
    </Show>
  )
}

/** One share target: a label and a plain URL the browser opens. */
export interface ShareTarget {
  network: 'x' | 'bluesky' | 'linkedin' | 'mastodon'
  label: string
  href: string
}

/**
 * Plain share-intent URLs for X, Bluesky, LinkedIn and Mastodon — no
 * scripts, no tracking parameters. Mastodon has no central host, so its
 * link opens the share form of `mastodonInstance` (default
 * `mastodon.social`); readers on another server change the host.
 */
export function shareTargets(url: string, title: string, mastodonInstance = 'mastodon.social'): ShareTarget[] {
  const text = encodeURIComponent(title)
  const link = encodeURIComponent(url)
  const both = encodeURIComponent(`${title} ${url}`)
  const host = mastodonInstance.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  return [
    { network: 'x', label: 'X', href: `https://x.com/intent/post?text=${text}&url=${link}` },
    { network: 'bluesky', label: 'Bluesky', href: `https://bsky.app/intent/compose?text=${both}` },
    {
      network: 'linkedin',
      label: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${link}`,
    },
    { network: 'mastodon', label: 'Mastodon', href: `https://${host}/share?text=${both}` },
  ]
}

export interface ShareLinksProps {
  /** Absolute URL of the post. */
  url: string
  title: string
  mastodonInstance?: string | undefined
  /** Text before the links. Default `Share:`. */
  label?: string | undefined
}

/** Share links built as plain intent URLs (no third-party scripts). */
export function ShareLinks(props: ShareLinksProps): VNodeChild {
  const targets = shareTargets(props.url, props.title, props.mastodonInstance)
  return (
    <p class="pyreon-blog-share">
      <span class="pyreon-blog-share__label">{props.label ?? 'Share:'}</span>
      <For each={targets} by={(target) => target.network}>
        {(target) => (
          <a
            class={cx(['pyreon-blog-share__link', `pyreon-blog-share__link--${target.network}`])}
            href={target.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {target.label}
          </a>
        )}
      </For>
    </p>
  )
}

export interface NewsletterFormProps {
  /**
   * The provider's form endpoint. While it is unset (or empty) the form
   * renders NOTHING, so a site can ship the component before the account
   * exists.
   */
  action?: string | undefined
  /** Name of the email input the provider expects. Default `email`. */
  emailName?: string | undefined
  /** Extra hidden fields the provider requires (list id, tags…). */
  hidden?: Readonly<Record<string, string>> | undefined
  heading?: string | undefined
  description?: string | undefined
  /** Button text. Default `Subscribe`. */
  submitLabel?: string | undefined
}

/**
 * A plain HTML sign-up form that posts to `action` — no script, no
 * third-party embed. Works without JavaScript.
 */
export function NewsletterForm(props: NewsletterFormProps): VNodeChild {
  const hidden = Object.entries(props.hidden ?? {})
  return (
    <Show when={typeof props.action === 'string' && props.action.length > 0}>
      {() => (
        <form class="pyreon-blog-newsletter" action={props.action} method="post">
          <Show when={props.heading !== undefined}>
            {() => <p class="pyreon-blog-newsletter__heading">{props.heading}</p>}
          </Show>
          <Show when={props.description !== undefined}>
            {() => <p class="pyreon-blog-newsletter__description">{props.description}</p>}
          </Show>
          <For each={hidden} by={(field) => field[0]}>
            {(field) => <input type="hidden" name={field[0]} value={field[1]} />}
          </For>
          <span class="pyreon-blog-newsletter__row">
            <input
              class="pyreon-blog-newsletter__email"
              type="email"
              name={props.emailName ?? 'email'}
              required
              autoComplete="email"
              placeholder="you@example.com"
              aria-label="Email address"
            />
            <button class="pyreon-blog-newsletter__submit" type="submit">
              {props.submitLabel ?? 'Subscribe'}
            </button>
          </span>
        </form>
      )}
    </Show>
  )
}

export interface CallToActionLink {
  label: string
  /** An in-app path (client-side navigation) or an absolute URL. For the feed, use `PostEnd`'s `feedPath`. */
  href: string
}

export interface CallToActionProps {
  heading: string
  text?: string | undefined
  /** A shell command shown in a code block, e.g. `npm create @pyreon/zero@latest`. */
  command?: string | undefined
  links?: readonly CallToActionLink[] | undefined
}

/** A call-to-action box: heading, a line of text, an optional command and links. */
export function CallToAction(props: CallToActionProps): VNodeChild {
  return (
    <section class="pyreon-blog-cta" aria-label={props.heading}>
      <p class="pyreon-blog-cta__heading">{props.heading}</p>
      <Show when={props.text !== undefined}>{() => <p class="pyreon-blog-cta__text">{props.text}</p>}</Show>
      <Show when={props.command !== undefined}>
        {() => (
          <pre class="pyreon-blog-cta__command">
            <code>{props.command}</code>
          </pre>
        )}
      </Show>
      <Show when={(props.links ?? []).length > 0}>
        {() => (
          <p class="pyreon-blog-cta__links">
            <For each={[...(props.links ?? [])]} by={(link) => link.href}>
              {(link) => (
                <RouterLink to={link.href} class="pyreon-blog-cta__link">
                  {link.label}
                </RouterLink>
              )}
            </For>
          </p>
        )}
      </Show>
    </section>
  )
}

export interface PostEndProps {
  /** Absolute URL of the post (share links). */
  url: string
  title: string
  /** The call-to-action box; omitted or `false` renders none. */
  cta?: CallToActionProps | false | undefined
  /** Share links. Default `true`. */
  share?: boolean | { mastodonInstance?: string | undefined } | undefined
  /** Site path of the RSS feed; a "Follow via RSS" link when set. */
  feedPath?: string | undefined
  /** A newsletter sign-up form (renders nothing while its `action` is empty). */
  newsletter?: NewsletterFormProps | false | undefined
}

/**
 * The end of a post: an optional call to action, share links, a feed link
 * and a newsletter form — each one on or off. A site whose posts carry
 * their own closing turns `cta` off and keeps the rest.
 */
export function PostEnd(props: PostEndProps): VNodeChild {
  const share = props.share ?? true
  return (
    <div class="pyreon-blog-end">
      <Show when={props.cta !== undefined && props.cta !== false}>
        {() => <CallToAction {...(props.cta as CallToActionProps)} />}
      </Show>
      <Show when={share !== false}>
        {() => (
          <ShareLinks
            url={props.url}
            title={props.title}
            mastodonInstance={typeof share === 'object' ? share.mastodonInstance : undefined}
          />
        )}
      </Show>
      <Show when={props.feedPath !== undefined}>
        {() => (
          <p class="pyreon-blog-end__feed">
            <a href={props.feedPath} rel="alternate" type="application/rss+xml">
              Follow the blog via RSS
            </a>
          </p>
        )}
      </Show>
      <Show when={props.newsletter !== undefined && props.newsletter !== false}>
        {() => <NewsletterForm {...(props.newsletter as NewsletterFormProps)} />}
      </Show>
    </div>
  )
}
