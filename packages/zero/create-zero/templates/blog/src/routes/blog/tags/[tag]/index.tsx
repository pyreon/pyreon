import { blog } from '../../../../blog'

/** /blog/tags/<tag> — page 1 of the published posts with that tag. */
export const getStaticPaths = blog.tagPaths
export default blog.TagPage
