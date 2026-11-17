import { blog } from '../../../blog'

/** /blog/page/2, /blog/page/3, … */
export const getStaticPaths = blog.pagePaths
export default blog.IndexPage
