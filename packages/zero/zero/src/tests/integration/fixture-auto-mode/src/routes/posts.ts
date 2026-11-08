import { h } from '@pyreon/core'

// A loader — mode 'auto' infers 'ssr', so this route must NOT prerender.
export default function Posts() {
  return h('h1', null, 'AUTO_INFERRED_SSR_POSTS')
}

export async function loader() {
  return { posts: [] }
}
