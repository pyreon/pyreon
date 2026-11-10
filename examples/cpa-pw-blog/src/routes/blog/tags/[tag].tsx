import { blog } from "../../../blog"

/** /blog/tags/<tag> — every published post with that tag. */
export const getStaticPaths = blog.tagPaths
export default blog.TagPage
