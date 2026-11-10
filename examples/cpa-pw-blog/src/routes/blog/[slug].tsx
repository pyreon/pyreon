import { blog } from "../../blog"

/** /blog/<slug> — one page per published post. */
export const getStaticPaths = blog.postPaths

/**
 * Build-time ISR — revalidate every hour. The SSG plugin emits this
 * value into `dist/_pyreon-revalidate.json` keyed by every concrete
 * prerendered URL (`/blog/welcome`, `/blog/why-signals`, etc.). When a
 * managed host's deploy adapter triggers `adapter.revalidate(path)`,
 * the platform regenerates the matching HTML file on the next request.
 *
 * **Must be an inline literal** (`3600` or `false`) — the build-time
 * extractor doesn't follow identifier references or arithmetic
 * expressions. `pyreon/revalidate-not-pure-literal` catches violations
 * at lint time.
 */
export const revalidate = 3600

export default blog.PostPage
