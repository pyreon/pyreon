// Side-effect import — populates the collection registry, which the SSG
// render (and the static-path enumeration) reads through `getCollection`.
import 'virtual:zero-content/collections'
import { defineBlog } from '@pyreon/zero-content/blog'
import { PyreonNotFound } from '../components/PyreonNotFound'
import { BLOG_DESCRIPTION, BLOG_FEED, BLOG_TITLE, NEWSLETTER_ACTION, SITE_ORIGIN } from './site'

/**
 * pyreon.dev/blog — `@pyreon/zero-content/blog` over the `blog` collection
 * in content.config.ts. The files under `src/routes/(site)/blog/` are the
 * index, its pages, a post and a tag page; everything they show is computed
 * from the PUBLISHED posts.
 */
export const blog = defineBlog({
  siteUrl: SITE_ORIGIN,
  title: BLOG_TITLE,
  heading: 'Blog',
  description: BLOG_DESCRIPTION,
  feedPath: BLOG_FEED,
  language: 'en',
  // Fixed locale + UTC (the module's default) so SSG and hydration agree.
  locale: 'en-GB',
  pageSize: 10,
  authors: {
    vit: { name: 'Vít Bokisch', url: 'https://github.com/vitbokisch' },
  },
  defaultAuthor: 'vit',
  publisher: { name: 'Pyreon', url: '/' },
  // Every cover is rendered at this size (docs/README.md → Blog).
  coverSize: { width: 1600, height: 840 },
  // The docs typography, so code, tables and callouts look like the docs.
  bodyClass: 'docs-content vp-doc pyreon-blog-post__body',
  // Every post ends with its own tailored "Start building" section (the
  // right scaffold command, docs and Discord links), so no call-to-action
  // box here: after a post come the share links (default), the RSS link
  // (default, from `feedPath`) and the newsletter form, which renders
  // nothing until NEWSLETTER_ACTION is set.
  postEnd: {
    cta: false,
    newsletter: {
      action: NEWSLETTER_ACTION,
      heading: 'Get new posts by email',
      description: 'One email per post. No tracking, unsubscribe any time.',
    },
  },
  notFound: PyreonNotFound,
})
