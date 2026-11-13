/**
 * Blog components in real Chromium, with the optional stylesheet loaded.
 *
 * Locks what happy-dom cannot judge:
 *   - the default styles have the specificity of one class: a site's
 *     element-level base styles and resets do not break the layout, and a
 *     later one-class rule of the site wins without `!important`;
 *   - colours follow the host text colour (`currentColor`), so the muted
 *     meta line is a translucent version of whatever the site uses;
 *   - previous/next stack on a narrow column and sit side by side on a wide one;
 *   - the newsletter form renders nothing until it has an action, then is a
 *     plain form that submits there;
 *   - share links are plain anchors (no script is added to the page).
 */
import { query } from '@pyreon/test-utils'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import '../../styles/blog.css'
import {
  NewsletterForm,
  PostList,
  PostNav,
  ShareLinks,
} from '../blog/components'
import { toBlogPost } from '../blog/posts'
import type { BlogPost } from '../blog/posts'

function post(slug: string, date: string, tags: string[]): BlogPost {
  return toBlogPost(
    {
      slug,
      data: { title: `Title ${slug}`, description: `About ${slug}`, date, tags },
      headings: [],
      wordCount: 690,
      render: async () => () => null,
    },
    { basePath: '/blog', authors: {}, defaultAuthors: [], wordsPerMinute: 230 },
  )
}

const POSTS = [post('a', '2026-11-15', ['signals']), post('b', '2026-11-01', ['ssr'])]

let hostStyle: HTMLStyleElement | null = null
afterEach(() => {
  hostStyle?.remove()
  hostStyle = null
})

// This package's Node runner also picks up `*.browser.test.tsx` (under
// happy-dom, which has no layout and no CSS cascade). These assertions are
// about exactly those, so they run in the Chromium suite
// (`vitest.browser.config.ts`, the `test:browser` script) and not there.
const inRealBrowser = typeof navigator !== 'undefined' && !/HappyDOM/i.test(navigator.userAgent)

describe.runIf(inRealBrowser)('blog components in Chromium', () => {
  it('survives a site reset, and a later one-class site rule wins', async () => {
    hostStyle = document.createElement('style')
    // A typical base stylesheet loaded after the blog styles.
    hostStyle.textContent = [
      '* { margin: 0; padding: 0; }',
      'ul, ol { margin: 0 0 1rem 1.5rem; }',
      '.pyreon-blog-tag { color: rgb(200, 0, 0); }',
    ].join('\n')
    document.head.append(hostStyle)
    const { container, unmount } = mountInBrowser(<PostList posts={POSTS} />)
    await flush()
    const tag = query<HTMLElement>(container, '.pyreon-blog-tag')
    expect(getComputedStyle(tag).color).toBe('rgb(200, 0, 0)')
    // The blog's own spacing is intact despite the reset.
    expect(getComputedStyle(tag).paddingLeft).not.toBe('0px')
    const list = query<HTMLElement>(container, '.pyreon-blog-list')
    expect(getComputedStyle(list).marginLeft).toBe('0px')
    expect(getComputedStyle(list).marginTop).not.toBe('0px')
    unmount()
  })

  it('derives the muted colour from the host text colour', async () => {
    const { container, unmount } = mountInBrowser(
      <div style="color: rgb(10, 20, 30)">
        <PostList posts={POSTS} />
      </div>,
    )
    await flush()
    const meta = query<HTMLElement>(container, '.pyreon-blog-meta')
    const color = getComputedStyle(meta).color
    // color-mix(currentColor 62%, transparent) → same channels, partial alpha.
    expect(color).toMatch(/^(rgba\(10, 20, 30, 0\.6\d*\)|color\(srgb 0\.039\d* 0\.078\d* 0\.117\d* \/ 0\.6\d*\))$/)
    expect(container.querySelector('.pyreon-blog-meta__reading')?.textContent).toBe('3 min read')
    unmount()
  })

  it('previous/next sit side by side when wide and stack when narrow', async () => {
    const [newer, older] = POSTS as [BlogPost, BlogPost]
    const layout = async (width: number) => {
      const { container, unmount } = mountInBrowser(
        <div style={`width: ${width}px`}>
          <PostNav previous={older} next={newer} />
        </div>,
      )
      await flush()
      const prev = query<HTMLElement>(container, '.pyreon-blog-postnav__link--previous')
      const next = query<HTMLElement>(container, '.pyreon-blog-postnav__link--next')
      const result = { prevTop: prev.getBoundingClientRect().top, nextTop: next.getBoundingClientRect().top }
      unmount()
      return result
    }
    const wide = await layout(800)
    expect(wide.nextTop).toBe(wide.prevTop)
    const narrow = await layout(300)
    expect(narrow.nextTop).toBeGreaterThan(narrow.prevTop)
  })

  it('the newsletter form renders nothing without an action, then posts to it', async () => {
    const empty = mountInBrowser(
      <div class="host">
        <NewsletterForm action="" />
        <NewsletterForm />
      </div>,
    )
    await flush()
    expect(empty.container.querySelector('form')).toBeNull()
    empty.unmount()

    const { container, unmount } = mountInBrowser(
      <NewsletterForm
        action="https://newsletter.example/subscribe"
        emailName="EMAIL"
        hidden={{ list: 'pyreon' }}
        heading="Get new posts by email"
      />,
    )
    await flush()
    const form = query<HTMLFormElement>(container, 'form')
    expect(form.action).toBe('https://newsletter.example/subscribe')
    expect(form.method).toBe('post')
    const email = query<HTMLInputElement>(form, 'input[type="email"]')
    expect(email.name).toBe('EMAIL')
    expect(email.required).toBe(true)
    // Required + empty → the browser blocks submission.
    expect(form.checkValidity()).toBe(false)
    email.value = 'reader@example.com'
    expect(form.checkValidity()).toBe(true)
    expect(new FormData(form).get('list')).toBe('pyreon')
    unmount()
  })

  it('share links are plain anchors with encoded intent URLs', async () => {
    const scriptsBefore = document.scripts.length
    const { container, unmount } = mountInBrowser(
      <ShareLinks url="https://example.dev/blog/a?x=1" title="Signals & you" />,
    )
    await flush()
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.href)
    expect(hrefs).toEqual([
      'https://x.com/intent/post?text=Signals%20%26%20you&url=https%3A%2F%2Fexample.dev%2Fblog%2Fa%3Fx%3D1',
      'https://bsky.app/intent/compose?text=Signals%20%26%20you%20https%3A%2F%2Fexample.dev%2Fblog%2Fa%3Fx%3D1',
      'https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fexample.dev%2Fblog%2Fa%3Fx%3D1',
      'https://mastodon.social/share?text=Signals%20%26%20you%20https%3A%2F%2Fexample.dev%2Fblog%2Fa%3Fx%3D1',
    ])
    for (const a of container.querySelectorAll('a')) expect(a.rel).toBe('noopener noreferrer')
    expect(document.scripts.length).toBe(scriptsBefore)
    unmount()
  })
})
