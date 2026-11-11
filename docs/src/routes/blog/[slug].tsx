import { blog } from '../../blog/blog'

/**
 * `/blog/<slug>` — one page per PUBLISHED post. Drafts and posts dated
 * after the build are not in the bundle, so they get no page and the URL
 * falls through to the not-found view on the client as well.
 */
export const getStaticPaths = blog.postPaths
export default blog.PostPage
