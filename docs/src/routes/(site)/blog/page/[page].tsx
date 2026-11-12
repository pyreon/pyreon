import { blog } from '../../../../blog/blog'

/** `/blog/page/<n>` — pages 2..n of the index. */
export const getStaticPaths = blog.pagePaths
export default blog.IndexPage
