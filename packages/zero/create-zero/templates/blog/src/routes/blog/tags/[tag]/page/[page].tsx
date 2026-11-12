import { blog } from "../../../../../blog"

/** /blog/tags/<tag>/page/2, … */
export const getStaticPaths = blog.tagPagePaths
export default blog.TagPage
