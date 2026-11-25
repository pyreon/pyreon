import { RouterLink, useLoaderData } from '@pyreon/router'
import { signal } from '@pyreon/reactivity'

export async function loader() {
  return { title: 'APP_LOADER_TITLE' }
}

// A full-app page: the router hydrates it, and its button only works once the
// app has started.
export default function Home() {
  const data = useLoaderData<{ title: string }>()
  const clicks = signal(0)
  return (
    <main data-testid="app-page">
      <h1>{data()?.title}</h1>
      <button type="button" data-testid="app-button" onClick={() => clicks.set(clicks() + 1)}>
        app:{clicks()}
      </button>
      <RouterLink to="/static" data-testid="to-static">
        static
      </RouterLink>
      <RouterLink to="/about" data-testid="to-about">
        about
      </RouterLink>
    </main>
  )
}
