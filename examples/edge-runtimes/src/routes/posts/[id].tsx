import { useLoaderData } from '@pyreon/router'

interface Post {
  id: number
  title: string
}

const POSTS: Post[] = [
  { id: 1, title: 'EDGE_POST_ONE' },
  { id: 2, title: 'EDGE_POST_TWO' },
]

/** Dynamic route with a loader — the data is SSR-rendered and embedded for hydration. */
export default function PostPage() {
  const post = useLoaderData<Post | null>()
  return (
    <article data-testid="post-page">
      <h1 data-testid="post-title">{post ? post.title : 'Post not found'}</h1>
    </article>
  )
}

export async function loader({ params }: { params: Record<string, string> }) {
  return POSTS.find((p) => p.id === Number(params.id)) ?? null
}
