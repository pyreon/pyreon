import { blog } from '../../../../../blog/blog'

/** `/blog/tags/<tag>` — page 1 of the published posts carrying one tag. */
export const getStaticPaths = blog.tagPaths
export default blog.TagPage
