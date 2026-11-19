import { RouterLink, useLoaderData } from '@pyreon/router'
import { island } from '@pyreon/server/client'

// Islands-only: static HTML plus its islands. The browser never starts the
// app here, so the code below (and this marker string) must never load.
export const hydrate = 'islands'

export async function loader() {
  return { title: 'STATIC_LOADER_TITLE' }
}

const Counter = island(() => import('../islands/Counter'), { name: 'Counter', hydrate: 'load' })

export default function StaticPage() {
  const data = useLoaderData<{ title: string }>()
  return (
    <main data-testid="static-page" data-route-module="STATIC_ROUTE_MODULE_MARKER">
      <h1>{data?.title}</h1>
      <Counter />
      <RouterLink to="/" data-testid="to-app">
        home
      </RouterLink>
    </main>
  )
}
