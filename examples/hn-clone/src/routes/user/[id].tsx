import { useQuery } from '@pyreon/query'
import { useHead } from '@pyreon/head'
import { useRoute } from '@pyreon/router'
import { fetchUser } from '../../lib/api'

// Client-side `useQuery` by an arbitrary user `id` — not enumerable at build
// time, so under `mode: 'ssg'` this dynamic route is silently skipped without a
// `getStaticPaths` (direct load / refresh would 404). `renderMode: 'spa'` ships
// a CSR shell that works for any `id`. ('ssr'/'isr' are build-errors in SSG.)
export const renderMode = 'spa'

export default function UserPage() {
  const route = useRoute()
  const id = () => route().params.id ?? ''

  const query = useQuery(() => ({
    queryKey: ['user', id()],
    queryFn: () => fetchUser(id()),
  }))

  useHead(() => ({ title: `${id()} | Hacker News (Pyreon)` }))

  return (
    <section class="user-detail">
      {() => {
        if (query.isPending()) return <div class="feed-state">Loading user…</div>
        if (query.isError())
          return <div class="feed-state error">Failed to load: {String(query.error())}</div>
        const user = query.data()
        if (!user) return <div class="feed-state">User not found.</div>

        return (
          <div class="user-card">
            <h1 class="user-name">{user.id}</h1>
            <dl class="user-stats">
              <dt>Created</dt>
              <dd>{user.created}</dd>
              <dt>Karma</dt>
              <dd>{user.karma}</dd>
              {user.about && (
                <>
                  <dt>About</dt>
                  <dd innerHTML={user.about} />
                </>
              )}
            </dl>
          </div>
        )
      }}
    </section>
  )
}
