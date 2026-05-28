import { RouterView } from '@pyreon/router'
import { Toaster } from '@pyreon/toast'
import { QueryClient, QueryClientProvider } from '@pyreon/query'
import { installChatPersistence } from '../lib/chat-store'
import ChannelRail from '../components/ChannelRail'

// Persist last-visited channel app-wide so reload lands the user back
// where they were. Matches the kanban audit pattern (W15 lesson —
// scoping to a single route loses writes on other routes).
installChatPersistence()

// One QueryClient shared across the app.
const client = new QueryClient()

export function layout() {
  return (
    <QueryClientProvider client={client}>
      <div class="chat-app">
        <ChannelRail />
        <main class="chat-main" data-testid="chat-main">
          <RouterView />
        </main>
        <Toaster position="bottom-right" />
      </div>
    </QueryClientProvider>
  )
}
