/**
 * Entry point — demonstrates Pyreon app setup with router.
 *
 * PATTERN: mount() + RouterProvider + RouterView
 */

import { HeadProvider } from "@pyreon/head"
import { createRouter, RouterLink, RouterProvider, RouterView } from "@pyreon/router"
import { mount } from "@pyreon/runtime-dom"
import { Home } from "./pages/Home"
import { TodoDetail } from "./pages/TodoDetail"
import { TodoList } from "./pages/TodoList"
import { UserProfile } from "./pages/UserProfile"

const router = createRouter([
  { path: "/", component: Home, name: "home" },
  {
    path: "/todos",
    component: TodoList,
    name: "todos",
    loader: async () => {
      const res = await fetch("/api/todos")
      return res.json()
    },
  },
  {
    path: "/todo/:id",
    component: TodoDetail,
    name: "todo",
    loader: async ({ params }) => {
      const res = await fetch(`/api/todo/${params.id}`)
      return res.json()
    },
  },
  { path: "/user/:id", component: UserProfile, name: "user" },
])

const App = () => (
  <HeadProvider>
    <RouterProvider router={router}>
      <nav>
        <RouterLink to="/" activeClass="active">
          Home
        </RouterLink>
        <RouterLink to="/todos" activeClass="active">
          Todos
        </RouterLink>
      </nav>
      <main>
        <RouterView />
      </main>
    </RouterProvider>
  </HeadProvider>
)

mount(<App />, document.getElementById("app")!)
