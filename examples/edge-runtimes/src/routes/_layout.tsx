import type { Props } from '@pyreon/core'
import { RouterLink, RouterView } from '@pyreon/router'

/** Root layout — a nav + the matched page. */
export function layout(_props: Props) {
  return (
    <div id="layout">
      <nav>
        <RouterLink to="/" data-testid="nav-home">Home</RouterLink>
        <RouterLink to="/posts/1" data-testid="nav-post">Post 1</RouterLink>
        <RouterLink to="/stream" data-testid="nav-stream">Stream</RouterLink>
      </nav>
      <main>
        <RouterView />
      </main>
    </div>
  )
}
