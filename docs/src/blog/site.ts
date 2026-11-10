// Blog constants shared by the blog, the post footer and the root layout.
// Kept apart from blog.ts so the root layout does not pull the blog module
// (its pages and components) into every page.

/** Production origin — feeds, canonical URLs and OG images must be absolute. */
export const SITE_ORIGIN = 'https://pyreon.dev'
export const BLOG_TITLE = 'Pyreon blog'
export const BLOG_FEED = '/blog/rss.xml'
export const BLOG_DESCRIPTION =
  'Notes from building Pyreon: how the compiler and runtime work, measured benchmark results (losses included), and release write-ups.'

/**
 * Form action of the newsletter sign-up (the provider's subscribe endpoint).
 * Empty until the newsletter account exists — `<NewsletterForm>` renders
 * nothing while it is empty, so setting it is the only step to launch.
 */
export const NEWSLETTER_ACTION = ''
