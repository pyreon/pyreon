// A loader route with a synchronous `loaderKey` + literal gcTime/meta — the
// shape that used to force a static import of the whole module.
export default function Posts() {
  return 'POSTS_ROUTE_MODULE_MARKER'
}
export async function loader() {
  return { posts: [] }
}
export function loaderKey(ctx: { params: Record<string, string> }) {
  return `posts:${JSON.stringify(ctx.params)}`
}
export const gcTime = 1000
export const meta = { title: 'Posts' }
