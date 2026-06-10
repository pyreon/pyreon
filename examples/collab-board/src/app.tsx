import { QueryClient, QueryClientProvider } from '@pyreon/query'
import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
import { Toaster } from '@pyreon/toast'
import { BoardListRoute } from './routes/board-list'
import { BoardRoute } from './routes/board'

// Two routes, hash mode (the router default — no SPA-fallback server config
// needed, works under `vite dev`/`preview`/Playwright unchanged). The `:id` is
// the board = the CRDT room.
const router = createRouter([
  { path: '/', component: BoardListRoute, name: 'home' },
  { path: '/board/:id', component: BoardRoute, name: 'board' },
])

// @pyreon/query owns the SERVER-owned "envelope" (the board list — see
// routes/board-list). @pyreon/sync owns the live collaborative board contents.
// Different sources of truth, different packages — never the same data in both.
const queryClient = new QueryClient()

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router}>
        <RouterView />
        {/* Connection-status toasts render here (see sync/board-doc → Toolbar). */}
        <Toaster position="bottom-right" />
      </RouterProvider>
    </QueryClientProvider>
  )
}
