// Blog constants shared by the blog, the root layout and the build config.
// Kept apart from blog.ts so the root layout does not pull the blog module
// (its pages and components) into every page. The name and summary come from
// the content set (`_channels.json` → blog.meta); importing the one key keeps
// the rest of the blog's copy out of the root layout's chunk.
import { meta } from '../site/content/pages/channels/blog.json'

/** Production origin — feeds, canonical URLs and OG images must be absolute. */
export const SITE_ORIGIN = 'https://pyreon.dev'
export const BLOG_TITLE: string = meta.title
export const BLOG_FEED = '/blog/rss.xml'
export const BLOG_DESCRIPTION: string = meta.description
