import type { Props } from '@pyreon/core'
import { HeadProvider } from '@pyreon/head/provider'
import { RouterLink, RouterView } from '@pyreon/router'
import '../style.css'

export function layout(_props: Props) {
  return (
    <HeadProvider>
      <div id="layout">
        <header>
          <h1>Pyreon Playground</h1>
          <nav>
            <RouterLink to="/">Home</RouterLink>
            <RouterLink to="/showcase">Showcase</RouterLink>
            <RouterLink to="/advanced">Advanced</RouterLink>
            <RouterLink to="/about">About</RouterLink>
          </nav>
        </header>
        <main>
          <RouterView />
        </main>
      </div>
    </HeadProvider>
  )
}
