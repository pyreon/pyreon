import { h } from "@pyreon/core"
import { RouterLink, RouterProvider, RouterView, createRouter } from "@pyreon/router"
import { Home } from "./pages/Home"
import { About } from "./pages/About"

const router = createRouter([
  { path: "/", component: Home, name: "home" },
  { path: "/about", component: About, name: "about" },
])

export function App() {
  return (
    <RouterProvider router={router}>
      <div id="layout">
        <header>
          <h1>Nova Playground</h1>
          <nav>
            <RouterLink to="/">Home</RouterLink>
            <RouterLink to="/about">About</RouterLink>
          </nav>
        </header>
        <main>
          <RouterView />
        </main>
      </div>
    </RouterProvider>
  )
}
