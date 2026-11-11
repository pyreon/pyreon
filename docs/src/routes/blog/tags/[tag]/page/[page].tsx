import { blog } from '../../../../../blog/blog'

/** `/blog/tags/<tag>/page/<n>` — pages 2..n of a tag. */
export const getStaticPaths = blog.tagPagePaths
export default blog.TagPage
