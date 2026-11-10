// Side-effect import — populates the collection registry, which the SSG
// render (and the static-path enumeration) reads through `getCollection`.
import 'virtual:zero-content/collections'
import { defineBlog } from '@pyreon/zero-content/blog'
import { PostFooter } from './PostFooter'
import { PyreonNotFound } from '../components/PyreonNotFound'
import { BLOG_DESCRIPTION, BLOG_FEED, BLOG_TITLE, SITE_ORIGIN } from './site'

/**
 * pyreon.dev/blog — `@pyreon/zero-content/blog` over the `blog` collection
 * in content.config.ts. The four files under `src/routes/blog/` are the
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
  postFooter: PostFooter,
  notFound: PyreonNotFound,
})
