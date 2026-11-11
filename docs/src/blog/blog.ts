// Side-effect import — populates the collection registry, which the SSG
// render (and the static-path enumeration) reads through `getCollection`.
import 'virtual:zero-content/collections'
import { defineBlog } from '@pyreon/zero-content/blog'
import { PyreonNotFound } from '../components/PyreonNotFound'
import { BLOG_DESCRIPTION, BLOG_FEED, BLOG_TITLE, SITE_ORIGIN } from './site'
import { BlogList } from './views/BlogListView'
import { BlogPostPage } from './views/BlogPostView'
import { BLOG_LOCALE } from './views/parts'

/**
 * pyreon.dev/blog — `@pyreon/zero-content/blog` over the `blog` collection
 * in content.config.ts. The files under `src/routes/(site)/blog/` are the
 * index, its pages, a post and a tag page; everything they show is computed
 * from the PUBLISHED posts. The module decides what exists and writes the
 * head tags; `views` draws each page type in the site's kit (`views/`).
 */
export const blog = defineBlog({
  siteUrl: SITE_ORIGIN,
  title: BLOG_TITLE,
  description: BLOG_DESCRIPTION,
  feedPath: BLOG_FEED,
  language: 'en',
  // Fixed locale + UTC (the module's default) so every build prints the same day.
  locale: BLOG_LOCALE,
  pageSize: 10,
  authors: {
    vit: { name: 'Vít Bokisch', url: 'https://github.com/vitbokisch' },
  },
  defaultAuthor: 'vit',
  publisher: { name: 'Pyreon', url: '/' },
  // Every cover is rendered at this size (docs/README.md → Blog).
  coverSize: { width: 1600, height: 840 },
  views: { index: BlogList, tag: BlogList, post: BlogPostPage },
  notFound: PyreonNotFound,
})
