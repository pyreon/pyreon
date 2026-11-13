import { blog } from '../../blog'

/** /blog/<slug> — one page per published post. */
export const getStaticPaths = blog.postPaths
export default blog.PostPage
