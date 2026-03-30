import { HeadProvider } from '@pyreon/head/provider'
import { createRouter, RouterLink, RouterProvider, RouterView } from '@pyreon/router'
import { About } from './pages/About'
import { Advanced } from './pages/Advanced'
import { Home } from './pages/Home'
import { Showcase } from './pages/Showcase'

const router = createRouter([
  { path: '/', component: Home, name: 'home' },
  { path: '/showcase', component: Showcase, name: 'showcase' },
  { path: '/advanced', component: Advanced, name: 'advanced' },
  { path: '/about', component: About, name: 'about' },
])

export function App() {
  return (
    <HeadProvider>
      <RouterProvider router={router}>
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
      </RouterProvider>
    </HeadProvider>
  )
}
