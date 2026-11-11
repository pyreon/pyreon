import { h } from '@pyreon/core'

// A loader keeps the app on the server pipeline (a hybrid build).
export default function Posts() {
  return h('h1', null, 'RESERVED_FIXTURE_SSR_POSTS')
}

export async function loader() {
  return { posts: [] }
}
